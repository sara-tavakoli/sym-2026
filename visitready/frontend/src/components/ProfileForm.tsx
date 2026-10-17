import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPut } from "@/lib/api";
import { meKey } from "@/lib/auth";
import { errorMessage, visitKey } from "@/lib/hooks";
import type { Gender, ProfileUpdate, PublicUser } from "@/lib/types";

const GENDERS: { v: Gender; l: string }[] = [
  { v: "", l: "Select (optional)" }, { v: "female", l: "Female" }, { v: "male", l: "Male" },
  { v: "non_binary", l: "Non-binary" }, { v: "other", l: "Other" }, { v: "prefer_not_to_say", l: "Prefer not to say" },
];

function validate(p: ProfileUpdate): Partial<Record<keyof ProfileUpdate, string>> {
  const e: Partial<Record<keyof ProfileUpdate, string>> = {};
  if (p.full_name.trim().length < 2) e.full_name = "Enter your full name";
  const d = p.date_of_birth ? new Date(p.date_of_birth) : null;
  if (!d || Number.isNaN(d.getTime()) || d >= new Date() || d.getFullYear() < new Date().getFullYear() - 120) e.date_of_birth = "Enter a real date of birth";
  const digits = p.mobile.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) e.mobile = "Enter a valid mobile number, e.g. 0412 345 678";
  return e;
}

/** "Complete your profile" — only the details a booking needs. Shows only missing fields unless editing. */
export default function ProfileForm({ user, editAll, onSaved, onCancel }: { user: PublicUser; editAll: boolean; onSaved: (u: PublicUser) => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileUpdate>({ ...user.profile });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const isNew = user.missing_fields.length === 3;
  const show = (f: keyof ProfileUpdate) => editAll || isNew || user.missing_fields.includes(f);
  const showOptional = editAll || isNew;
  const errors = validate(form);
  const visibleErrors = Object.entries(errors).filter(([k]) => show(k as keyof ProfileUpdate));
  const set = <K extends keyof ProfileUpdate>(k: K, v: ProfileUpdate[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const u = await apiPut<PublicUser>("/auth/profile", form);
      qc.setQueryData(meKey, u);
      qc.invalidateQueries({ queryKey: visitKey(u.user_id) });
      toast.success("Profile saved");
      onSaved(u);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const err = (k: keyof ProfileUpdate) => touched && errors[k] && <p data-testid={`profile-${k}-error`} className="text-xs text-[#B42318]">{errors[k]}</p>;

  return (
    <div data-testid="profile-form" className="rounded-3xl frost-card p-5 sm:p-7 max-w-2xl">
      <h2 className="text-2xl text-ink">{editAll ? "Edit your details" : isNew ? "Complete your profile" : "A couple more details"}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {editAll || isNew ? "Just what the clinic needs to identify you. Medical information is asked for separately, when you prepare." : "We only need what's missing for this booking."}
      </p>

      <form className="mt-5 grid sm:grid-cols-2 gap-4" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-ink">Email address</Label>
          <p data-testid="profile-email" className="h-11 rounded-md border border-line bg-sand/60 px-3 flex items-center text-sm text-ink-muted">{user.email}</p>
        </div>
        {show("full_name") && (
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="pf-name" className="text-ink">Full name <span className="text-terracotta">*</span></Label>
            <Input id="pf-name" data-testid="profile-full-name-input" autoComplete="name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className="h-11 bg-white" />
            {err("full_name")}
          </div>
        )}
        {show("date_of_birth") && (
          <div className="space-y-1.5">
            <Label htmlFor="pf-dob" className="text-ink">Date of birth <span className="text-terracotta">*</span></Label>
            <Input id="pf-dob" data-testid="profile-dob-input" type="date" autoComplete="bday" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className="h-11 bg-white" />
            {err("date_of_birth")}
          </div>
        )}
        {show("mobile") && (
          <div className="space-y-1.5">
            <Label htmlFor="pf-mobile" className="text-ink">Mobile phone <span className="text-terracotta">*</span></Label>
            <Input id="pf-mobile" data-testid="profile-mobile-input" type="tel" autoComplete="tel" placeholder="0412 345 678" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} className="h-11 bg-white" />
            {err("mobile")}
          </div>
        )}
        {showOptional && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="pf-pref" className="text-ink">Preferred name <span className="text-ink-muted font-normal">(optional)</span></Label>
              <Input id="pf-pref" data-testid="profile-preferred-name-input" value={form.preferred_name} onChange={(e) => set("preferred_name", e.target.value)} className="h-11 bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-gender" className="text-ink">Gender <span className="text-ink-muted font-normal">(optional)</span></Label>
              <select id="pf-gender" data-testid="profile-gender-select" value={form.gender} onChange={(e) => set("gender", e.target.value as Gender)} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-eucalypt/30">
                {GENDERS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
              </select>
            </div>
          </>
        )}

        <p className="sm:col-span-2 flex gap-2 rounded-2xl bg-eucalypt-soft/60 p-3 text-xs text-ink-muted leading-relaxed">
          <ShieldCheck className="size-4 shrink-0 text-eucalypt" />
          Used only to identify you for appointments with fictional demo clinics. We don't ask for Medicare, address or medical history here.
        </p>
        {touched && visibleErrors.length > 0 && <p className="sm:col-span-2 text-sm text-[#B42318]" role="alert">Please fix the highlighted fields.</p>}
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Button type="submit" data-testid="profile-save-btn" disabled={busy} className="h-11 rounded-full px-6 text-[15px]">
            {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save and continue"}
          </Button>
          {onCancel && <Button type="button" variant="ghost" data-testid="profile-cancel-btn" onClick={onCancel} className="h-11 rounded-full">Cancel</Button>}
        </div>
      </form>
    </div>
  );
}

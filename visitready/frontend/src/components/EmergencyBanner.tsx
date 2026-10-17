import { Siren } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmergencyBanner({ strong = false }: { strong?: boolean }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid={strong ? "emergency-banner-strong" : "emergency-banner"}
      className={cn(
        "rounded-2xl border px-4 py-3 flex gap-3 items-start",
        strong ? "bg-[#B91C1C] border-[#991B1B] text-white" : "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]",
      )}
    >
      <Siren className="size-5 shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed">
        {strong ? (
          <p>
            <strong>Some of what you described can be serious.</strong> If you have chest pain, trouble breathing, are coughing up blood or feel
            very unwell, call <strong className="text-lg">000</strong> now or go to your nearest emergency department. For urgent advice, call
            healthdirect on 1800 022 222.
          </p>
        ) : (
          <p>
            <strong>Not an emergency service.</strong> If you have chest pain, severe difficulty breathing, are coughing up blood or feel very
            unwell, call <strong>000</strong> or go to your nearest emergency department.
          </p>
        )}
      </div>
    </div>
  );
}

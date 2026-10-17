import { useEffect, useRef } from "react";
import { Routes, Route, Navigate as Redirect, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Home from "@/pages/Home";
import Navigate from "@/pages/Navigate";
import Book from "@/pages/Book";
import Prep from "@/pages/Prep";
import Clinician from "@/pages/Clinician";
import ClinicianWelcome from "@/pages/ClinicianWelcome";
import ClinicianDashboard from "@/pages/ClinicianDashboard";
import FollowThrough from "@/pages/FollowThrough";
import Journey from "@/pages/Journey";
import BriefPrint from "@/pages/BriefPrint";
import SignIn from "@/pages/SignIn";
import Profile from "@/pages/Profile";
import ResetPassword from "@/pages/ResetPassword";
import { apiPost } from "@/lib/api";
import { completeAccountSignIn, useMe } from "@/lib/auth";
import { errorMessage } from "@/lib/hooks";
import { getPatientPersona, getPersona, setPersona, setSession, useSessionMode } from "@/lib/persona";
import type { PublicUser } from "@/lib/types";

/** Exchanges the Emergent Google `#session_id` for our session cookie, then returns to the same page (booking selection intact). */
function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const processed = useRef(false);
  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const sessionId = new URLSearchParams(location.hash.slice(1)).get("session_id") ?? "";
    apiPost<PublicUser>("/auth/google/session", { session_id: sessionId })
      .then((u) => completeAccountSignIn(qc, u).then(() => toast.success("Signed in with Google")))
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => navigate(location.pathname + location.search, { replace: true }));
  }, [location, navigate, qc]);
  return <div className="min-h-screen grid place-items-center bg-cream text-ink-muted text-sm">Signing you in…</div>;
}

/** Keeps the patient identity consistent: verified account → its user_id; demo → the chosen fictional persona. */
function SessionSync() {
  const { pathname } = useLocation();
  const mode = useSessionMode();
  const me = useMe();
  useEffect(() => {
    if (mode === "account" && me.isError) setSession(null); // cookie expired or signed out elsewhere
  }, [mode, me.isError]);
  useEffect(() => {
    if (!pathname.startsWith("/patient")) return;
    const want = mode === "account" ? me.data?.user_id : mode === "demo" ? getPatientPersona() : null;
    if (want && getPersona() !== want) setPersona(want);
  }, [pathname, mode, me.data]);
  return null;
}

// Two separate areas: /patient/* and /clinician/*. BrowserRouter already wraps this in main.tsx.
export default function App() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <>
      <SessionSync />
      <Routes>
        <Route path="/" element={<Redirect to="/patient" replace />} />
        <Route path="/patient" element={<Home />} />
        <Route path="/patient/sign-in" element={<SignIn />} />
        <Route path="/patient/profile" element={<Profile />} />
        <Route path="/patient/reset-password" element={<ResetPassword />} />
        <Route path="/patient/navigate" element={<Navigate />} />
        <Route path="/patient/book" element={<Book />} />
        <Route path="/patient/clinics" element={<Book />} />
        <Route path="/patient/prep" element={<Prep />} />
        <Route path="/patient/follow-through" element={<FollowThrough />} />
        <Route path="/patient/journey" element={<Journey />} />
        <Route path="/patient/brief/print" element={<BriefPrint />} />
        <Route path="/clinician" element={<ClinicianWelcome />} />
        <Route path="/clinician/dashboard" element={<ClinicianDashboard />} />
        <Route path="/clinician/consult/:persona" element={<Clinician />} />
        <Route path="*" element={<Redirect to="/patient" replace />} />
      </Routes>
    </>
  );
}

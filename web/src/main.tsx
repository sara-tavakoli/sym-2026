import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { AppProvider, useApp } from "./lib/app-context";
import { Layout } from "./components/Layout";
import { Skeletons } from "./components/ui";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Appointments from "./pages/Appointments";
import AppointmentDetail from "./pages/AppointmentDetail";
import Settings from "./pages/Settings";
import Upcoming from "./pages/Upcoming";

function Protected() {
  const { user, loading } = useApp();
  if (loading) return <div style={{ padding: "2rem" }}><Skeletons /></div>;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/register" element={<Auth mode="register" />} />
          <Route path="/app" element={<Protected />}>
            <Route index element={<Dashboard />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="appointments/:id" element={<AppointmentDetail />} />
            <Route path="preparation" element={<Upcoming title="AI Preparation" phase="Phase 2" description="Enter your concerns and questions in your own words and get an editable, source-linked appointment brief." />} />
            <Route path="follow-up" element={<Upcoming title="Follow-Up Tracker" phase="Phase 3" description="Paste the instructions you were given and turn them into a checklist you review and confirm." />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);

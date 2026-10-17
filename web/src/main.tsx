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
import Prepare from "./pages/Prepare";
import BriefPrint from "./pages/BriefPrint";
import PrepList from "./pages/PrepList";
import FollowUp from "./pages/FollowUp";
import AssistantPage from "./pages/AssistantPage";
import TryDemo from "./pages/TryDemo";
import CareCircle from "./pages/CareCircle";
import SupportingList, { SupportingDetail } from "./pages/Supporting";
import Join from "./pages/Join";
import ClinicianView from "./pages/ClinicianView";
import FitFinder from "./pages/FitFinder";

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
          <Route path="/try" element={<TryDemo />} />
          <Route path="/join/:token" element={<Join />} />
          <Route path="/c/:token" element={<ClinicianView />} />
          <Route path="/app" element={<Protected />}>
            <Route index element={<Dashboard />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="appointments/:id" element={<AppointmentDetail />} />
            <Route path="appointments/:id/prepare" element={<Prepare />} />
            <Route path="appointments/:id/brief" element={<BriefPrint />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="fit-finder" element={<FitFinder />} />
            <Route path="preparation" element={<PrepList />} />
            <Route path="follow-up" element={<FollowUp />} />
            <Route path="settings" element={<Settings />} />
            <Route path="circle" element={<CareCircle />} />
            <Route path="supporting" element={<SupportingList />} />
            <Route path="supporting/:ownerId" element={<SupportingDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);

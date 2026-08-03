import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ThemedToastContainer from "./components/common/ThemedToastContainer";
import ProtectedRoute from "./components/ProtectedRoute";
import { getStoredToken } from "./utils/auth";

const CHUNK_RELOAD_KEY = "talent-acquisition:chunk-reload";

function lazyWithReload(importer) {
  return lazy(async () => {
    try {
      const module = await importer();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return module;
    } catch (error) {
      // A deployment can remove a hashed lazy chunk while an older app shell
      // is open. Reload once to obtain the current entry bundle and its chunks.
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      throw error;
    }
  });
}

const ApplicantDocumentsWorkspace = lazyWithReload(() => import("./pages/ApplicantDocumentsWorkspace"));
const ApplicantProfile = lazyWithReload(() => import("./pages/ApplicantProfile"));
const ApplicantPayments = lazyWithReload(() => import("./pages/ApplicantPayments"));
const ApplicantQuickPrint = lazyWithReload(() => import("./pages/ApplicantQuickPrint"));
const ApplicantsDashboard = lazyWithReload(() => import("./pages/ApplicantsDashboard"));
const ChangePassword = lazyWithReload(() => import("./pages/ChangePassword"));
const CompanyFormPage = lazyWithReload(() => import("./pages/CompanyFormPage"));
const CreateApplicant = lazyWithReload(() => import("./pages/CreateApplicant"));
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const ForgotPassword = lazyWithReload(() => import("./pages/ForgotPassword"));
const Login = lazyWithReload(() => import("./pages/Login"));
const Notifications = lazyWithReload(() => import("./pages/Notifications"));
const Settings = lazyWithReload(() => import("./pages/Settings"));
const SettingsChangePassword = lazyWithReload(() => import("./pages/SettingsChangePassword"));

function App() {
  useEffect(() => {
    const preload = () => {
      import("./pages/Login");
      if (getStoredToken()) {
        import("./pages/ApplicantsDashboard");
        import("./pages/ApplicantProfile");
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload);
      return () => window.cancelIdleCallback(id);
    }

    const timer = setTimeout(preload, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Suspense fallback={<div className="routeSkeleton">Loading content...</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/change-password" element={<ChangePassword />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <ApplicantsDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/agency-dashboard"
          element={
            <ProtectedRoute allowedRoles={["AGENCY"]}>
              <Navigate to="/dashboard" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employer-dashboard"
          element={
            <ProtectedRoute allowedRoles={["EMPLOYER"]}>
              <Navigate to="/dashboard" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts-dashboard"
          element={
            <ProtectedRoute allowedRoles={["JUNIOR_ACCOUNTANT", "SENIOR_ACCOUNTANT"]}>
              <Navigate to="/dashboard" replace />
            </ProtectedRoute>
          }
        />

        <Route
          path="/legacy-dashboard"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/applicants"
          element={
            <ProtectedRoute>
              <Navigate to="/dashboard" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-applicant"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER", "AGENCY"]}>
              <CreateApplicant />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/edit"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER", "AGENCY"]}>
              <CreateApplicant />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/new"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER"]}>
              <CompanyFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:id/edit"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER"]}>
              <CompanyFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/quick-print"
          element={
            <ProtectedRoute allowedRoles={["EMPLOYER"]}>
              <ApplicantQuickPrint />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER", "AGENCY", "EMPLOYER", "SENIOR_ACCOUNTANT"]}>
              <ApplicantProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/documents"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER", "AGENCY", "EMPLOYER"]}>
              <ApplicantDocumentsWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/payments"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER", "AGENCY", "JUNIOR_ACCOUNTANT", "SENIOR_ACCOUNTANT"]}>
              <ApplicantPayments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/change-password"
          element={
            <ProtectedRoute>
              <SettingsChangePassword />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>

      <ThemedToastContainer />
    </>
  );
}

export default App;

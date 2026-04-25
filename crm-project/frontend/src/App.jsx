import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ProtectedRoute from "./components/ProtectedRoute";

const ApplicantDispatchWorkspace = lazy(() => import("./pages/ApplicantDispatchWorkspace"));
const ApplicantDocumentsWorkspace = lazy(() => import("./pages/ApplicantDocumentsWorkspace"));
const ApplicantProfile = lazy(() => import("./pages/ApplicantProfile"));
const ApplicantPayments = lazy(() => import("./pages/ApplicantPayments"));
const ApplicantsDashboard = lazy(() => import("./pages/ApplicantsDashboard"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const CompanyFormPage = lazy(() => import("./pages/CompanyFormPage"));
const CreateApplicant = lazy(() => import("./pages/CreateApplicant"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Login = lazy(() => import("./pages/Login"));
const Settings = lazy(() => import("./pages/Settings"));
const SettingsChangePassword = lazy(() => import("./pages/SettingsChangePassword"));

function App() {
  useEffect(() => {
    const preload = () => {
      import("./pages/Login");
      import("./pages/ApplicantsDashboard");
      import("./pages/ApplicantProfile");
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
          path="/admin-dashboard"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER"]}>
              <Navigate to="/dashboard" replace />
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
            <ProtectedRoute allowedRoles={["ACCOUNTANT"]}>
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
            <ProtectedRoute>
              <CreateApplicant />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/edit"
          element={
            <ProtectedRoute>
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
          path="/applicants/:id"
          element={
            <ProtectedRoute>
              <ApplicantProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/documents"
          element={
            <ProtectedRoute>
              <ApplicantDocumentsWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/dispatch"
          element={
            <ProtectedRoute>
              <ApplicantDispatchWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:id/payments"
          element={
            <ProtectedRoute allowedRoles={["SUPER_USER", "AGENCY", "ACCOUNTANT"]}>
              <ApplicantPayments />
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

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="colored"
      />
    </>
  );
}

export default App;

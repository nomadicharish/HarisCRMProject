import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ProtectedRoute from "./components/ProtectedRoute";
import ApplicantDispatchWorkspace from "./pages/ApplicantDispatchWorkspace";
import ApplicantDocumentsWorkspace from "./pages/ApplicantDocumentsWorkspace";
import ApplicantProfile from "./pages/ApplicantProfile";
import ApplicantPayments from "./pages/ApplicantPayments";
import ApplicantsDashboard from "./pages/ApplicantsDashboard";
import ChangePassword from "./pages/ChangePassword";
import CreateApplicant from "./pages/CreateApplicant";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import Login from "./pages/Login";

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute allowForcePasswordReset={true}>
              <ChangePassword />
            </ProtectedRoute>
          }
        />

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
      </Routes>

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

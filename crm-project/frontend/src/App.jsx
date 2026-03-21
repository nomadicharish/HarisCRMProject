import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";

import AdminDashboard from "./pages/AdminDashboard";
import AgencyDashboard from "./pages/AgencyDashboard";
import EmployerDashboard from "./pages/EmployerDashboard";
import AccountsDashboard from "./pages/AccountsDashboard";
import Applicants from "./pages/Applicants";
import ApplicantProfile from "./pages/ApplicantProfile";

import ProtectedRoute from "./components/ProtectedRoute";
import CreateApplicant from "./pages/CreateApplicant";

function RoleRoute({ children, role }) {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || user.role !== role) {
    return <Navigate to="/" />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />

        <Route path="/admin" element={
          <ProtectedRoute>
            <RoleRoute role="SUPER_USER">
              <AdminDashboard />
            </RoleRoute>
          </ProtectedRoute>
        } />

        <Route path="/agency" element={
          <ProtectedRoute>
            <RoleRoute role="AGENCY">
              <AgencyDashboard />
            </RoleRoute>
          </ProtectedRoute>
        } />

        <Route path="/employer" element={
          <ProtectedRoute>
            <RoleRoute role="EMPLOYER">
              <EmployerDashboard />
            </RoleRoute>
          </ProtectedRoute>
        } />

        <Route path="/accounts" element={
          <ProtectedRoute>
            <RoleRoute role="ACCOUNTANT">
              <AccountsDashboard />
            </RoleRoute>
          </ProtectedRoute>
        } />

        <Route path="/applicants" element={<Applicants />} />
        <Route path="/create-applicant" element={<CreateApplicant />} />
        <Route path="/applicants/:id" element={<ApplicantProfile />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
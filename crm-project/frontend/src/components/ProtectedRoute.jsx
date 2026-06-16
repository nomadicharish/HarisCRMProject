import { Navigate, useLocation } from "react-router-dom";
import { getDashboardPathByRole, getStoredToken, getStoredUser, isSessionExpired } from "../utils/auth";

function ProtectedRoute({ children, allowedRoles = null, allowForcePasswordReset = false }) {
  const location = useLocation();
  const token = getStoredToken();
  const user = getStoredUser();

  if (!token || !user || isSessionExpired()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.forcePasswordReset && !allowForcePasswordReset) {
    return <Navigate to="/change-password" replace />;
  }

  const resolvedAllowedRoles = Array.isArray(allowedRoles) && allowedRoles.includes("SUPER_USER")
    ? [...new Set([...allowedRoles, "ADMIN"])]
    : allowedRoles;

  if (Array.isArray(resolvedAllowedRoles) && resolvedAllowedRoles.length > 0 && !resolvedAllowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPathByRole(user.role)} replace />;
  }

  return children;
}

export default ProtectedRoute;

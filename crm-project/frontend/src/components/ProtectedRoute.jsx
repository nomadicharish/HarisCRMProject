import { Navigate, useLocation } from "react-router-dom";
import { getDashboardPathByRole, getStoredToken, getStoredUser, isSessionExpired } from "../utils/auth";
import { hasAnyRight, hasRight } from "../utils/rights";

function ProtectedRoute({ children, allowedRoles = null, requiredRight = "", requiredAnyRight = [], allowForcePasswordReset = false }) {
  const location = useLocation();
  const token = getStoredToken();
  const user = getStoredUser();

  if (!token || !user || isSessionExpired()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.forcePasswordReset && !allowForcePasswordReset) {
    return <Navigate to="/change-password" replace />;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPathByRole(user.role)} replace />;
  }

  if (requiredRight && !hasRight(user, requiredRight)) {
    return <Navigate to={getDashboardPathByRole(user.role)} replace />;
  }
  if (requiredAnyRight.length && !hasAnyRight(user, requiredAnyRight)) {
    return <Navigate to={getDashboardPathByRole(user.role)} replace />;
  }

  return children;
}

export default ProtectedRoute;

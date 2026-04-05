import { Navigate } from "react-router-dom";
import { getDashboardPathByRole, getStoredUser } from "../utils/auth";

function RoleDashboardRedirect() {
  const user = getStoredUser();
  return <Navigate to={getDashboardPathByRole(user?.role)} replace />;
}

export default RoleDashboardRedirect;

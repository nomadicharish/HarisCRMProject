import { Navigate } from "react-router-dom";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  // If no login data → redirect to login
  if (!token || !user) {
    return <Navigate to="/" />;
  }

  return children;
}

export default ProtectedRoute;
import { useEffect } from "react";
import { Navigate } from "react-router-dom";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));
  const sessionExpiresAt = Number(localStorage.getItem("session_expires_at") || 0);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    if (Date.now() <= sessionExpiresAt) return;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("session_expires_at");
    if (typeof window !== "undefined") window.location.href = "/";
  }, [sessionExpiresAt]);

  // If no login data → redirect to login
  if (!token || !user) {
    return <Navigate to="/" />;
  }

  return children;
}

export default ProtectedRoute;

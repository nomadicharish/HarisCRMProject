import { useEffect, useState } from "react";
import API from "../services/api";
import "../styles/auth.css";
import { clearSession, getStoredToken, getStoredUser, validatePassword } from "../utils/auth";

function ChangePassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (!token || !user) {
      clearSession({ redirectTo: "/login" });
    }
  }, []);

  const handleChangePassword = async (event) => {
    event.preventDefault();
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      setSuccessMessage("");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Confirm password must match the new password");
      setSuccessMessage("");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await API.post("/auth/change-password", { newPassword });
      setSuccessMessage("Password updated successfully. Please log in again.");
      setTimeout(() => {
        clearSession({ redirectTo: "/login" });
      }, 1200);
    } catch (error) {
      setError(error?.response?.data?.message || "Error updating password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authTopBar">
          <h1 className="authTitle">Change Password</h1>
          <p className="authSubtitle">Update your password to continue using the application</p>
        </div>

        <div className="authBody">
          <form className="authForm" onSubmit={handleChangePassword}>
            <div className="authHint">
              Password must be at least 8 characters and include uppercase, lowercase, number, and special character.
            </div>

            <div className="authField">
              <label className="authLabel" htmlFor="new-password">
                New Password
              </label>
              <input
                id="new-password"
                className="authInput"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Enter new password"
              />
            </div>

            <div className="authField">
              <label className="authLabel" htmlFor="confirm-password">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                className="authInput"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
              />
            </div>

            {error ? <div className="authError">{error}</div> : null}
            {successMessage ? <div className="authSuccess">{successMessage}</div> : null}

            <div className="authActions">
              <button type="submit" className="authPrimaryBtn" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChangePassword;

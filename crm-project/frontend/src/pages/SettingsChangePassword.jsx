import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import { auth } from "../firebase";
import { getStoredUser, updateStoredUser, validatePassword } from "../utils/auth";
import "../styles/settings.css";
import "../styles/applicantsDashboard.css";

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4 20 20" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.6 6.3A10.8 10.8 0 0 1 12 6c5.5 0 9 6 9 6a15.5 15.5 0 0 1-3.1 3.7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.7 8.2C4.5 10 3 12 3 12s3.5 6 9 6c1.4 0 2.6-.3 3.8-.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SettingsChangePassword() {
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const [form, setForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.oldPassword.trim()) {
      setError("Old password is required");
      setSuccessMessage("");
      return;
    }

    const passwordError = validatePassword(form.newPassword);
    if (passwordError) {
      setError(passwordError);
      setSuccessMessage("");
      return;
    }

    if (!form.confirmPassword.trim()) {
      setError("Confirm password is required");
      setSuccessMessage("");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("Confirm password must match the new password");
      setSuccessMessage("");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");

      const currentUser = auth.currentUser;
      if (!currentUser?.email) {
        throw new Error("User session not found");
      }

      const credential = EmailAuthProvider.credential(currentUser.email, form.oldPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, form.newPassword);
      await API.post("/auth/password-updated");
      updateStoredUser({ forcePasswordReset: false });

      setSuccessMessage("Password updated successfully.");
      setTimeout(() => {
        navigate("/settings", { replace: true });
      }, 1200);
    } catch (submitError) {
      const firebaseCode = submitError?.code;
      const firebaseMessage =
        firebaseCode === "auth/invalid-credential" || firebaseCode === "auth/wrong-password"
          ? "Old password is incorrect"
          : submitError?.message;
      setError(submitError?.response?.data?.message || firebaseMessage || "Unable to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settingsPage">
      <DashboardTopbar user={{ name: storedUser?.name || "User" }} />

      <div className="settingsShell">
        <div className="settingsShellHeader">
          <h1 className="settingsShellTitle">Your profile settings</h1>
        </div>

        <div className="settingsShellBody">
          <aside className="settingsSidebar">
            <button type="button" className="settingsNavItem settingsNavItemActive">
              <span className="settingsNavIcon" />
              <span>General</span>
            </button>
          </aside>

          <section className="settingsContent">
            <h2 className="settingsSectionTitle">Update your password</h2>

            <form onSubmit={handleSubmit}>
              <div className="settingsFieldGroup">
                <div>
                  <label className="settingsLabel" htmlFor="old-password">
                    Enter your old password
                  </label>
                  <div className="settingsInputWrap">
                    <input
                      id="old-password"
                      className="settingsInput settingsInputWithIcon"
                      type={showOldPassword ? "text" : "password"}
                      value={form.oldPassword}
                      onChange={(event) => setForm((prev) => ({ ...prev, oldPassword: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="settingsPasswordToggle"
                      onClick={() => setShowOldPassword((value) => !value)}
                    >
                      <EyeIcon open={showOldPassword} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="settingsLabel" htmlFor="new-password">
                    Enter your new password
                  </label>
                  <div className="settingsInputWrap">
                    <input
                      id="new-password"
                      className="settingsInput settingsInputWithIcon"
                      type={showNewPassword ? "text" : "password"}
                      value={form.newPassword}
                      onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="settingsPasswordToggle"
                      onClick={() => setShowNewPassword((value) => !value)}
                    >
                      <EyeIcon open={showNewPassword} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="settingsLabel" htmlFor="confirm-password">
                    Confirm your new password
                  </label>
                  <div className="settingsInputWrap">
                    <input
                      id="confirm-password"
                      className="settingsInput settingsInputWithIcon"
                      type={showConfirmPassword ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                      placeholder="Type your new password"
                    />
                    <button
                      type="button"
                      className="settingsPasswordToggle"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                    >
                      <EyeIcon open={showConfirmPassword} />
                    </button>
                  </div>
                </div>
              </div>

              {error ? <div className="settingsError">{error}</div> : null}
              {successMessage ? <div className="settingsSuccess">{successMessage}</div> : null}

              <div className="settingsInlineActions">
                <button type="submit" className="settingsPrimaryBtn" disabled={loading}>
                  {loading ? "Saving..." : "Save changes"}
                </button>
                <button type="button" className="settingsMutedBtn" onClick={() => navigate(-1)}>
                  Back
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsChangePassword;

import { useEffect, useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "../services/api";
import { auth } from "../firebase";
import BrandLogo from "../components/common/BrandLogo";
import "../styles/auth.css";
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  updateStoredUser,
  validatePassword
} from "../utils/auth";

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

function ChangePassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [displayEmail, setDisplayEmail] = useState("");

  const oobCode = searchParams.get("oobCode") || "";
  const mode = searchParams.get("mode") || "";
  const isResetLinkFlow = Boolean(oobCode) && mode === "resetPassword";

  useEffect(() => {
    if (isResetLinkFlow) {
      let active = true;

      async function validateLink() {
        try {
          setCheckingLink(true);
          const email = await verifyPasswordResetCode(auth, oobCode);
          if (!active) return;
          setDisplayEmail(email || "");
          setError("");
        } catch {
          if (!active) return;
          setError("This password reset link is invalid or has expired");
        } finally {
          if (active) setCheckingLink(false);
        }
      }

      validateLink();
      return () => {
        active = false;
      };
    }

    const token = getStoredToken();
    const user = getStoredUser();
    if (!token || !user) {
      clearSession({ redirectTo: "/login" });
      return;
    }

    setDisplayName(user?.name || "");
    setDisplayEmail(user?.email || "");
  }, [isResetLinkFlow, oobCode]);

  const handleChangePassword = async (event) => {
    event.preventDefault();

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      setSuccessMessage("");
      return;
    }

    if (!confirmPassword.trim()) {
      setError("Confirm password is required");
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
      if (isResetLinkFlow) {
        await confirmPasswordReset(auth, oobCode, newPassword);
        setSuccessMessage("Password updated successfully. Please log in with your new password.");
        setTimeout(() => {
          navigate("/login", { replace: true });
        }, 1200);
      } else {
        await API.post("/auth/change-password", { newPassword });
        updateStoredUser({ forcePasswordReset: false });
        setSuccessMessage("Password updated successfully. Please log in again.");
        setTimeout(() => {
          clearSession({ redirectTo: "/login" });
        }, 1200);
      }
    } catch (submitError) {
      setError(submitError?.response?.data?.message || "Error updating password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authPage">
      <div className="authBrand">
        <BrandLogo className="authBrandIcon" />
      </div>

      <div className="authCard authCardWide">
        <div className="authTopBar">
          {isResetLinkFlow ? (
            <>
              <h1 className="authTitle">Hey, <span className="authTitleStrong">welcome back</span> <img src="/hand.png" alt="" className="authInlineIcon" /></h1>
              <p className="authSubtitle">Create a new password for your registered email
                {displayEmail ? <span className="authSubtitleStrong">{displayEmail}</span> : null}
              </p>
            </>
          ) : (
            <>
              <h1 className="authTitle">
                Hey, <span className="authTitleStrong">{displayName || "User"}</span> <img src="/hand.png" alt="" className="authInlineIcon" />
              </h1>
              <p className="authSubtitle">
                Create a password for your linked id
                {displayEmail ? <span className="authSubtitleStrong">{displayEmail}</span> : null}
              </p>
            </>
          )}
        </div>

        <div className="authBody">
          <form className="authForm" onSubmit={handleChangePassword}>
            <div className="authField">
              <label className="authLabel" htmlFor="new-password">
                Password
              </label>
              <div className="authInputWrap">
                <input
                  id="new-password"
                  className="authInput authInputWithIcon"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Type your new password"
                  disabled={checkingLink}
                />
                <button
                  type="button"
                  className="authPasswordToggle"
                  onClick={() => setShowNewPassword((value) => !value)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  <EyeIcon open={showNewPassword} />
                </button>
              </div>
            </div>

            <div className="authField">
              <label className="authLabel" htmlFor="confirm-password">
                Confirm Password
              </label>
              <div className="authInputWrap">
                <input
                  id="confirm-password"
                  className="authInput authInputWithIcon"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Type your new password"
                  disabled={checkingLink}
                />
                <button
                  type="button"
                  className="authPasswordToggle"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
            </div>

            {error ? <div className="authError">{error}</div> : null}
            {successMessage ? <div className="authSuccess">{successMessage}</div> : null}
            <div className="authHint">
              Password must be at least 8 characters and include uppercase, lowercase, number, and special character.
            </div>

            <div className="authActions">
              <button type="submit" className="authPrimaryBtn" disabled={loading || checkingLink || Boolean(error && isResetLinkFlow)}>
                {checkingLink ? "Checking link..." : loading ? "Updating..." : "Create Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChangePassword;


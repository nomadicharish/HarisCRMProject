import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { auth } from "../firebase";
import "../styles/auth.css";
import { validateEmail } from "../utils/auth";

function BrandMark() {
  return (
    <svg className="authBrandIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 20 7.2V10c0 5.4-3.6 9.8-8 11-4.4-1.2-8-5.6-8-11V7.2L12 3Z" fill="currentColor" />
      <path d="M12 3v18" stroke="#ffffff" strokeWidth="2" opacity="0.65" />
      <path d="M6 9h12" stroke="#ffffff" strokeWidth="2" opacity="0.65" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16v10H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m4 8 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 16.5a2.5 2.5 0 1 1 5 0v2h-5z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M19 14.5v1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      setSuccessMessage("");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      await API.post("/auth/check-email", { email: normalizedEmail });
      await sendPasswordResetEmail(auth, normalizedEmail, {
        url: `${window.location.origin}/change-password`
      });

      setSuccessMessage("Password reset link sent to your registered email.");
    } catch (err) {
      const firebaseError =
        err?.code === "auth/too-many-requests"
          ? "Too many reset attempts. Please try again after some time."
          : err?.code === "auth/invalid-continue-uri" || err?.code === "auth/unauthorized-continue-uri"
          ? "Reset link configuration is invalid. Please contact admin."
          : "";
      setError(err?.response?.data?.message || firebaseError || "Unable to send password reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authPage">
      <div className="authBrand">
        <BrandMark />
        <span>Talent Acquisition</span>
      </div>

      <div className="authCard authCardWide">
        <div className="authTopBar">
          <div className="authHeroIcon"><ResetIcon /></div>
          <h1 className="authTitle">Forgot password?</h1>
          <p className="authSubtitle">Enter your registered email to receive a change password link</p>
        </div>

        <div className="authBody">
          <form className="authForm" onSubmit={handleSubmit}>
            <div className="authField">
              <label className="authLabel" htmlFor="forgot-email">
                Email
              </label>
              <div className="authInputWrap">
                <span className="authFieldIcon"><MailIcon /></span>
                <input
                  id="forgot-email"
                  className="authInput authInputLeading"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {error ? <div className="authError">{error}</div> : null}
            {successMessage ? <div className="authSuccess">{successMessage}</div> : null}

            <div className="authActions">
              <button type="submit" className="authPrimaryBtn" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </div>

            <div className="authDivider">or</div>

            <button type="button" className="authSecondaryBtn" onClick={() => navigate("/login")}>
              Back to Login
            </button>
          </form>
        </div>
      </div>

      <div className="authFooterText">© 2026 Talent Acquisition. All rights reserved.</div>
    </div>
  );
}

export default ForgotPassword;

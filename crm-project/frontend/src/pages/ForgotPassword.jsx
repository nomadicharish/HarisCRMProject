import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import "../styles/auth.css";
import { validateEmail } from "../utils/auth";

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
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMessage("Password reset email sent. Please check your inbox.");
    } catch (err) {
      setError(err?.message || "Unable to send password reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authTopBar">
          <h1 className="authTitle">Forgot Password</h1>
          <p className="authSubtitle">We will send a password reset link to your registered email</p>
        </div>

        <div className="authBody">
          <form className="authForm" onSubmit={handleSubmit}>
            <div className="authField">
              <label className="authLabel" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
                className="authInput"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
              />
            </div>

            {error ? <div className="authError">{error}</div> : null}
            {successMessage ? <div className="authSuccess">{successMessage}</div> : null}

            <div className="authActions">
              <button type="submit" className="authPrimaryBtn" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <button type="button" className="authSecondaryBtn" onClick={() => navigate("/login")}>
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;

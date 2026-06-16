import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { auth, authReady } from "../firebase";
import BrandLogo from "../components/common/BrandLogo";
import "../styles/auth.css";
import { getDashboardPathByRole, getStoredUser, isSessionExpired, storeSession, validateEmail } from "../utils/auth";

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

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="6" y="11" width="12" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="16" r="1.2" fill="currentColor" />
    </svg>
  );
}

function getLoginErrorMessage(err) {
  const firebaseCode = err?.code;

  const firebaseMessages = {
    "auth/invalid-email": "Invalid email format",
    "auth/user-not-found": "No user found for this email",
    "auth/wrong-password": "Incorrect password",
    "auth/invalid-credential": "Invalid email or password",
    "auth/user-disabled": "This account has been disabled",
    "auth/too-many-requests": "Too many attempts. Try again later",
    "auth/network-request-failed": "Network error. Check your internet connection"
  };

  return err?.response?.data?.message || firebaseMessages[firebaseCode] || "Login failed. Please try again";
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isSessionExpired()) return;
    const storedUser = getStoredUser();
    if (!storedUser) return;

    if (storedUser.forcePasswordReset) {
      navigate("/change-password", { replace: true });
      return;
    }

    navigate(getDashboardPathByRole(storedUser.role), { replace: true });
  }, [navigate]);

  const handleLogin = async (event) => {
    event.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await authReady;
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await userCredential.user.getIdToken(true);
      const response = await API.get("/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });

      const userData = response.data;
      storeSession({ token, user: userData });

      if (userData.forcePasswordReset) {
        navigate("/change-password", { replace: true });
        return;
      }

      navigate(getDashboardPathByRole(userData.role), { replace: true });
    } catch (err) {
      console.error(err);
      setError(getLoginErrorMessage(err));
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
          <h1 className="authTitle">
            Welcome back <img src="/hand.png" alt="" className="authInlineIcon" />
          </h1>
          <p className="authSubtitle">Please login to continue to your account</p>
        </div>

        <div className="authBody">
          <form className="authForm" onSubmit={handleLogin}>
            <div className="authField">
              <label className="authLabel" htmlFor="login-email">
                Email
              </label>
              <div className="authInputWrap">
                <span className="authFieldIcon"><MailIcon /></span>
                <input
                  id="login-email"
                  className="authInput authInputLeading"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your registered email id"
                />
              </div>
            </div>

            <div className="authField">
              <label className="authLabel" htmlFor="login-password">
                Password
              </label>
              <div className="authInputWrap">
                <span className="authFieldIcon"><LockIcon /></span>
                <input
                  id="login-password"
                  className="authInput authInputLeading authInputWithIcon"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Type your password"
                />
                <button
                  type="button"
                  className="authPasswordToggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error ? <div className="authError">{error}</div> : null}

            <div className="authActions">
              <button type="submit" className="authPrimaryBtn" disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </button>
            </div>

            <div className="authDivider">or</div>

            <div className="authLinks">
              <button type="button" className="authLinkBtn" onClick={() => navigate("/forgot-password")}>
                Forgot password?
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="authFooterText">© 2026 Talent Acquisition. All rights reserved.</div>
    </div>
  );
}

export default Login;


import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { auth } from "../firebase";
import "../styles/auth.css";
import { getDashboardPathByRole, getStoredUser, isSessionExpired, storeSession, validateEmail } from "../utils/auth";

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
      <div className="authCard">
        <div className="authTopBar">
          <h1 className="authTitle">Login</h1>
          <p className="authSubtitle">Sign in to continue to the CRM dashboard</p>
        </div>

        <div className="authBody">
          <form className="authForm" onSubmit={handleLogin}>
            <div className="authField">
              <label className="authLabel" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className="authInput"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
              />
            </div>

            <div className="authField">
              <label className="authLabel" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                className="authInput"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </div>

            {error ? <div className="authError">{error}</div> : null}

            <div className="authLinks">
              <p className="authFooterText">Use your assigned work email and password.</p>
              <button type="button" className="authLinkBtn" onClick={() => navigate("/forgot-password")}>
                Forgot password?
              </button>
            </div>

            <div className="authActions">
              <button type="submit" className="authPrimaryBtn" disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;

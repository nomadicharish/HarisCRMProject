import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";

function getLoginErrorMessage(err) {
  if (axios.isAxiosError(err)) {
    if (err.response?.data?.message) {
      return err.response.data.message;
    }

    if (err.code === "ERR_NETWORK") {
      return "Cannot reach backend server. Make sure API is running on http://localhost:3000";
    }

    return "Login succeeded, but failed to fetch your profile";
  }

  const firebaseCode = err?.code;
  if (!firebaseCode) {
    return "Login failed. Please try again";
  }

  const firebaseMessages = {
    "auth/invalid-email": "Invalid email format",
    "auth/user-not-found": "No user found for this email",
    "auth/wrong-password": "Incorrect password",
    "auth/invalid-credential": "Invalid email or password",
    "auth/user-disabled": "This account has been disabled",
    "auth/too-many-requests": "Too many attempts. Try again later",
    "auth/network-request-failed": "Network error. Check your internet connection"
  };

  return firebaseMessages[firebaseCode] || "Authentication failed";
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const token = await userCredential.user.getIdToken();

      const response = await axios.get(
        "http://localhost:3000/api/auth/me",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(response.data));

      const userData = response.data;

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(userData));

      if (userData.forcePasswordReset) {
          window.location.href = "/change-password";
        } else if (userData.role === "SUPER_USER") {
          window.location.href = "/admin";
        } else if (userData.role === "AGENCY") {
          window.location.href = "/agency";
        } else if (userData.role === "EMPLOYER") {
          window.location.href = "/employer";
        } else if (userData.role === "ACCOUNTANT") {
          window.location.href = "/accounts";
        }
    } catch (err) {
      console.error(err);
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "100px auto" }}>
      <h2>Login</h2>

      <form onSubmit={handleLogin}>
        <div>
          <label>Email</label><br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div style={{ marginTop: "10px" }}>
          <label>Password</label><br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p style={{ color: "red", marginTop: "10px" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: "15px" }}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}

export default Login;

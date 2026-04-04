import axios from "axios";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

const API = axios.create({
  baseURL: "http://localhost:3000/api",
});

// Attach Firebase token automatically
API.interceptors.request.use(async (config) => {
  const sessionExpiresAt = Number(localStorage.getItem("session_expires_at") || 0);
  if (sessionExpiresAt && Date.now() > sessionExpiresAt) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("session_expires_at");
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    return config;
  }

  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : localStorage.getItem("token");

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (token && localStorage.getItem("token") !== token) localStorage.setItem("token", token);
  return config;
});

export default API;

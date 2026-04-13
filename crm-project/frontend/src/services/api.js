import axios from "axios";
import { auth } from "../firebase";
import { clearSession } from "../utils/auth";

const API = axios.create({
  baseURL: "http://localhost:3000/api",
});

// Attach Firebase token automatically
API.interceptors.request.use(async (config) => {
  const sessionExpiresAt = Number(localStorage.getItem("session_expires_at") || 0);
  if (sessionExpiresAt && Date.now() > sessionExpiresAt) {
    await clearSession({ redirectTo: "/login" });
    return config;
  }

  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : localStorage.getItem("token");

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (token && localStorage.getItem("token") !== token) localStorage.setItem("token", token);
  return config;
});

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const message = String(error?.response?.data?.message || "").toLowerCase();
    if (
      status === 401 ||
      message.includes("invalid token") ||
      message.includes("token verification failed") ||
      message.includes("token expired")
    ) {
      await clearSession({ redirectTo: "/login" });
    }

    return Promise.reject(error);
  }
);

export default API;

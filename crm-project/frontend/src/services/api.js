import axios from "axios";
import { auth } from "../firebase";
import { clearSession } from "../utils/auth";

const API = axios.create({
  baseURL: "http://localhost:3000/api",
});

function isAuthTokenError(error) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message || "").toLowerCase();
  return (
    status === 401 ||
    message.includes("invalid token") ||
    message.includes("token verification failed") ||
    message.includes("token expired")
  );
}

// Attach Firebase token automatically
API.interceptors.request.use(async (config) => {
  const sessionExpiresAt = Number(localStorage.getItem("session_expires_at") || 0);
  if (sessionExpiresAt && Date.now() > sessionExpiresAt) {
    await clearSession({ redirectTo: "/login" });
    return config;
  }

  const currentUser = auth.currentUser;
  let token = currentUser ? await currentUser.getIdToken() : localStorage.getItem("token");

  if (currentUser && !token) {
    token = await currentUser.getIdToken(true);
  }

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (token && localStorage.getItem("token") !== token) localStorage.setItem("token", token);
  return config;
});

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    if (isAuthTokenError(error) && originalRequest && !originalRequest._retry) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const freshToken = await currentUser.getIdToken(true);
          localStorage.setItem("token", freshToken);
          originalRequest._retry = true;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return API(originalRequest);
        } catch {
          // fall through to clear session
        }
      }
    }

    if (isAuthTokenError(error)) {
      await clearSession({ redirectTo: "/login" });
    }

    return Promise.reject(error);
  }
);

export default API;

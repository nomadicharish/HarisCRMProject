import axios from "axios";
import { auth, authReady } from "../firebase";
import { clearSession } from "../utils/auth";
import { SESSION_DURATION_MS } from "../utils/auth";

// In local development, Vite proxies this path to the Dev Firebase Hosting API.
// This keeps browser requests same-origin while using the Dev Firebase project.
const defaultBaseURL = "/api";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultBaseURL,
});

const TOKEN_REUSE_MS = 55 * 1000;
let cachedAuthToken = "";
let cachedAuthUid = "";
let cachedAuthTokenUntil = 0;

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

function isSessionRevokedError(error) {
  return error?.response?.data?.code === "SESSION_REVOKED";
}

async function getRequestToken(currentUser) {
  if (!currentUser) return localStorage.getItem("token");

  const now = Date.now();
  if (cachedAuthToken && cachedAuthUid === currentUser.uid && cachedAuthTokenUntil > now) {
    return cachedAuthToken;
  }

  const token = await currentUser.getIdToken();
  cachedAuthToken = token;
  cachedAuthUid = currentUser.uid;
  cachedAuthTokenUntil = now + TOKEN_REUSE_MS;
  return token;
}

// Attach Firebase token automatically
API.interceptors.request.use(async (config) => {
  await authReady;

  const sessionExpiresAt = Number(localStorage.getItem("session_expires_at") || 0);
  const hasExplicitAuthorization = Boolean(config?.headers?.Authorization || config?.headers?.authorization);
  if (sessionExpiresAt && Date.now() > sessionExpiresAt && !hasExplicitAuthorization) {
    await clearSession({ redirectTo: "/login" });
    return config;
  }

  const currentUser = auth.currentUser;
  let token = await getRequestToken(currentUser);

  if (currentUser && !token) {
    token = await currentUser.getIdToken(true);
  }

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (token) {
    if (localStorage.getItem("token") !== token) localStorage.setItem("token", token);
    localStorage.setItem("session_expires_at", String(Date.now() + SESSION_DURATION_MS));
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    if (error?.response?.data?.details?.malwareDetected && typeof window !== "undefined") {
      window.alert(error.response.data.message || "Upload rejected: a potential malware threat was detected.");
    }
    if (isSessionRevokedError(error)) {
      cachedAuthToken = "";
      cachedAuthUid = "";
      cachedAuthTokenUntil = 0;
      await clearSession({ redirectTo: "/login" });
      return Promise.reject(error);
    }
    if (isAuthTokenError(error) && originalRequest && !originalRequest._retry) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const freshToken = await currentUser.getIdToken(true);
          cachedAuthToken = freshToken;
          cachedAuthUid = currentUser.uid;
          cachedAuthTokenUntil = Date.now() + TOKEN_REUSE_MS;
          localStorage.setItem("token", freshToken);
          localStorage.setItem("session_expires_at", String(Date.now() + SESSION_DURATION_MS));
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

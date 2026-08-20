import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const HOME_DASHBOARD_DATE_RANGE_STORAGE_KEY = "crm_home_dashboard_date_range";

export function getStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return localStorage.getItem("token");
}

export function getSessionExpiresAt() {
  return Number(localStorage.getItem("session_expires_at") || 0);
}

export function isSessionExpired() {
  const expiresAt = getSessionExpiresAt();
  const expired = Boolean(expiresAt) && Date.now() > expiresAt;
  if (expired) {
    localStorage.removeItem(HOME_DASHBOARD_DATE_RANGE_STORAGE_KEY);
  }
  return expired;
}

export function storeSession({ token, user }) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("session_expires_at", String(Date.now() + SESSION_DURATION_MS));
}

export function updateStoredUser(updates = {}) {
  const currentUser = getStoredUser();
  if (!currentUser) return null;

  const nextUser = { ...currentUser, ...updates };
  localStorage.setItem("user", JSON.stringify(nextUser));
  return nextUser;
}

export async function clearSession({ redirectTo = "/login" } = {}) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("session_expires_at");
  localStorage.removeItem(HOME_DASHBOARD_DATE_RANGE_STORAGE_KEY);
  localStorage.removeItem("rights_cached_at");

  try {
    await signOut(auth);
  } catch {
    // ignore
  }

  if (typeof window !== "undefined") {
    window.location.href = redirectTo;
  }
}

export function getDashboardPathByRole(role) {
  if (
    role === "SUPER_USER" ||
    role === "AGENCY" ||
    role === "EMPLOYER" ||
    role === "ADMIN" ||
    role === "JUNIOR_ACCOUNTANT" ||
    role === "SENIOR_ACCOUNTANT"
  ) {
    return "/dashboard";
  }

  return "/login";
}

export function isSuperUserLikeRole(role) {
  return role === "SUPER_USER";
}

export function isRootSuperUserRole(role) {
  return role === "SUPER_USER";
}

export function isAccountantRole(role) {
  return role === "JUNIOR_ACCOUNTANT" || role === "SENIOR_ACCOUNTANT";
}

export function validatePassword(password) {
  if (!password || password.trim().length === 0) {
    return "Password is required";
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter";
  }

  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one special character";
  }

  return "";
}

export function validateEmail(email) {
  const trimmed = String(email || "").trim();
  if (!trimmed) return "Email is required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? "" : "Enter a valid email address";
}

import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

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
  return Boolean(expiresAt) && Date.now() > expiresAt;
}

export function storeSession({ token, user }) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("session_expires_at", String(Date.now() + SESSION_DURATION_MS));
}

export async function clearSession({ redirectTo = "/login" } = {}) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("session_expires_at");

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
  switch (role) {
    case "SUPER_USER":
      return "/admin-dashboard";
    case "AGENCY":
      return "/agency-dashboard";
    case "EMPLOYER":
      return "/employer-dashboard";
    case "ACCOUNTANT":
      return "/accounts-dashboard";
    default:
      return "/login";
  }
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

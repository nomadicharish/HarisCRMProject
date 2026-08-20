import { DEFAULT_RIGHTS } from "../config/userRights";
import { getStoredUser, updateStoredUser } from "./auth";

const RIGHTS_CACHE_KEY = "rights_cached_at";

export function getEffectiveRights(user = {}) {
  return Array.isArray(user?.rights) ? user.rights : (DEFAULT_RIGHTS[user?.role] || []);
}

export function hasRight(user, right) {
  return getEffectiveRights(user).includes(right);
}

export function hasAnyRight(user, rights = []) {
  return rights.some((right) => hasRight(user, right));
}

export function cacheRightsAtLogin(user = {}) {
  const updated = updateStoredUser({ rights: user.rights || [], role: user.role || getStoredUser()?.role });
  localStorage.setItem(RIGHTS_CACHE_KEY, String(Date.now()));
  window.dispatchEvent(new Event("rights-updated"));
  return updated;
}

export function clearRightsCache() {
  localStorage.removeItem(RIGHTS_CACHE_KEY);
}

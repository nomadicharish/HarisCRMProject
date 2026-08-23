import { DEFAULT_RIGHTS } from "../config/userRights";
import { getStoredUser, updateStoredUser } from "./auth";

const RIGHTS_CACHE_KEY = "rights_cached_at";

export function getEffectiveRights(user = {}) {
  // Explicit rights add to, rather than replace, the legacy capabilities of a
  // user's role. This keeps established role access working while allowing
  // super users to grant additional permissions.
  return [...new Set([...(DEFAULT_RIGHTS[user?.role] || []), ...(Array.isArray(user?.rights) ? user.rights : [])])];
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

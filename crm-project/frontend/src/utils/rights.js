import { DEFAULT_RIGHTS } from "../config/userRights";

export function getEffectiveRights(user = {}) {
  return Array.isArray(user?.rights) ? user.rights : (DEFAULT_RIGHTS[user?.role] || []);
}

export function hasRight(user, right) {
  return getEffectiveRights(user).includes(right);
}

export function hasAnyRight(user, rights = []) {
  return rights.some((right) => hasRight(user, right));
}

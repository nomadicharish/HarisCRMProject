const ADMIN_ROLE = "ADMIN";
const SUPER_USER_ROLE = "SUPER_USER";

function isSuperUserLikeRole(role) {
  return role === SUPER_USER_ROLE || role === ADMIN_ROLE;
}

function isSuperUserLike(user = {}) {
  return isSuperUserLikeRole(user?.role);
}

function isRootSuperUser(user = {}) {
  return user?.role === SUPER_USER_ROLE;
}

function expandAllowedRoles(roles = []) {
  const expanded = new Set(roles);
  if (expanded.has(SUPER_USER_ROLE)) {
    expanded.add(ADMIN_ROLE);
  }
  return [...expanded];
}

module.exports = {
  ADMIN_ROLE,
  SUPER_USER_ROLE,
  expandAllowedRoles,
  isRootSuperUser,
  isSuperUserLike,
  isSuperUserLikeRole
};

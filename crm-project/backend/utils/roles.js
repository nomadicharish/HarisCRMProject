const SUPER_USER_ROLE = "SUPER_USER";
const JUNIOR_ACCOUNTANT_ROLE = "JUNIOR_ACCOUNTANT";
const SENIOR_ACCOUNTANT_ROLE = "SENIOR_ACCOUNTANT";

function isSuperUserLikeRole(role) {
  return role === SUPER_USER_ROLE;
}

function isSuperUserLike(user = {}) {
  return isSuperUserLikeRole(user?.role);
}

function isRootSuperUser(user = {}) {
  return user?.role === SUPER_USER_ROLE;
}

function expandAllowedRoles(roles = []) {
  return [...new Set(roles)];
}

function isAccountantRole(role) {
  return role === JUNIOR_ACCOUNTANT_ROLE || role === SENIOR_ACCOUNTANT_ROLE;
}

module.exports = {
  JUNIOR_ACCOUNTANT_ROLE,
  SENIOR_ACCOUNTANT_ROLE,
  SUPER_USER_ROLE,
  expandAllowedRoles,
  isAccountantRole,
  isRootSuperUser,
  isSuperUserLike,
  isSuperUserLikeRole
};

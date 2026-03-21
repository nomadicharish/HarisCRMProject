const admin = require("../firebase");

// Attach role to user login token
async function assignRole(uid, role) {
  await admin.auth().setCustomUserClaims(uid, { role });
}

// Disable user (auto logout)
async function disableUser(uid) {
  await admin.auth().updateUser(uid, { disabled: true });
  await admin.auth().revokeRefreshTokens(uid);
}

module.exports = {
  assignRole,
  disableUser
};

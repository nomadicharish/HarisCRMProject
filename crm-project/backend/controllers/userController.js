const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { hasRight } = require("../config/userRights");
const { encryptText } = require("../utils/crypto");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { readEncryptedUserContactNumber, readEncryptedUserEmail, generateOneTimePassword, sendAccountSetupEmail } = require("../services/accountService");
const { RIGHTS, getDefaultRights, normalizeRole } = require("../config/userRights");
const { invalidateUserProfileCache } = require("../middleware/authMiddleware");
const { isSuperUserLikeRole } = require("../utils/roles");
const { uploadProfilePhoto } = require("../services/authService");

const USER_ROLES = new Set(["SUPER_USER", "ADMIN", "AGENCY", "EMPLOYER", "JUNIOR_ACCOUNTANT", "SENIOR_ACCOUNTANT"]);

function requireUserRight(req, res, right) {
  if (hasRight(req.user, right)) return true;
  res.status(403).json({ message: "Access denied" });
  return false;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function sameRights(left = [], right = []) {
  const normalizedLeft = [...new Set(Array.isArray(left) ? left : [])].sort();
  const normalizedRight = [...new Set(Array.isArray(right) ? right : [])].sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizeIdList(value) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
}

function validateUserPayload(payload = {}, { creating = false } = {}) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const role = normalizeRole(payload.role);
  const contactNumber = String(payload.contactNumber || "").trim();
  const rights = Array.isArray(payload.rights) ? [...new Set(payload.rights.filter((right) => RIGHTS.includes(right)))] : null;
  if (!name) return { error: "Name is required" };
  if (creating && !isValidEmail(email)) return { error: "Valid email is required" };
  if (!USER_ROLES.has(role)) return { error: "Invalid user role" };
  if (!contactNumber) return { error: "Contact number is required" };
  return { name, email, role, contactNumber, rights: rights || getDefaultRights(role) };
}

async function serializeUser(doc) {
  const data = doc.data() || {};
  return {
    uid: doc.id,
    name: data.name || "",
    email: await readEncryptedUserEmail(data),
    contactNumber: await readEncryptedUserContactNumber(data),
    role: data.role || "",
    rights: Array.isArray(data.rights) ? data.rights : getDefaultRights(data.role),
    countryId: data.countryId || "",
    countryIds: normalizeIdList(data.countryIds).length ? normalizeIdList(data.countryIds) : normalizeIdList(data.countryId),
    companyId: data.companyId || "",
    companyIds: normalizeIdList(data.companyIds).length ? normalizeIdList(data.companyIds) : normalizeIdList(data.companyId),
    profilePhotoUrl: data.profilePhotoUrl || "",
    active: data.active !== false
  };
}

async function listUsers(req, res) {
  if (!requireUserRight(req, res, "VIEW_USERS")) return;
  const search = String(req.query.search || "").trim().toLowerCase();
  const snapshot = await db.collection("users").orderBy("name").limit(200).get();
  const users = await Promise.all(snapshot.docs
    .filter((doc) => doc.data()?.active !== false && doc.data()?.role !== "SUPER_USER")
    .map(serializeUser));
  const items = search ? users.filter((user) => user.name.toLowerCase().includes(search)) : users;
  return res.json({ items, total: items.length });
}

async function getUser(req, res) {
  if (!requireUserRight(req, res, "VIEW_USERS")) return;
  const doc = await db.collection("users").doc(req.params.uid).get();
  if (!doc.exists || doc.data()?.active === false) return res.status(404).json({ message: "User not found" });
  return res.json(await serializeUser(doc));
}

async function createUser(req, res) {
  if (!requireUserRight(req, res, "ADD_USERS")) return;
  const parsed = validateUserPayload(req.body, { creating: true });
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const { name, email, role, contactNumber, rights } = parsed;
  const countryIds = normalizeIdList(req.body.countryIds).length ? normalizeIdList(req.body.countryIds) : normalizeIdList(req.body.countryId);
  const companyIds = normalizeIdList(req.body.companyIds).length ? normalizeIdList(req.body.companyIds) : normalizeIdList(req.body.companyId);
  const oneTimePassword = generateOneTimePassword();
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email, password: oneTimePassword, displayName: name });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });
    await db.collection("users").doc(userRecord.uid).set({
      name, emailEncrypted: await encryptText(email), normalizedEmail: normalizeEmailValue(email),
      contactNumberEncrypted: await encryptText(contactNumber), normalizedContactNumber: normalizePhoneValue(contactNumber),
      role, rights, countryId: countryIds[0] || null, countryIds, companyId: companyIds[0] || null, companyIds,
      active: true, forcePasswordReset: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    if (error?.code === "auth/email-already-exists") return res.status(409).json({ message: "A user with this email already exists" });
    throw error;
  }
  try { await sendAccountSetupEmail({ email, name, role, oneTimePassword }); }
  catch (error) { logger.error("Account setup email failed", { uid: userRecord.uid, message: error?.message }); }
  return res.status(201).json({ uid: userRecord.uid, message: "User created successfully" });
}

async function updateUser(req, res) {
  if (!requireUserRight(req, res, "ADD_USERS")) return;
  const doc = await db.collection("users").doc(req.params.uid).get();
  if (!doc.exists) return res.status(404).json({ message: "User not found" });
  const current = doc.data() || {};
  const parsed = validateUserPayload({ ...current, ...req.body, email: req.body.email || await readEncryptedUserEmail(current) });
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const { name, email, role, contactNumber, rights } = parsed;
  const countryIds = normalizeIdList(req.body.countryIds).length ? normalizeIdList(req.body.countryIds) : normalizeIdList(req.body.countryId);
  const companyIds = normalizeIdList(req.body.companyIds).length ? normalizeIdList(req.body.companyIds) : normalizeIdList(req.body.companyId);
  const rightsChanged = !sameRights(current.rights || getDefaultRights(current.role), rights);
  await admin.auth().updateUser(req.params.uid, { displayName: name, email });
  await admin.auth().setCustomUserClaims(req.params.uid, { role });
  await doc.ref.set({
    name, role, rights, emailEncrypted: await encryptText(email), normalizedEmail: normalizeEmailValue(email),
    contactNumberEncrypted: await encryptText(contactNumber), normalizedContactNumber: normalizePhoneValue(contactNumber),
    countryId: countryIds[0] || null, countryIds, companyId: companyIds[0] || null, companyIds,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  invalidateUserProfileCache(req.params.uid);
  if (rightsChanged) await admin.auth().revokeRefreshTokens(req.params.uid);
  return res.json({ message: "User updated successfully", sessionRevoked: rightsChanged });
}

async function removeUser(req, res) {
  if (!requireUserRight(req, res, "DELETE_USERS")) return;
  if (req.params.uid === req.user.uid) return res.status(400).json({ message: "You cannot delete your own account" });
  await admin.auth().updateUser(req.params.uid, { disabled: true });
  await db.collection("users").doc(req.params.uid).set({ active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  invalidateUserProfileCache(req.params.uid);
  return res.json({ message: "User deleted successfully" });
}

async function resetUserPassword(req, res) {
  if (!isSuperUserLikeRole(req.user?.role)) return res.status(403).json({ message: "Only Super User can reset user passwords" });
  const doc = await db.collection("users").doc(req.params.uid).get();
  if (!doc.exists || doc.data()?.active === false) return res.status(404).json({ message: "User not found" });

  const user = doc.data() || {};
  const email = await readEncryptedUserEmail(user);
  if (!email) return res.status(400).json({ message: "User email is not available" });

  const oneTimePassword = generateOneTimePassword();
  await admin.auth().updateUser(req.params.uid, { password: oneTimePassword, disabled: false });
  await doc.ref.set({
    active: true,
    forcePasswordReset: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const emailResult = await sendAccountSetupEmail({
    email,
    name: user.name || "User",
    role: user.role || "USER",
    oneTimePassword
  });
  if (emailResult?.skipped) return res.status(502).json({ message: "Password was reset, but the email could not be sent" });
  return res.json({ message: "Password reset email sent successfully" });
}

async function uploadUserProfilePhoto(req, res) {
  if (!isSuperUserLikeRole(req.user?.role)) return res.status(403).json({ message: "Only Super User can update user profile photos" });
  const data = await uploadProfilePhoto(req.params.uid, req.file);
  return res.json(data);
}

module.exports = { createUser, getUser, listUsers, removeUser, resetUserPassword, updateUser, uploadUserProfilePhoto };

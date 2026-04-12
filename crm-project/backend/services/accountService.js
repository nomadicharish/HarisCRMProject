const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { decryptText, encryptText } = require("../utils/crypto");

const DEFAULT_ENTITY_PASSWORD = "ChangeMe@123";

async function buildUserProfileRecord({ email, name, role, agencyId = null, employerId = null, contactNumber = "" }) {
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedContactNumber = normalizePhoneValue(contactNumber);

  return {
    name: String(name || "").trim(),
    emailEncrypted: await encryptText(normalizedEmail),
    contactNumberEncrypted: await encryptText(String(contactNumber || "").trim()),
    normalizedEmail,
    normalizedContactNumber,
    role,
    agencyId: agencyId || null,
    employerId: employerId || null
  };
}

async function readEncryptedUserEmail(userData = {}) {
  return userData.emailEncrypted
    ? decryptText(userData.emailEncrypted)
    : normalizeEmailValue(userData.email || "");
}

async function readEncryptedUserContactNumber(userData = {}) {
  return userData.contactNumberEncrypted
    ? decryptText(userData.contactNumberEncrypted)
    : String(userData.contactNumber || "").trim();
}

async function findLinkedUserByField(fieldName, entityId, role) {
  if (!entityId) return null;

  const snapshot = await db
    .collection("users")
    .where("role", "==", role)
    .where(fieldName, "==", entityId)
    .limit(1)
    .get();

  return snapshot.empty ? null : snapshot.docs[0];
}

async function createLinkedUserAccount({ email, name, role, agencyId = null, employerId = null, contactNumber = "" }) {
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedName = String(name || "").trim();

  const userRecord = await admin.auth().createUser({
    email: normalizedEmail,
    password: DEFAULT_ENTITY_PASSWORD,
    displayName: normalizedName
  });

  await admin.auth().setCustomUserClaims(userRecord.uid, { role });

  await db.collection("users").doc(userRecord.uid).set({
    ...(await buildUserProfileRecord({
      email: normalizedEmail,
      name: normalizedName,
      role,
      agencyId,
      employerId,
      contactNumber
    })),
    active: true,
    forcePasswordReset: true,
    createdAt: new Date()
  });

  return userRecord.uid;
}

async function syncLinkedUserAccount({ email, name, role, agencyId = null, employerId = null, contactNumber = "" }) {
  const entityId = role === "AGENCY" ? agencyId : employerId;
  const fieldName = role === "AGENCY" ? "agencyId" : "employerId";
  const linkedUserDoc = await findLinkedUserByField(fieldName, entityId, role);

  if (!linkedUserDoc) {
    throw new AppError("Linked user account not found", 404);
  }

  const uid = linkedUserDoc.id;
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedName = String(name || "").trim();

  await admin.auth().updateUser(uid, {
    email: normalizedEmail,
    displayName: normalizedName
  });

  await db.collection("users").doc(uid).set(
    {
      ...(await buildUserProfileRecord({
        email: normalizedEmail,
        name: normalizedName,
        role,
        agencyId,
        employerId,
        contactNumber
      })),
      updatedAt: new Date()
    },
    { merge: true }
  );

  return uid;
}

async function deleteLinkedUserAccount(role, entityId) {
  const fieldName = role === "AGENCY" ? "agencyId" : "employerId";
  const linkedUserDoc = await findLinkedUserByField(fieldName, entityId, role);

  if (!linkedUserDoc) return;

  await admin.auth().deleteUser(linkedUserDoc.id);
  await db.collection("users").doc(linkedUserDoc.id).delete();
}

module.exports = {
  DEFAULT_ENTITY_PASSWORD,
  buildUserProfileRecord,
  createLinkedUserAccount,
  deleteLinkedUserAccount,
  findLinkedUserByField,
  readEncryptedUserContactNumber,
  readEncryptedUserEmail,
  syncLinkedUserAccount
};

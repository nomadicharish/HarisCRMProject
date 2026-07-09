const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { logger } = require("../lib/logger");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { decryptText, encryptText } = require("../utils/crypto");
const { sendEmail } = require("./emailService");

const DEFAULT_ENTITY_PASSWORD = "ChangeMe@123";
const DEFAULT_APP_LOGIN_URL = "http://localhost:5173/login";

function getAppLoginUrl() {
  if (process.env.APP_LOGIN_URL) return String(process.env.APP_LOGIN_URL).trim();
  return String(process.env.FRONTEND_URL || DEFAULT_APP_LOGIN_URL).replace(/\/$/, "") + "/login";
}

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

  let welcomeEmailResult;
  try {
    welcomeEmailResult = await sendWelcomeEmail({
      email: normalizedEmail,
      name: normalizedName,
      role
    });
  } catch (error) {
    logger.error("Welcome email failed", {
      role,
      email: normalizedEmail,
      message: error?.message,
      stack: error?.stack
    });
    welcomeEmailResult = { skipped: true, reason: "send_failed" };
  }

  if (welcomeEmailResult?.skipped) {
    logger.warn("Welcome email was not sent", {
      role,
      email: normalizedEmail,
      reason: welcomeEmailResult.reason || "unknown"
    });
  }

  return {
    uid: userRecord.uid,
    welcomeEmail: welcomeEmailResult?.skipped ? welcomeEmailResult : { sent: true }
  };
}

async function sendWelcomeEmail({ email, name, role }) {
  const displayRole = role === "AGENCY" ? "agency" : role === "EMPLOYER" ? "employer" : String(role || "user").toLowerCase();
  const loginUrl = getAppLoginUrl();
  const subject = "Welcome to Talent Acquisition CRM";
  const greetingName = name || "User";
  const text = [
    `Hi ${greetingName},`,
    "",
    `Your ${displayRole} account has been created for Talent Acquisition CRM.`,
    `Login here: ${loginUrl}`,
    `Temporary password: ${DEFAULT_ENTITY_PASSWORD}`,
    "",
    "Please sign in and update your password."
  ].join("\n");

  const html = `
    <p>Hi ${greetingName},</p>
    <p>Your ${displayRole} account has been created for Talent Acquisition CRM.</p>
    <p><a href="${loginUrl}">Open Talent Acquisition CRM</a></p>
    <p>Temporary password: <strong>${DEFAULT_ENTITY_PASSWORD}</strong></p>
    <p>Please sign in and update your password.</p>
  `;

  return sendEmail({ to: email, subject, text, html });
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

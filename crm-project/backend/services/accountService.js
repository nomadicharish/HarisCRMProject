const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { logger } = require("../lib/logger");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { decryptText, encryptText } = require("../utils/crypto");
const { sendEmail } = require("./emailService");

const DEFAULT_APP_LOGIN_URL = "http://localhost:5173/login";
const APP_NAME = process.env.APP_NAME || "Talent Acquisition";

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
    welcomeEmailResult = await sendAccountSetupEmail({
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

async function sendAccountSetupEmail({ email, name, role }) {
  const displayRole = role === "AGENCY" ? "agency" : role === "EMPLOYER" ? "employer" : String(role || "user").toLowerCase();
  const loginUrl = getAppLoginUrl();
  const setupUrl = await admin.auth().generatePasswordResetLink(email, { url: loginUrl });
  const subject = `Welcome to ${APP_NAME}`;
  const greetingName = name || "User";
  const text = [
    `Hi ${greetingName},`,
    "",
    `Your ${displayRole} account has been created for ${APP_NAME}.`,
    `Set your password: ${setupUrl}`,
    `Login to ${APP_NAME}: ${loginUrl}`,
    "",
    "After setting your password, use the login link above to sign in."
  ].join("\n");

  const html = `
    <p>Hi ${greetingName},</p>
    <p>Your ${displayRole} account has been created for ${APP_NAME}.</p>
    <p><a href="${setupUrl}">Set your password</a></p>
    <p>This one-time link lets you create your password securely.</p>
    <p>Afterward, <a href="${loginUrl}">log in to ${APP_NAME}</a>.</p>
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
  buildUserProfileRecord,
  createLinkedUserAccount,
  deleteLinkedUserAccount,
  findLinkedUserByField,
  readEncryptedUserContactNumber,
  readEncryptedUserEmail,
  sendAccountSetupEmail,
  syncLinkedUserAccount
};

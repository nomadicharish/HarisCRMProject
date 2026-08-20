const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { logger } = require("../lib/logger");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { decryptText, encryptText } = require("../utils/crypto");
const { sendEmail } = require("./emailService");
const { randomInt } = require("crypto");

const DEFAULT_APP_LOGIN_URL = "http://localhost:5173/login";
const APP_NAME = process.env.APP_NAME || "Talent Acquisition";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAppLoginUrl() {
  if (process.env.APP_LOGIN_URL) return String(process.env.APP_LOGIN_URL).trim();
  return String(process.env.FRONTEND_URL || DEFAULT_APP_LOGIN_URL).replace(/\/$/, "") + "/login";
}

function generateOneTimePassword(length = 8) {
  // Keep temporary credentials easy to enter from email: letters and numbers
  // only, with upper- and lower-case characters plus a digit.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const allCharacters = `${upper}${lower}${digits}`;
  const password = [
    upper[randomInt(upper.length)],
    lower[randomInt(lower.length)],
    digits[randomInt(digits.length)]
  ];

  while (password.length < Math.max(8, length)) {
    password.push(allCharacters[randomInt(allCharacters.length)]);
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  return password.join("");
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
  const oneTimePassword = generateOneTimePassword();

  const userRecord = await admin.auth().createUser({
    email: normalizedEmail,
    displayName: normalizedName,
    password: oneTimePassword
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
      role,
      oneTimePassword
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
    welcomeEmail: welcomeEmailResult?.skipped
      ? { sent: false, reason: welcomeEmailResult.reason || "send_failed" }
      : { sent: true, messageId: welcomeEmailResult?.messageId || null }
  };
}

async function sendAccountSetupEmail({ email, name, role, oneTimePassword }) {
  const displayRole = role === "AGENCY" ? "agency" : role === "EMPLOYER" ? "employer" : String(role || "user").toLowerCase();
  const loginUrl = getAppLoginUrl();
  const subject = `Welcome to ${APP_NAME}`;
  const greetingName = name || "User";
  const text = [
    `Hi ${greetingName},`,
    "",
    `Your ${displayRole} account has been created for ${APP_NAME}.`,
    `Your one-time password: ${oneTimePassword}`,
    `Login to ${APP_NAME}: ${loginUrl}`,
    "",
    "Use this password to log in once. You will be required to create a new password immediately after your first login."
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(greetingName)},</p>
    <p>Your ${displayRole} account has been created for ${APP_NAME}.</p>
    <p>Your one-time password is: <strong>${escapeHtml(oneTimePassword)}</strong></p>
    <p><a href="${escapeHtml(loginUrl)}">Log in to ${APP_NAME}</a>.</p>
    <p>Use this password to log in once. You will be required to create a new password immediately after your first login.</p>
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

async function resetUserPassword(uid) {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) throw new AppError("User account not found", 404);

  const userData = userDoc.data() || {};
  const authUser = await admin.auth().getUser(uid);
  const email = await readEncryptedUserEmail(userData) || authUser.email || "";
  if (!email) throw new AppError("User email is not available", 400);

  const oneTimePassword = generateOneTimePassword();
  await admin.auth().updateUser(uid, { password: oneTimePassword, disabled: false });
  await db.collection("users").doc(uid).set(
    {
      active: true,
      forcePasswordReset: true,
      updatedAt: new Date()
    },
    { merge: true }
  );

  const result = await sendAccountSetupEmail({
    email,
    name: userData.name || authUser.displayName || "User",
    role: userData.role || "USER",
    oneTimePassword
  });
  if (result?.skipped) throw new AppError("Password was reset, but the email could not be sent", 502);

  return { message: "Password reset email sent successfully" };
}

async function resetLinkedUserPassword(role, entityId) {
  const fieldName = role === "AGENCY" ? "agencyId" : "employerId";
  const linkedUserDoc = await findLinkedUserByField(fieldName, entityId, role);
  if (!linkedUserDoc) throw new AppError("Linked user account not found", 404);
  return resetUserPassword(linkedUserDoc.id);
}

module.exports = {
  buildUserProfileRecord,
  createLinkedUserAccount,
  deleteLinkedUserAccount,
  findLinkedUserByField,
  generateOneTimePassword,
  readEncryptedUserContactNumber,
  readEncryptedUserEmail,
  resetLinkedUserPassword,
  resetUserPassword,
  sendAccountSetupEmail,
  syncLinkedUserAccount
};

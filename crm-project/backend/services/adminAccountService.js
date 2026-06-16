const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { logger } = require("../lib/logger");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { decryptText, encryptText } = require("../utils/crypto");
const { DEFAULT_ENTITY_PASSWORD, readEncryptedUserContactNumber, readEncryptedUserEmail } = require("./accountService");
const { ensureUniqueEntityDetails } = require("./entityService");
const { sendEmail } = require("./emailService");
const { ADMIN_ROLE } = require("../utils/roles");

const DEFAULT_APP_LOGIN_URL = "http://localhost:5173/login";

function getAppLoginUrl() {
  if (process.env.APP_LOGIN_URL) return String(process.env.APP_LOGIN_URL).trim();
  return String(process.env.FRONTEND_URL || DEFAULT_APP_LOGIN_URL).replace(/\/$/, "") + "/login";
}

async function mapAdminDoc(doc) {
  const data = doc.data() || {};
  return {
    uid: doc.id,
    name: data.name || "",
    email: await readEncryptedUserEmail(data),
    contactNumber: await readEncryptedUserContactNumber(data),
    whatsappNumber: data.whatsappNumberEncrypted
      ? await decryptText(data.whatsappNumberEncrypted)
      : String(data.whatsappNumber || "").trim(),
    active: data.active !== false,
    createdAt: data.createdAt || null
  };
}

async function listAdmins() {
  const snapshot = await db.collection("users").where("role", "==", ADMIN_ROLE).get();
  const admins = await Promise.all(snapshot.docs.map(mapAdminDoc));
  return admins.sort((a, b) => a.name.localeCompare(b.name));
}

async function sendWelcomeEmail({ email, name }) {
  const subject = "Welcome to Talent Acquisition CRM";
  const greetingName = name || "Admin";
  const loginUrl = getAppLoginUrl();
  const text = [
    `Hi ${greetingName},`,
    "",
    "Your admin account has been created for Talent Acquisition CRM.",
    `Login here: ${loginUrl}`,
    `Temporary password: ${DEFAULT_ENTITY_PASSWORD}`,
    "",
    "Please sign in and update your password."
  ].join("\n");

  const html = `
    <p>Hi ${greetingName},</p>
    <p>Your admin account has been created for Talent Acquisition CRM.</p>
    <p><a href="${loginUrl}">Open Talent Acquisition CRM</a></p>
    <p>Temporary password: <strong>${DEFAULT_ENTITY_PASSWORD}</strong></p>
    <p>Please sign in and update your password.</p>
  `;

  return sendEmail({ to: email, subject, text, html });
}

async function createAdmin({ name, email, contactNumber, whatsappNumber = "" }) {
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedName = String(name || "").trim();
  const normalizedContactNumber = normalizePhoneValue(contactNumber);
  const normalizedWhatsappNumber = normalizePhoneValue(whatsappNumber || contactNumber);

  await ensureUniqueEntityDetails({
    email: normalizedEmail,
    contactNumber
  });

  let authUser;
  try {
    authUser = await admin.auth().getUserByEmail(normalizedEmail);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  if (authUser) {
    const existingDoc = await db.collection("users").doc(authUser.uid).get();
    if (existingDoc.exists && existingDoc.data()?.active !== false) {
      throw new AppError("A user with this email already exists", 409);
    }
    throw new AppError("A disabled auth user with this email already exists", 409);
  }

  const userRecord = await admin.auth().createUser({
    email: normalizedEmail,
    password: DEFAULT_ENTITY_PASSWORD,
    displayName: normalizedName
  });

  try {
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: ADMIN_ROLE });
    await db.collection("users").doc(userRecord.uid).set({
      name: normalizedName,
      emailEncrypted: await encryptText(normalizedEmail),
      contactNumberEncrypted: await encryptText(String(contactNumber || "").trim()),
      whatsappNumberEncrypted: await encryptText(String(whatsappNumber || contactNumber || "").trim()),
      normalizedEmail,
      normalizedContactNumber,
      normalizedWhatsappNumber,
      role: ADMIN_ROLE,
      active: true,
      forcePasswordReset: true,
      createdAt: new Date()
    });
  } catch (error) {
    await admin.auth().deleteUser(userRecord.uid).catch(() => {});
    throw error;
  }

  let emailResult;
  try {
    emailResult = await sendWelcomeEmail({ email: normalizedEmail, name: normalizedName });
  } catch (error) {
    logger.error("Admin welcome email failed", {
      email: normalizedEmail,
      message: error?.message,
      stack: error?.stack
    });
    emailResult = { skipped: true, reason: "send_failed" };
  }

  return {
    message: "Admin added successfully",
    admin: await mapAdminDoc(await db.collection("users").doc(userRecord.uid).get()),
    email: emailResult?.skipped ? emailResult : { sent: true },
    welcomeEmail: emailResult?.skipped ? emailResult : { sent: true }
  };
}

async function removeAdmin(uid, actorUid) {
  if (uid === actorUid) {
    throw new AppError("You cannot remove your own account", 400);
  }

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== ADMIN_ROLE) {
    throw new AppError("Admin not found", 404);
  }

  await admin.auth().deleteUser(uid).catch(async (error) => {
    if (error?.code !== "auth/user-not-found") throw error;
  });
  await db.collection("users").doc(uid).delete();

  return { message: "Admin removed successfully" };
}

module.exports = {
  createAdmin,
  listAdmins,
  removeAdmin
};

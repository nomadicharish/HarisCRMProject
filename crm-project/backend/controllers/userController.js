const { admin, db } = require("../config/firebase");
const { randomBytes } = require("node:crypto");
const { logger } = require("../lib/logger");
const { isSuperUserLikeRole } = require("../utils/roles");
const { isEmailConfigured, sendEmail } = require("../services/emailService");

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

const createUser = async (req, res) => {
  try {
    const { email, name, role, agencyId, employerId } = req.body;

    const creatorRole = req.user?.role || "SUPER_USER";

    if (!isSuperUserLikeRole(creatorRole)) {
      return res.status(403).json({ message: "Only Super User can create users" });
    }

    if (!["SUPER_USER", "AGENCY", "EMPLOYER", "JUNIOR_ACCOUNTANT", "SENIOR_ACCOUNTANT"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ message: "Account invitation email is not configured" });
    }

    // Firebase needs a password-backed account before it can issue a password
    // reset link. This random value is never returned, logged, or shared.
    const temporaryPassword = `${randomBytes(32).toString("base64url")}Aa1!`;

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password: temporaryPassword
    });

    const uid = userRecord.uid;

    // Set custom claim
    await admin.auth().setCustomUserClaims(uid, { role });

    // Store user profile in Firestore
    await db.collection("users").doc(uid).set({
      name,
      email,
      role,
      agencyId: agencyId || null,
      employerId: employerId || null,
      active: true,
      // The invitation link requires the recipient to set a password before
      // the account can be used, so no temporary-password reset is needed.
      forcePasswordReset: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    try {
      const setupLink = await admin.auth().generatePasswordResetLink(email, {
        url: process.env.PASSWORD_SETUP_CONTINUE_URL || "https://haris-business-crm.web.app/login",
        handleCodeInApp: false
      });
      await sendEmail({
        to: email,
        subject: "Set up your CRM account",
        text: `Your CRM account has been created. Set your password using this one-time link: ${setupLink}`,
        html: `<p>Your CRM account has been created.</p><p><a href="${setupLink}">Set your password</a></p><p>This link expires according to your Firebase Authentication settings.</p>`
      });
    } catch (invitationError) {
      await Promise.allSettled([
        admin.auth().deleteUser(uid),
        db.collection("users").doc(uid).delete()
      ]);
      throw invitationError;
    }

    return res.status(201).json({
      message: "User created successfully",
      uid
    });

  } catch (error) {
    logger.error("Create User Error", {
      message: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { createUser };

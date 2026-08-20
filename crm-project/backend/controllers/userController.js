const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { isSuperUserLikeRole } = require("../utils/roles");
const { encryptText } = require("../utils/crypto");
const { generateOneTimePassword, sendAccountSetupEmail } = require("../services/accountService");

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

const createUser = async (req, res) => {
  try {
    const { email, name, role, agencyId, employerId } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(name || "").trim();

    const creatorRole = req.user?.role || "SUPER_USER";

    if (!isSuperUserLikeRole(creatorRole)) {
      return res.status(403).json({ message: "Only Super User can create users" });
    }

    if (!["SUPER_USER", "AGENCY", "EMPLOYER", "JUNIOR_ACCOUNTANT", "SENIOR_ACCOUNTANT"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!normalizedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const oneTimePassword = generateOneTimePassword();

    // Create Firebase Auth user with a temporary password. The user is forced
    // to replace it immediately after their first successful login.
    const userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password: oneTimePassword,
      displayName: normalizedName
    });

    const uid = userRecord.uid;

    // Set custom claim
    await admin.auth().setCustomUserClaims(uid, { role });

    // Store user profile in Firestore
    await db.collection("users").doc(uid).set({
      name: normalizedName,
      emailEncrypted: await encryptText(normalizedEmail),
      normalizedEmail,
      role,
      agencyId: agencyId || null,
      employerId: employerId || null,
      active: true,
      forcePasswordReset: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    let welcomeEmail;
    try {
      const result = await sendAccountSetupEmail({
        email: normalizedEmail,
        name: normalizedName,
        role,
        oneTimePassword
      });
      welcomeEmail = result?.skipped
        ? { sent: false, reason: result.reason || "send_failed" }
        : { sent: true, messageId: result?.messageId || null };
    } catch (setupEmailError) {
      logger.error("Account setup email failed", {
        uid,
        message: setupEmailError?.message
      });
      welcomeEmail = { sent: false, reason: "send_failed" };
    }

    return res.status(201).json({
      uid,
      message: welcomeEmail?.sent
        ? "User created successfully. A password-setup email has been sent."
        : "User created successfully, but the password-setup email could not be sent.",
      welcomeEmail
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

const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { isSuperUserLikeRole } = require("../utils/roles");
const { encryptText } = require("../utils/crypto");
const { sendAccountSetupEmail } = require("../services/accountService");

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

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email
    });

    const uid = userRecord.uid;

    // Set custom claim
    await admin.auth().setCustomUserClaims(uid, { role });

    // Store user profile in Firestore
    await db.collection("users").doc(uid).set({
      name,
      emailEncrypted: await encryptText(String(email).trim().toLowerCase()),
      normalizedEmail: String(email).trim().toLowerCase(),
      role,
      agencyId: agencyId || null,
      employerId: employerId || null,
      active: true,
      forcePasswordReset: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    try {
      await sendAccountSetupEmail({ email, name, role });
    } catch (setupEmailError) {
      logger.error("Account setup email failed", {
        uid,
        message: setupEmailError?.message
      });
    }

    return res.status(201).json({
      uid,
      message: "User created successfully. A password-setup email has been sent if SMTP is configured."
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

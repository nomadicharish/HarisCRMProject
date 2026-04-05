const { admin, db } = require("../config/firebase");

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isStrongPassword(password) {
  if (typeof password !== "string" || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

const createUser = async (req, res) => {
  try {
    const { email, name, role, agencyId, employerId } = req.body;

    const creatorRole = req.user?.role || "SUPER_USER";

    if (creatorRole !== "SUPER_USER") {
      return res.status(403).json({ message: "Only Super User can create users" });
    }

    if (!["SUPER_USER", "AGENCY", "EMPLOYER", "ACCOUNTANT"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    // Default password
    const defaultPassword = "ChangeMe@123";

    if (!isStrongPassword(defaultPassword)) {
      return res.status(500).json({ message: "Default password policy is invalid" });
    }

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password: defaultPassword
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
      forcePasswordReset: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      message: "User created successfully",
      uid,
      defaultPassword
    });

  } catch (error) {
    console.error("Create User Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { createUser };

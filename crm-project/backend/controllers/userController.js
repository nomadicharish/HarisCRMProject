const { admin, db } = require("../config/firebase");

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

    // Default password
    const defaultPassword = "ChangeMe@123";

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
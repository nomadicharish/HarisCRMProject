const { admin, db } = require("./config/firebase");

// 👇 PASTE SUPER USER UID (same one you used earlier)
const SUPER_USER_UID = "FXLItDg2xzS4wtWs0zpXFywMqcx2";

// 👇 PASTE SUPER USER EMAIL
const SUPER_USER_EMAIL = "harishnomadic@gmail.com";

(async () => {
  try {
    await db.collection("users").doc(SUPER_USER_UID).set({
      name: "Super User",
      email: SUPER_USER_EMAIL,
      role: "SUPER_USER",
      agencyId: null,
      employerId: null,
      active: true,
      forcePasswordReset: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("✅ Super User profile created in Firestore");
    process.exit();
  } catch (error) {
    console.error("❌ Error creating Super User profile:", error);
    process.exit(1);
  }
})();
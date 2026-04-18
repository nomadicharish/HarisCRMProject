const { admin, db } = require("./config/firebase");
const { logger } = require("./lib/logger");

const SUPER_USER_UID = "FXLItDg2xzS4wtWs0zpXFywMqcx2";
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

    process.exit();
  } catch (error) {
    logger.error("Error creating Super User profile", {
      message: error?.message,
      stack: error?.stack
    });
    process.exit(1);
  }
})();

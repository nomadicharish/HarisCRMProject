const { admin } = require("./config/firebase");

const SUPER_USER_UID = "FXLItDg2xzS4wtWs0zpXFywMqcx2";

(async () => {
  try {
    await admin.auth().setCustomUserClaims(SUPER_USER_UID, {
      role: "SUPER_USER"
    });

    process.exit();
  } catch (error) {
    console.error("❌ Error setting role:", error);
    process.exit(1);
  }
})();
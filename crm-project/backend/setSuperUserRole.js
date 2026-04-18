const { admin } = require("./config/firebase");
const { logger } = require("./lib/logger");

const SUPER_USER_UID = "FXLItDg2xzS4wtWs0zpXFywMqcx2";

(async () => {
  try {
    await admin.auth().setCustomUserClaims(SUPER_USER_UID, {
      role: "SUPER_USER"
    });

    process.exit();
  } catch (error) {
    logger.error("Error setting role", {
      message: error?.message,
      stack: error?.stack
    });
    process.exit(1);
  }
})();

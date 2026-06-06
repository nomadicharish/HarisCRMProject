const admin = require("firebase-admin");

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
    return admin.credential.cert(serviceAccount);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  try {
    return admin.credential.cert(require("../serviceAccountKey.json"));
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }

    return admin.credential.applicationDefault();
  }
}

// Initialize only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: loadCredential(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "haris-business-crm.firebasestorage.app"
  });
}

const db = admin.firestore();

// Enable ignoring undefined properties to prevent Firestore validation errors
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db };

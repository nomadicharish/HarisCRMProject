const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { getAuth } = require("firebase-admin/auth");

// firebase-admin v13 exposes services through modular entry points. Keep this
// small compatibility facade so the existing application can continue using
// admin.firestore(), admin.storage(), and admin.auth().
const admin = {
  firestore: Object.assign(() => getFirestore(), { FieldPath, FieldValue }),
  storage: () => getStorage(),
  auth: () => getAuth()
};

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
    return cert(serviceAccount);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  try {
    return cert(require("../serviceAccountKey.json"));
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }

    return applicationDefault();
  }
}

// Initialize only once
if (!getApps().length) {
  initializeApp({
    credential: loadCredential(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "haris-business-crm.firebasestorage.app"
  });
}

const db = admin.firestore();

// Enable ignoring undefined properties to prevent Firestore validation errors
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db };

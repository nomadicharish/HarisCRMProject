const { initializeApp, getApps, cert, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

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
const firebaseApp = getApps()[0] || initializeApp({
    credential: loadCredential(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "haris-business-crm.firebasestorage.app"
  });

// Keep the existing application call sites stable while using Firebase Admin's
// supported modular APIs (v14 no longer exposes the legacy namespace helpers).
const firestore = () => getFirestore(firebaseApp);
firestore.FieldPath = FieldPath;
firestore.FieldValue = FieldValue;

const admin = {
  auth: () => getAuth(firebaseApp),
  firestore,
  storage: () => getStorage(firebaseApp)
};

const db = getFirestore(firebaseApp);

// Enable ignoring undefined properties to prevent Firestore validation errors
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db };

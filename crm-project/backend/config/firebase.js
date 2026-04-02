const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

// Initialize only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "haris-business-crm.firebasestorage.app"
  });
}

const db = admin.firestore();

// Enable ignoring undefined properties to prevent Firestore validation errors
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db };
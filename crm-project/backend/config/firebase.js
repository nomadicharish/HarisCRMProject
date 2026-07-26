const { initializeApp, getApps, cert, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const DEFAULT_STORAGE_BUCKET = "haris-business-crm.firebasestorage.app";
const FIREBASE_ENVIRONMENTS = new Set(["qa", "production"]);

function getFirebaseEnvironment() {
  const environment = String(process.env.FIREBASE_ENVIRONMENT || "qa").trim().toLowerCase();
  if (!FIREBASE_ENVIRONMENTS.has(environment)) {
    throw new Error("FIREBASE_ENVIRONMENT must be either 'qa' or 'production'");
  }
  return environment;
}

function getEnvironmentValue(environment, name) {
  const prefix = environment === "production" ? "FIREBASE_PROD" : "FIREBASE_QA";
  return process.env[`${prefix}_${name}`] || process.env[`FIREBASE_${name}`];
}

function loadCredential(environment) {
  const serviceAccountBase64 = getEnvironmentValue(environment, "SERVICE_ACCOUNT_BASE64");
  if (serviceAccountBase64) {
    const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, "base64").toString("utf8"));
    return cert(serviceAccount);
  }

  const serviceAccountJson = getEnvironmentValue(environment, "SERVICE_ACCOUNT_JSON");
  if (serviceAccountJson) {
    return cert(JSON.parse(serviceAccountJson));
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

const firebaseEnvironment = getFirebaseEnvironment();
const storageBucket = getEnvironmentValue(firebaseEnvironment, "STORAGE_BUCKET") || DEFAULT_STORAGE_BUCKET;

// Initialize only once
const firebaseApp = getApps()[0] || initializeApp({
  credential: loadCredential(firebaseEnvironment),
  storageBucket
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

module.exports = { admin, db, firebaseEnvironment, storageBucket };

const { initializeApp, getApps, cert, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const DEFAULT_PROJECT_IDS = {
  dev: "talent-aquisition-dev",
  qa: "talent-aquisition-qa",
  production: "talent-acquisition-2f826"
};
const DEFAULT_STORAGE_BUCKETS = {
  dev: "talent-aquisition-dev.firebasestorage.app",
  qa: "talent-aquisition-qa.firebasestorage.app",
  production: "talent-acquisition-2f826.firebasestorage.app"
};
const FIREBASE_ENVIRONMENTS = new Set(["dev", "qa", "production"]);
const DEFAULT_FIRESTORE_DATABASE_ID = "(default)";

function getFirebaseEnvironment() {
  const environment = String(process.env.FIREBASE_ENVIRONMENT || "dev").trim().toLowerCase();
  if (!FIREBASE_ENVIRONMENTS.has(environment)) {
    throw new Error("FIREBASE_ENVIRONMENT must be 'dev', 'qa', or 'production'");
  }
  return environment;
}

function getEnvironmentValue(environment, name) {
  const prefixes = {
    dev: "FIREBASE_DEV",
    qa: "FIREBASE_QA",
    production: "FIREBASE_PROD"
  };
  const prefix = prefixes[environment];
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
const storageBucket = getEnvironmentValue(firebaseEnvironment, "STORAGE_BUCKET") || DEFAULT_STORAGE_BUCKETS[firebaseEnvironment];
// Application Default Credentials do not always expose their project ID to the
// Firebase Admin SDK (notably in Cloud Run revisions created without an
// explicit project setting). Set it on the app so ID-token verification always
// targets the intended Firebase project.
const firebaseProjectId = String(
  getEnvironmentValue(firebaseEnvironment, "PROJECT_ID") ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  DEFAULT_PROJECT_IDS[firebaseEnvironment]
).trim();
const firestoreDatabaseId = String(
  process.env.FIREBASE_FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE_ID
).trim();

// Initialize only once
const firebaseApp = getApps()[0] || initializeApp({
  credential: loadCredential(firebaseEnvironment),
  storageBucket,
  projectId: firebaseProjectId
});

// Keep the existing application call sites stable while using Firebase Admin's
// supported modular APIs (v14 no longer exposes the legacy namespace helpers).
const firestore = () => getFirestore(firebaseApp, firestoreDatabaseId);
firestore.FieldPath = FieldPath;
firestore.FieldValue = FieldValue;

const admin = {
  auth: () => getAuth(firebaseApp),
  firestore,
  storage: () => getStorage(firebaseApp)
};

const db = getFirestore(firebaseApp, firestoreDatabaseId);

// Enable ignoring undefined properties to prevent Firestore validation errors
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db, firebaseEnvironment, firebaseProjectId, firestoreDatabaseId, storageBucket };

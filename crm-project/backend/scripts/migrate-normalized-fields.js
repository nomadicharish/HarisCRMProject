const { db } = require("../config/firebase");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { logger } = require("../lib/logger");
const { decryptText } = require("../utils/crypto");

const TARGETS = [
  {
    collection: "users",
    emailField: "email",
    phoneField: "contactNumber",
    encryptedEmailField: "emailEncrypted",
    encryptedPhoneField: "contactNumberEncrypted"
  },
  {
    collection: "agencies",
    emailField: "email",
    phoneField: "contactNumber",
    encryptedEmailField: "emailEncrypted",
    encryptedPhoneField: "contactNumberEncrypted"
  },
  {
    collection: "employers",
    emailField: "email",
    phoneField: "contactNumber",
    encryptedEmailField: "emailEncrypted",
    encryptedPhoneField: "contactNumberEncrypted"
  }
];

async function resolveDecryptedValue(encryptedValue) {
  if (!encryptedValue) return "";
  try {
    return await decryptText(encryptedValue);
  } catch {
    return "";
  }
}

async function migrateCollection({ collection, emailField, phoneField, encryptedEmailField, encryptedPhoneField }) {
  const snapshot = await db.collection(collection).get();
  if (snapshot.empty) return { collection, scanned: 0, updated: 0 };

  let scanned = 0;
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snapshot.docs) {
    scanned += 1;
    const data = doc.data() || {};
    const fallbackEmail = encryptedEmailField ? await resolveDecryptedValue(data[encryptedEmailField]) : "";
    const fallbackPhone = encryptedPhoneField ? await resolveDecryptedValue(data[encryptedPhoneField]) : "";
    const normalizedEmail = normalizeEmailValue(data[emailField] || fallbackEmail || "");
    const normalizedContactNumber = normalizePhoneValue(data[phoneField] || fallbackPhone || "");

    const needsEmailUpdate = (data.normalizedEmail || "") !== normalizedEmail;
    const needsPhoneUpdate = (data.normalizedContactNumber || "") !== normalizedContactNumber;
    if (!needsEmailUpdate && !needsPhoneUpdate) continue;

    batch.set(
      doc.ref,
      {
        normalizedEmail,
        normalizedContactNumber,
        updatedAt: new Date()
      },
      { merge: true }
    );
    ops += 1;
    updated += 1;

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  return { collection, scanned, updated };
}

async function run() {
  try {
    const results = [];
    for (const target of TARGETS) {
      results.push(await migrateCollection(target));
    }

    logger.info("Normalized fields migration completed", { results });
    process.exit(0);
  } catch (error) {
    logger.error("Normalized fields migration failed", {
      message: error?.message,
      stack: error?.stack
    });
    process.exit(1);
  }
}

run();

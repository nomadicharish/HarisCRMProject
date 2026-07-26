/*
 * One-time data migration. Convert the application's legacy Google Storage
 * URLs (including signed URLs) to object paths before making the bucket private.
 */
require("dotenv").config();
const { admin, db } = require("../config/firebase");

function toStoragePath(value, bucketName) {
  if (typeof value !== "string") return value;
  const raw = value.trim();
  const publicPrefix = `https://storage.googleapis.com/${bucketName}/`;
  if (raw.startsWith(publicPrefix)) return decodeURIComponent(raw.slice(publicPrefix.length).split("?")[0]);
  if (raw.startsWith(`gs://${bucketName}/`)) return raw.slice(bucketName.length + 6);
  return value;
}

function migrateValue(value, bucketName) {
  if (Array.isArray(value)) {
    const migrated = value.map((item) => migrateValue(item, bucketName));
    return { value: migrated, changed: migrated.some((item, index) => item !== value[index]) };
  }
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value) &&
    typeof value.toDate !== "function" &&
    !value._seconds
  ) {
    let changed = false;
    const migrated = {};
    for (const [key, item] of Object.entries(value)) {
      const result = migrateValue(item, bucketName);
      migrated[key] = result.value;
      changed ||= result.changed;
    }
    return { value: migrated, changed };
  }
  const migrated = toStoragePath(value, bucketName);
  return { value: migrated, changed: migrated !== value };
}

async function migrateCollection(collectionRef, bucketName) {
  const snapshot = await collectionRef.get();
  for (const doc of snapshot.docs) {
    const result = migrateValue(doc.data(), bucketName);
    if (result.changed) await doc.ref.set(result.value, { merge: false });
    const subcollections = await doc.ref.listCollections();
    for (const subcollection of subcollections) await migrateCollection(subcollection, bucketName);
  }
}

async function main() {
  const bucketName = admin.storage().bucket().name;
  const rootCollections = await db.listCollections();
  for (const collection of rootCollections) await migrateCollection(collection, bucketName);
  console.log(`Storage URLs for ${bucketName} have been converted to paths.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

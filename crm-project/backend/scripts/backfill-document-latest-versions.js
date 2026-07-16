require("dotenv").config();

const { admin, db } = require("../config/firebase");

const BATCH_SIZE = 400;
const dryRun = process.argv.includes("--dry-run");

function buildLegacyLatestVersion(data = {}) {
  if (!data.fileUrl) return null;
  return {
    id: "legacy-root",
    fileUrl: data.fileUrl,
    status: String(data.status || "PENDING").toUpperCase(),
    uploadedAt: data.uploadedAt || null,
    uploadedBy: data.uploadedBy || "",
    uploadedByRole: data.uploadedByRole || "",
    rejectedReason: data.rejectedReason || "",
    fileName: data.fileName || "",
    contentType: data.contentType || "",
    sizeBytes: Number(data.sizeBytes || 0)
  };
}

async function getBackfillPayload(documentDoc) {
  const data = documentDoc.data() || {};
  if (data.latestVersion?.id || data.latestVersion?.status || data.latestVersion?.fileUrl) return null;

  const latestVersionSnap = await documentDoc.ref
    .collection("versions")
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();

  if (!latestVersionSnap.empty) {
    const version = latestVersionSnap.docs[0];
    const versionData = version.data() || {};
    return {
      latestVersion: { id: version.id, ...versionData },
      latestStatus: String(versionData.status || "PENDING").toUpperCase()
    };
  }

  const legacyLatestVersion = buildLegacyLatestVersion(data);
  return legacyLatestVersion
    ? { latestVersion: legacyLatestVersion, latestStatus: legacyLatestVersion.status }
    : null;
}

async function run() {
  const applicants = await db.collection("applicants").get();
  let scanned = 0;
  let updated = 0;
  let batch = db.batch();
  let batchWrites = 0;

  for (const applicant of applicants.docs) {
    const documents = await applicant.ref.collection("documents").get();
    for (const documentDoc of documents.docs) {
      scanned += 1;
      const payload = await getBackfillPayload(documentDoc);
      if (!payload) continue;

      updated += 1;
      if (!dryRun) {
        batch.set(documentDoc.ref, payload, { merge: true });
        batchWrites += 1;
        if (batchWrites === BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchWrites = 0;
        }
      }
    }
  }

  if (!dryRun && batchWrites) await batch.commit();
  console.log(`${dryRun ? "Would backfill" : "Backfilled"} latestVersion for ${updated} of ${scanned} document records.`);
}

run().catch((error) => {
  console.error("Document latest-version backfill failed", error);
  process.exitCode = 1;
});

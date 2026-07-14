require("dotenv").config();

const { admin, db } = require("../config/firebase");
const { buildApplicantListDerivedFields } = require("../services/applicantDomainService");

const BATCH_SIZE = 400;

async function run() {
  const snapshot = await db.collection("applicants").get();
  let updated = 0;

  for (let offset = 0; offset < snapshot.docs.length; offset += BATCH_SIZE) {
    const batch = db.batch();
    snapshot.docs.slice(offset, offset + BATCH_SIZE).forEach((doc) => {
      const data = doc.data() || {};
      const derived = buildApplicantListDerivedFields(data);
      batch.set(doc.ref, {
        workflowStatus: derived.workflowStatus,
        attentionRequired: derived.attentionRequired,
        searchText: derived.searchText,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      updated += 1;
    });
    await batch.commit();
  }

  console.log(`Backfilled workflow fields for ${updated} applicants.`);
}

run().catch((error) => {
  console.error("Applicant workflow-field backfill failed", error);
  process.exitCode = 1;
});

const { db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { upsertApplicantSearchRecord } = require("../services/searchIndexService");

async function run() {
  try {
    const snapshot = await db.collection("applicants").get();
    let processed = 0;
    for (const doc of snapshot.docs) {
      await upsertApplicantSearchRecord(doc.id, doc.data() || {});
      processed += 1;
    }

    logger.info("Search index backfill completed", { processed });
    process.exit(0);
  } catch (error) {
    logger.error("Search index backfill failed", {
      message: error?.message,
      stack: error?.stack
    });
    process.exit(1);
  }
}

run();

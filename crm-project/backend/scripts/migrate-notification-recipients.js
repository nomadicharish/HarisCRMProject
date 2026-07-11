const { db } = require("../config/firebase");
const { addAppNotificationEvent } = require("../services/notificationService");

const COLLECTION = "notificationEvents";
const MAX_EVENTS = Math.max(1, Math.min(2000, Number(process.env.NOTIFICATION_MIGRATION_LIMIT || 500)));

async function run() {
  const snapshot = await db.collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(MAX_EVENTS)
    .get();
  const legacyDocs = snapshot.docs.filter((doc) => !doc.data()?.userId && !doc.data()?.recipientMigrationCompletedAt);
  let migrated = 0;

  for (const doc of legacyDocs) {
    const event = doc.data() || {};
    await addAppNotificationEvent(event, { sourceEventId: doc.id });
    await doc.ref.set({ recipientMigrationCompletedAt: new Date() }, { merge: true });
    migrated += 1;
  }

  console.log(JSON.stringify({ scanned: snapshot.size, legacyEvents: legacyDocs.length, migrated }));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

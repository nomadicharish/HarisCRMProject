require("dotenv").config();

const { admin, db, firebaseEnvironment, firebaseProjectId } = require("../config/firebase");
const { RIGHTS, getDefaultRights } = require("../config/userRights");

const BATCH_SIZE = 400;

function normalizedRights(user = {}) {
  const explicitRights = Array.isArray(user.rights) ? user.rights.filter((right) => RIGHTS.includes(right)) : [];
  return [...new Set([...getDefaultRights(user.role), ...explicitRights])].sort();
}

function sameRights(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function run() {
  const snapshot = await db.collection("users").get();
  const updates = snapshot.docs.filter((doc) => {
    const currentRights = Array.isArray(doc.data()?.rights) ? [...new Set(doc.data().rights)].sort() : [];
    return !sameRights(currentRights, normalizedRights(doc.data()));
  });

  for (let offset = 0; offset < updates.length; offset += BATCH_SIZE) {
    const batch = db.batch();
    updates.slice(offset, offset + BATCH_SIZE).forEach((doc) => {
      batch.set(doc.ref, {
        rights: normalizedRights(doc.data()),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  }

  console.log(JSON.stringify({
    environment: firebaseEnvironment,
    projectId: firebaseProjectId,
    scanned: snapshot.size,
    updated: updates.length
  }));
}

run().catch((error) => {
  console.error("User default-rights synchronization failed", error);
  process.exitCode = 1;
});

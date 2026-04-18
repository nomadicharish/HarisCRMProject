const { incrementFirestoreReads } = require("../lib/perfContext");

const PATCHED_FLAG = Symbol.for("crm.firestore.instrumented");

function countQueryReads(snapshot) {
  if (!snapshot) return 0;
  if (typeof snapshot.size === "number") return snapshot.size;
  if (Array.isArray(snapshot.docs)) return snapshot.docs.length;
  return 0;
}

function instrumentFirestore(db) {
  const documentRefProto = Object.getPrototypeOf(db.collection("_probe").doc("_probe"));
  const queryProto = Object.getPrototypeOf(db.collection("_probe").limit(1));

  if (!documentRefProto[PATCHED_FLAG]) {
    const originalDocGet = documentRefProto.get;
    documentRefProto.get = async function patchedDocumentGet(...args) {
      const snapshot = await originalDocGet.apply(this, args);
      incrementFirestoreReads(1);
      return snapshot;
    };
    documentRefProto[PATCHED_FLAG] = true;
  }

  if (!queryProto[PATCHED_FLAG]) {
    const originalQueryGet = queryProto.get;
    queryProto.get = async function patchedQueryGet(...args) {
      const snapshot = await originalQueryGet.apply(this, args);
      incrementFirestoreReads(countQueryReads(snapshot));
      return snapshot;
    };
    queryProto[PATCHED_FLAG] = true;
  }
}

module.exports = { instrumentFirestore };

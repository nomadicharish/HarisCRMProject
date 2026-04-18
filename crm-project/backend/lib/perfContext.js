const { AsyncLocalStorage } = require("node:async_hooks");

const perfStorage = new AsyncLocalStorage();

function runWithPerfContext(context, callback) {
  return perfStorage.run(context, callback);
}

function getPerfContext() {
  return perfStorage.getStore() || null;
}

function incrementFirestoreReads(count = 0) {
  const context = getPerfContext();
  if (!context) return;
  context.firestoreReads = Number(context.firestoreReads || 0) + Math.max(0, Number(count || 0));
}

module.exports = {
  getPerfContext,
  incrementFirestoreReads,
  runWithPerfContext
};

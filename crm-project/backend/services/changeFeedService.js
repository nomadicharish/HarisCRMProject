const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");

async function emitChangeEvent({
  entityType = "",
  entityId = "",
  action = "",
  actorId = "",
  actorRole = "",
  correlationId = "",
  payload = {}
} = {}) {
  const event = {
    entityType: String(entityType || ""),
    entityId: String(entityId || ""),
    action: String(action || ""),
    actorId: String(actorId || ""),
    actorRole: String(actorRole || ""),
    correlationId: String(correlationId || ""),
    payload: payload && typeof payload === "object" ? payload : {},
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection("changeEvents").add(event);
  } catch (error) {
    logger.warn("Failed to persist change feed event", {
      action,
      entityType,
      entityId,
      message: error?.message
    });
  }
}

async function listChangeEvents({ limit = 100, after = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeAfter = Number(after) || 0;

  let query = db.collection("changeEvents").orderBy("createdAt", "desc").limit(safeLimit);
  if (safeAfter > 0) {
    query = query.where("createdAt", ">", new Date(safeAfter));
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}

module.exports = {
  emitChangeEvent,
  listChangeEvents
};

const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");

async function logAuditEvent({
  actorId = "",
  actorRole = "",
  action = "",
  entityType = "",
  entityId = "",
  status = "INFO",
  metadata = {}
} = {}) {
  const payload = {
    actorId: String(actorId || ""),
    actorRole: String(actorRole || ""),
    action: String(action || ""),
    entityType: String(entityType || ""),
    entityId: String(entityId || ""),
    status: String(status || "INFO"),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection("auditLogs").add(payload);
  } catch (error) {
    logger.warn("Failed to persist audit log", {
      action,
      entityType,
      entityId,
      message: error?.message
    });
  }
}

module.exports = { logAuditEvent };

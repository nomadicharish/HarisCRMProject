const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { getRequestContext } = require("../lib/requestContext");

async function logAuditEvent({
  actorId = "",
  actorRole = "",
  action = "",
  entityType = "",
  entityId = "",
  status = "INFO",
  source = "HUMAN",
  correlationId = "",
  idempotencyKey = "",
  metadata = {}
} = {}) {
  const requestContext = getRequestContext();
  const payload = {
    actorId: String(actorId || ""),
    actorRole: String(actorRole || ""),
    action: String(action || ""),
    entityType: String(entityType || ""),
    entityId: String(entityId || ""),
    status: String(status || "INFO"),
    source: String(source || "HUMAN"),
    correlationId: String(correlationId || requestContext?.correlationId || ""),
    idempotencyKey: String(idempotencyKey || ""),
    requestPath: String(requestContext?.requestPath || ""),
    method: String(requestContext?.method || ""),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + Number(process.env.AUDIT_LOG_TTL_DAYS || 90) * 24 * 60 * 60 * 1000)
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

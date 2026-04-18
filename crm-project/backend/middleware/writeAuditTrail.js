const { logAuditEvent } = require("../services/auditLogService");
const { emitChangeEvent } = require("../services/changeFeedService");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function writeAuditTrail(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) {
    return next();
  }

  res.on("finish", async () => {
    const actorId = req.user?.uid || "";
    const actorRole = req.user?.role || "";
    const source = String(req.headers["x-actor-type"] || "HUMAN").toUpperCase() === "AGENT"
      ? "AGENT"
      : "HUMAN";

    const metadata = {
      method: req.method,
      path: req.originalUrl || req.path || "",
      statusCode: res.statusCode
    };

    await logAuditEvent({
      actorId,
      actorRole,
      action: "HTTP_WRITE",
      entityType: "http",
      entityId: req.originalUrl || req.path || "",
      status: res.statusCode >= 400 ? "ERROR" : "SUCCESS",
      source,
      correlationId: req.correlationId || "",
      idempotencyKey: req.idempotencyKey || "",
      metadata
    });

    await emitChangeEvent({
      entityType: "http",
      entityId: req.originalUrl || req.path || "",
      action: `${req.method}_WRITE`,
      actorId,
      actorRole,
      correlationId: req.correlationId || "",
      payload: metadata
    });
  });

  return next();
}

module.exports = { writeAuditTrail };

const { randomUUID } = require("node:crypto");
const { runWithRequestContext } = require("../lib/requestContext");

function correlationId(req, res, next) {
  const incoming = String(req.headers["x-correlation-id"] || "").trim();
  const correlationId = incoming || randomUUID();
  req.correlationId = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);

  runWithRequestContext(
    {
      correlationId,
      requestPath: req.originalUrl || req.path || "",
      method: req.method
    },
    next
  );
}

module.exports = { correlationId };

const { logger } = require("../lib/logger");
const { runWithPerfContext } = require("../lib/perfContext");
const { recordRequestMetric } = require("../services/observabilityService");

function performanceMetrics(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const context = { firestoreReads: 0 };
  const originalEnd = res.end;
  let headersApplied = false;

  runWithPerfContext(context, () => {
    res.end = function patchedEnd(...args) {
      if (!headersApplied) {
        const elapsedNs = process.hrtime.bigint() - startedAt;
        const latencyMs = Number(elapsedNs) / 1_000_000;
        const firestoreReads = Number(context.firestoreReads || 0);

        // Some response paths may have already committed headers.
        if (!res.headersSent) {
          res.setHeader("X-Perf-Latency-Ms", String(Math.round(latencyMs)));
          res.setHeader("X-Perf-Firestore-Reads", String(firestoreReads));
        }

        headersApplied = true;
      }

      return originalEnd.apply(this, args);
    };

    res.on("finish", () => {
      const elapsedNs = process.hrtime.bigint() - startedAt;
      const latencyMs = Number(elapsedNs) / 1_000_000;
      const firestoreReads = Number(context.firestoreReads || 0);
      const roundedLatencyMs = Math.round(latencyMs * 100) / 100;

      recordRequestMetric({
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        latencyMs: roundedLatencyMs,
        firestoreReads,
        correlationId: req.correlationId || ""
      });

      logger.info("Request completed", {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        correlationId: req.correlationId || "",
        latencyMs: roundedLatencyMs,
        firestoreReads
      });
    });

    next();
  });
}

module.exports = { performanceMetrics };

const { createHash } = require("node:crypto");
const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IDEMPOTENCY_TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS || 24 * 60 * 60 * 1000);

function buildDocId(userId, method, path, key) {
  const value = `${userId}:${method}:${path}:${key}`;
  return createHash("sha256").update(value).digest("hex");
}

function idempotency() {
  return async function idempotencyMiddleware(req, res, next) {
    if (!WRITE_METHODS.has(req.method)) return next();

    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
    if (!idempotencyKey) return next();

    const authHeaderFingerprint = String(req.headers.authorization || "").trim()
      ? createHash("sha256").update(String(req.headers.authorization || "")).digest("hex").slice(0, 16)
      : "";
    const userId = String(req.user?.uid || (authHeaderFingerprint ? `auth:${authHeaderFingerprint}` : "anonymous"));
    const method = req.method;
    const path = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    const docId = buildDocId(userId, method, path, idempotencyKey);
    const docRef = db.collection("idempotencyKeys").doc(docId);
    req.idempotencyKey = idempotencyKey;

    try {
      const existing = await docRef.get();
      if (existing.exists) {
        const data = existing.data() || {};
        const updatedAt = Number(data.updatedAtMs || 0);
        const isExpired = updatedAt > 0 && Date.now() - updatedAt > IDEMPOTENCY_TTL_MS;

        if (!isExpired && data.status === "COMPLETED") {
          res.setHeader("X-Idempotent-Replay", "true");
          return res.status(Number(data.responseStatusCode || 200)).json(data.responseBody || {});
        }

        if (!isExpired && data.status === "IN_PROGRESS") {
          return res.status(409).json({
            message: "A request with this idempotency key is still in progress"
          });
        }
      }

      await docRef.set(
        {
          key: idempotencyKey,
          method,
          path,
          userId,
          status: "IN_PROGRESS",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAtMs: Date.now()
        },
        { merge: true }
      );

      const originalJson = res.json.bind(res);
      res.json = function patchedJson(body) {
        docRef
          .set(
            {
              status: "COMPLETED",
              responseStatusCode: res.statusCode,
              responseBody: body,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAtMs: Date.now()
            },
            { merge: true }
          )
          .catch((error) => {
            logger.warn("Failed to persist idempotency response", {
              message: error?.message,
              path,
              method
            });
          });

        return originalJson(body);
      };
    } catch (error) {
      logger.warn("Idempotency middleware fallback", {
        message: error?.message,
        path,
        method
      });
    }

    return next();
  };
}

module.exports = { idempotency };

const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");

const TOKEN_CACHE_TTL_MS = Number(process.env.AUTH_TOKEN_CACHE_TTL_MS || 15_000);
const USER_PROFILE_CACHE_TTL_MS = Number(process.env.AUTH_USER_PROFILE_CACHE_TTL_MS || 30_000);
const AUTH_USER_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS || 60_000);
const AUTH_ADMIN_PATH_PREFIXES = String(
  process.env.AUTH_ADMIN_PATH_PREFIXES || "/api/users/disable,/api/auth/disable-user"
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const tokenCache = new Map();
const userProfileCache = new Map();
const authUserCache = new Map();

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return "";

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return "";
  return token.trim();
}

function getCached(cache, key) {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(cache, key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, ttlMs)
  });
}

async function decodeTokenCached(token) {
  const cached = getCached(tokenCache, token);
  if (cached) return cached;
  const decoded = await admin.auth().verifyIdToken(token, true);
  setCached(tokenCache, token, decoded, TOKEN_CACHE_TTL_MS);
  return decoded;
}

async function getUserProfileCached(uid) {
  const cached = getCached(userProfileCache, uid);
  if (cached) return cached;
  const userDoc = await db.collection("users").doc(uid).get();
  const userProfile = userDoc.exists ? userDoc.data() : null;
  setCached(userProfileCache, uid, userProfile, USER_PROFILE_CACHE_TTL_MS);
  return userProfile;
}

async function getAuthUserCached(uid) {
  const cached = getCached(authUserCache, uid);
  if (cached) return cached;
  const authUser = await admin.auth().getUser(uid);
  setCached(authUserCache, uid, authUser, AUTH_USER_CACHE_TTL_MS);
  return authUser;
}

function shouldFetchAuthUser(req) {
  const requestPath = String(req.originalUrl || req.path || "").split("?")[0];
  return AUTH_ADMIN_PATH_PREFIXES.some((prefix) => requestPath.startsWith(prefix));
}

const verifyToken = async (req, res, next) => {
  try {
    if (String(process.env.TEST_BYPASS_AUTH || "").toLowerCase() === "true") {
      req.user = {
        uid: req.headers["x-test-user-id"] || "test-user-id",
        role: req.headers["x-test-user-role"] || "SUPER_USER",
        tokenIssuedAt: 0,
        agencyId: req.headers["x-test-agency-id"] || null,
        employerId: req.headers["x-test-employer-id"] || null,
        forcePasswordReset: false,
        active: true
      };
      return next();
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = await decodeTokenCached(token);

    const userProfile = await getUserProfileCached(decoded.uid);

    if (!userProfile?.active) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (shouldFetchAuthUser(req)) {
      const authUser = await getAuthUserCached(decoded.uid);
      if (authUser?.disabled) {
        return res.status(401).json({ message: "Unauthorized" });
      }
    }

    const role = decoded.role || userProfile?.role;

    if (!role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = {
      uid: decoded.uid,
      role,
      tokenIssuedAt: decoded.iat || 0,
      agencyId: userProfile?.agencyId || null,
      employerId: userProfile?.employerId || null,
      agentScopes: Array.isArray(userProfile?.agentScopes) ? userProfile.agentScopes : [],
      forcePasswordReset: Boolean(userProfile?.forcePasswordReset),
      active: Boolean(userProfile?.active)
    };

    next();

  } catch (error) {
    logger.warn("Token verification failed", {
      path: req.originalUrl,
      message: error?.message
    });
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = { verifyToken };

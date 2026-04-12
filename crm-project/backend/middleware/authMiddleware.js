const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return "";

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return "";
  return token.trim();
}

const verifyToken = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = await admin.auth().verifyIdToken(token, true);

    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;
    const authUser = await admin.auth().getUser(decoded.uid);

    if (!userProfile?.active || authUser.disabled) {
      return res.status(401).json({ message: "Unauthorized" });
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

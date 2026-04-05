const { admin, db } = require("../config/firebase");

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token, true);

    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;
    const authUser = await admin.auth().getUser(decoded.uid);

    if (!userProfile?.active || authUser.disabled) {
      return res.status(401).json({ message: "User account is inactive" });
    }

    const role = decoded.role || userProfile?.role;

    if (!role) {
      return res.status(401).json({ message: "User role not found" });
    }

    req.user = {
      uid: decoded.uid,
      role,
      agencyId: userProfile?.agencyId || null,
      employerId: userProfile?.employerId || null,
      forcePasswordReset: Boolean(userProfile?.forcePasswordReset),
      active: Boolean(userProfile?.active)
    };

    next();

  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = { verifyToken };

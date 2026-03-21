const { admin, db } = require("../config/firebase");

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);

    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const role = decoded.role || userProfile?.role;

    req.user = {
      uid: decoded.uid,
      role,
      agencyId: userProfile?.agencyId || null,
      employerId: userProfile?.employerId || null
    };

    next();

  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = { verifyToken };

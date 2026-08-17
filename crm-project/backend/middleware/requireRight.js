const { hasRight } = require("../config/userRights");

module.exports = (...rights) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (rights.every((right) => hasRight(req.user, right))) return next();
  return res.status(403).json({ message: "Access denied" });
};

const { expandAllowedRoles } = require("../utils/roles");

const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!expandAllowedRoles(allowedRoles).includes(req.user.role)) {
      return res.status(403).json({ message: "Access Denied" });
    }

    next();
  };
};

module.exports = allowRoles;

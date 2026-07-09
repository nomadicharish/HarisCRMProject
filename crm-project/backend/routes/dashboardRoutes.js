const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../lib/asyncHandler");
const { validate } = require("../middleware/validate");
const { dashboardQuerySchema } = require("../validators/applicantSchemas");
const dashboardController = require("../controllers/dashboardController");

router.get(
  "/",
  verifyToken,
  (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  },
  validate(dashboardQuerySchema, "query"),
  asyncHandler(dashboardController.getDashboard)
);

module.exports = router;

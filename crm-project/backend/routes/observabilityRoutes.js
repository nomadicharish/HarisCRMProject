const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const { verifyToken } = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const { validate } = require("../middleware/validate");
const observabilityController = require("../controllers/observabilityController");
const { recentLimitQuerySchema } = require("../validators/observabilitySchemas");

const router = express.Router();

router.get("/health", asyncHandler(observabilityController.getHealth));
router.get(
  "/metrics",
  verifyToken,
  allowRoles("SUPER_USER", "ACCOUNTANT"),
  validate(recentLimitQuerySchema, "query"),
  asyncHandler(observabilityController.getMetrics)
);

module.exports = router;


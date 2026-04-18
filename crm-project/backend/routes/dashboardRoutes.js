const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../lib/asyncHandler");
const { readCache } = require("../middleware/cacheControl");
const { validate } = require("../middleware/validate");
const { dashboardQuerySchema } = require("../validators/applicantSchemas");
const dashboardController = require("../controllers/dashboardController");

router.get("/", readCache(20), verifyToken, validate(dashboardQuerySchema, "query"), asyncHandler(dashboardController.getDashboard));

module.exports = router;

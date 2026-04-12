const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../lib/asyncHandler");
const { noStore } = require("../middleware/noStore");
const { validate } = require("../middleware/validate");
const { dashboardQuerySchema } = require("../validators/applicantSchemas");
const dashboardController = require("../controllers/dashboardController");

router.get("/", noStore, verifyToken, validate(dashboardQuerySchema, "query"), asyncHandler(dashboardController.getDashboard));

module.exports = router;

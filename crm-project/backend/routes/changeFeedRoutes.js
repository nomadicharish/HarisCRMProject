const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const { verifyToken } = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const { validate } = require("../middleware/validate");
const { createWebhookSchema, listChangeFeedQuerySchema } = require("../validators/changeFeedSchemas");
const changeFeedController = require("../controllers/changeFeedController");

const router = express.Router();

router.use(verifyToken);
router.use(allowRoles("SUPER_USER", "ACCOUNTANT"));

router.get("/events", validate(listChangeFeedQuerySchema, "query"), asyncHandler(changeFeedController.getEvents));
router.post("/webhooks", validate(createWebhookSchema), asyncHandler(changeFeedController.registerWebhook));

module.exports = router;

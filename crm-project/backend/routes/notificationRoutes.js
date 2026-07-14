const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const notificationController = require("../controllers/notificationController");
const { verifyToken } = require("../middleware/authMiddleware");
const { noStore } = require("../middleware/noStore");

const router = express.Router();

router.use(verifyToken);
router.use(noStore);

router.get("/", asyncHandler(notificationController.listNotifications));
router.get("/unread-count", asyncHandler(notificationController.unreadCount));
router.patch("/read", asyncHandler(notificationController.markAllRead));
router.patch("/:id/read", asyncHandler(notificationController.markOneRead));

module.exports = router;

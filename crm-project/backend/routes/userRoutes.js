const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../lib/asyncHandler");
const upload = require("../middleware/uploadMiddleware");

router.get("/", verifyToken, asyncHandler(userController.listUsers));
router.get("/:uid", verifyToken, asyncHandler(userController.getUser));
router.post("/", verifyToken, asyncHandler(userController.createUser));
router.post("/create", verifyToken, asyncHandler(userController.createUser));
router.post("/:uid/reset-password", verifyToken, asyncHandler(userController.resetUserPassword));
router.post("/:uid/profile-photo", verifyToken, upload.single("file"), asyncHandler(userController.uploadUserProfilePhoto));
router.patch("/:uid", verifyToken, asyncHandler(userController.updateUser));
router.delete("/:uid", verifyToken, asyncHandler(userController.removeUser));

module.exports = router;

const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");
const { verifyToken } = require("../middleware/authMiddleware");

router.post("/create", verifyToken, userController.createUser);

module.exports = router;

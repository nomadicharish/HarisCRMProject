const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const { verifyToken } = require("../middleware/authMiddleware");
const { noStore } = require("../middleware/noStore");
const { streamFile } = require("../controllers/fileController");

const router = express.Router();

router.get("/", verifyToken, noStore, asyncHandler(streamFile));

module.exports = router;

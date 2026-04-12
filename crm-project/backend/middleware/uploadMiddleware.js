const multer = require("multer");
const { AppError } = require("../lib/AppError");

const storage = multer.memoryStorage();
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png"
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(new AppError("Unsupported file type", 400));
    }

    return callback(null, true);
  }
});

module.exports = upload;

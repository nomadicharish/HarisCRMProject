const multer = require("multer");
const { AppError } = require("../lib/AppError");
const { withMalwareScan } = require("./malwareScanUpload");

const storage = multer.memoryStorage();
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(new AppError("Only PDF, JPEG, JPG and PNG files are allowed", 400));
    }

    return callback(null, true);
  }
});

module.exports = withMalwareScan(upload);

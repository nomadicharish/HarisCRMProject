const multer = require("multer");
const { AppError } = require("../lib/AppError");

const storage = multer.memoryStorage();
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);
const LEGACY_WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/doc",
  "application/vnd.ms-word",
  "application/x-msword"
]);

function isApplicantDocumentUpload(req, file) {
  const url = String(req.originalUrl || "");
  const extension = String(file?.originalname || "").split(".").pop().toLowerCase();
  return extension === "doc" && LEGACY_WORD_MIME_TYPES.has(file?.mimetype) && (
    url.includes("/upload-document") ||
    /\/documents\/[^/]+\/upload(?:$|\?)/.test(url)
  );
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) && !isApplicantDocumentUpload(req, file)) {
      return callback(new AppError("Only PDF, JPEG, JPG and PNG files are allowed", 400));
    }

    return callback(null, true);
  }
});

module.exports = upload;

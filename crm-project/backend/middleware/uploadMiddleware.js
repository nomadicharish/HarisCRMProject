const multer = require("multer");
const { AppError } = require("../lib/AppError");
const { withMalwareScan } = require("./malwareScanUpload");

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
  "application/x-msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/octet-stream"
]);

function isApplicantDocumentUpload(req, file) {
  const url = String(req.originalUrl || "");
  const extension = String(file?.originalname || "").split(".").pop().toLowerCase();
  return (extension === "doc" || extension === "docx") && LEGACY_WORD_MIME_TYPES.has(file?.mimetype) && (
    url.includes("/upload-document") ||
    /\/documents\/[^/]+\/upload(?:$|\?)/.test(url)
  );
}

function isStandardReferenceUpload(req, file) {
  const extension = String(file?.originalname || "").split(".").pop().toLowerCase();
  return (extension === "doc" || extension === "docx") && LEGACY_WORD_MIME_TYPES.has(file?.mimetype) &&
    String(req.originalUrl || "").includes("/common-documents/standard-reference");
}

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
    fields: 30,
    parts: 40,
    fieldNameSize: 100
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) && !isApplicantDocumentUpload(req, file) && !isStandardReferenceUpload(req, file)) {
      return callback(new AppError("Only PDF, JPEG, JPG, PNG, DOC and DOCX files are allowed", 400));
    }

    return callback(null, true);
  }
});

module.exports = withMalwareScan(upload);

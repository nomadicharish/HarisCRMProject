export const DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "jpeg", "jpg", "png"];
export const DOC_ONLY_EXTENSIONS = ["doc"];
export const ALLOWED_DOCUMENT_ACCEPT = ".pdf,.jpeg,.jpg,.png";
export const DOC_ONLY_ACCEPT = ".doc";
export const MAX_DOCUMENT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_UPLOAD_HELP_TEXT = "Upload PDF, PNG, JPEG or JPG (Max 5 MB)";
export const DOC_UPLOAD_HELP_TEXT = "Upload DOC (Max 5 MB)";

const MIME_TYPES_BY_EXTENSION = {
  pdf: ["application/pdf"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  png: ["image/png"],
  doc: ["application/msword", "application/doc", "application/vnd.ms-word", "application/x-msword"]
};

export function normalizeAllowedExtensions(allowedExtensions = DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS) {
  const normalized = Array.isArray(allowedExtensions)
    ? allowedExtensions.map((item) => String(item || "").replace(".", "").trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS;
  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS;
}

export function getAcceptForExtensions(allowedExtensions = DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS) {
  return normalizeAllowedExtensions(allowedExtensions).map((extension) => `.${extension}`).join(",");
}

export function getUploadHelpText(allowedExtensions = DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS) {
  const normalized = normalizeAllowedExtensions(allowedExtensions);
  if (normalized.length === 1 && normalized[0] === "doc") return DOC_UPLOAD_HELP_TEXT;
  return DOCUMENT_UPLOAD_HELP_TEXT;
}

function getAllowedTypeSets(allowedExtensions) {
  const normalized = normalizeAllowedExtensions(allowedExtensions);
  return {
    extensions: new Set(normalized),
    types: new Set(normalized.flatMap((extension) => MIME_TYPES_BY_EXTENSION[extension] || []))
  };
}

export function validateDocumentFile(file, allowedExtensions = DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS) {
  if (!file) return { valid: true, message: "" };

  const normalized = normalizeAllowedExtensions(allowedExtensions);
  const allowedLabel = normalized.map((extension) => extension.toUpperCase()).join(", ");
  const { extensions, types } = getAllowedTypeSets(normalized);
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  const hasValidType = types.has(file.type) || extensions.has(extension);
  if (!hasValidType) {
    return { valid: false, message: `Only ${allowedLabel} files are allowed` };
  }
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return { valid: false, message: "File size must be 5 MB or smaller" };
  }
  return { valid: true, message: "" };
}

export function validateDocumentFiles(files = [], allowedExtensions = DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS) {
  const invalidFile = files.filter(Boolean).find((file) => !validateDocumentFile(file, allowedExtensions).valid);
  return validateDocumentFile(invalidFile, allowedExtensions);
}

export function getValidatedDocumentFile(file, onError, allowedExtensions = DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS) {
  const validation = validateDocumentFile(file, allowedExtensions);
  if (!validation.valid) {
    if (typeof onError === "function") onError(validation.message);
    return null;
  }
  return file || null;
}

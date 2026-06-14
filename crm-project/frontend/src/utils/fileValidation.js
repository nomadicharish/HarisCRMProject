export const ALLOWED_DOCUMENT_ACCEPT = ".pdf,.jpeg,.jpg,.png";
export const MAX_DOCUMENT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_UPLOAD_HELP_TEXT = "Upload PDF, PNG, JPEG or JPG (Max 5 MB)";

const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(["pdf", "jpeg", "jpg", "png"]);

export function validateDocumentFile(file) {
  if (!file) return { valid: true, message: "" };

  const extension = String(file.name || "").split(".").pop().toLowerCase();
  const hasValidType = ALLOWED_DOCUMENT_TYPES.has(file.type) || ALLOWED_DOCUMENT_EXTENSIONS.has(extension);
  if (!hasValidType) {
    return { valid: false, message: "Only PDF, JPEG, JPG and PNG files are allowed" };
  }
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return { valid: false, message: "File size must be 5 MB or smaller" };
  }
  return { valid: true, message: "" };
}

export function validateDocumentFiles(files = []) {
  const invalidFile = files.filter(Boolean).find((file) => !validateDocumentFile(file).valid);
  return validateDocumentFile(invalidFile);
}

export function getValidatedDocumentFile(file, onError) {
  const validation = validateDocumentFile(file);
  if (!validation.valid) {
    if (typeof onError === "function") onError(validation.message);
    return null;
  }
  return file || null;
}

export const ALLOWED_DOCUMENT_ACCEPT = ".pdf,.jpeg,.jpg,.png";

const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(["pdf", "jpeg", "jpg", "png"]);

export function validateDocumentFile(file) {
  if (!file) return { valid: true, message: "" };

  const extension = String(file.name || "").split(".").pop().toLowerCase();
  const valid = ALLOWED_DOCUMENT_TYPES.has(file.type) || ALLOWED_DOCUMENT_EXTENSIONS.has(extension);
  return {
    valid,
    message: valid ? "" : "Only PDF, JPEG, JPG and PNG files are allowed"
  };
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

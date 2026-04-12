function normalizeIdList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeEmailValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhoneValue(value) {
  return String(value || "").replace(/\D/g, "");
}

function buildCompanyDocumentId(value, fallbackIndex = 0) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `document_${fallbackIndex + 1}`;
}

function normalizeCompanyDocuments(value) {
  if (!Array.isArray(value)) return [];

  return value.reduce((documents, item, index) => {
    if (!item || typeof item !== "object") return documents;

    const name = String(item.name || item.label || "").trim();
    const id = String(item.id || item.docType || buildCompanyDocumentId(name, index)).trim();

    if (!name || !id) return documents;

    documents.push({
      id,
      name,
      required: Boolean(item.required),
      templateFileName: String(item.templateFileName || "").trim(),
      templateFileUrl: String(item.templateFileUrl || "").trim(),
      updatedAt: new Date()
    });

    return documents;
  }, []);
}

module.exports = {
  normalizeIdList,
  normalizeEmailValue,
  normalizePhoneValue,
  buildCompanyDocumentId,
  normalizeCompanyDocuments
};

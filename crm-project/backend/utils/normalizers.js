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
      documentToFillFileName: String(item.documentToFillFileName || item.fillDocumentFileName || item.templateFileName || "").trim(),
      documentToFillUrl: String(item.documentToFillUrl || item.fillDocumentUrl || item.templateFileUrl || "").trim(),
      referenceFileName: String(item.referenceFileName || item.referenceDocumentFileName || "").trim(),
      referenceUrl: String(item.referenceUrl || item.referenceDocumentUrl || "").trim(),
      updatedAt: new Date()
    });

    return documents;
  }, []);
}

const DEFAULT_COMPANY_POSITION_DOCUMENTS = [
  { id: "passport", name: "Passport", required: true },
  { id: "passport_size_photo", name: "Passport Size photo", required: true },
  { id: "10th_education_certificate", name: "10th Education Certificate", required: true },
  { id: "12th_education_certificate", name: "12th Education Certificate", required: true },
  { id: "work_wear_measurement", name: "Work Wear measurement", required: true },
  { id: "international_driving_permit_optional", name: "International Driving Permit", required: false },
  { id: "birth_certificate", name: "Birth Certificate", required: true },
  { id: "medical_certificate", name: "Medical Certificate", required: true }
];

function buildCompanyJobSpecificationId(value, fallbackIndex = 0) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `job_specification_${fallbackIndex + 1}`;
}

function normalizeCompanyJobSpecifications(value) {
  if (!Array.isArray(value)) return [];

  return value.reduce((specifications, item, index) => {
    if (!item || typeof item !== "object") return specifications;

    const name = String(item.name || item.label || "").trim();
    const id = String(item.id || buildCompanyJobSpecificationId(name, index)).trim();

    if (!name || !id) return specifications;

    specifications.push({
      id,
      name,
      updatedAt: new Date()
    });

    return specifications;
  }, []);
}

function buildCompanyJobPositionId(value, fallbackIndex = 0) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `job_position_${fallbackIndex + 1}`;
}

function createDefaultCompanyPositionDocuments() {
  return DEFAULT_COMPANY_POSITION_DOCUMENTS.map((document) => ({
    ...document,
    updatedAt: new Date()
  }));
}

function normalizeCompanyJobPositions(value, fallbackDocuments = []) {
  if (!Array.isArray(value)) return [];

  const normalizedFallbackDocuments = normalizeCompanyDocuments(fallbackDocuments);

  return value.reduce((positions, item, index) => {
    if (!item || typeof item !== "object") return positions;

    const title = String(item.title || item.name || item.label || "").trim();
    const id = String(item.id || buildCompanyJobPositionId(title, index)).trim();

    if (!title || !id) return positions;

    const documents = normalizeCompanyDocuments(item.documents || item.documentsNeeded);

    positions.push({
      id,
      title,
      name: title,
      documents: documents.length
        ? documents
        : normalizedFallbackDocuments.length
          ? normalizedFallbackDocuments
          : createDefaultCompanyPositionDocuments(),
      updatedAt: new Date()
    });

    return positions;
  }, []);
}

function getCompanyDocumentsForApplicant(company = {}, applicant = {}) {
  const jobPositions = normalizeCompanyJobPositions(company?.jobPositions, company?.documentsNeeded);
  const jobPositionId = String(applicant?.jobPositionId || "").trim();
  const jobPositionName = String(applicant?.jobPositionName || applicant?.jobSpecificationName || applicant?.positionName || "").trim().toLowerCase();
  const matchedPosition = jobPositions.find((position) => position.id === jobPositionId) ||
    (jobPositionName
      ? jobPositions.find((position) =>
          String(position.title || position.name || "").trim().toLowerCase() === jobPositionName ||
          String(position.id || "").trim().toLowerCase() === jobPositionName
        )
      : null);

  if (matchedPosition) return matchedPosition.documents;
  if (jobPositions.length === 1) return jobPositions[0].documents;

  return normalizeCompanyDocuments(company?.documentsNeeded);
}

module.exports = {
  DEFAULT_COMPANY_POSITION_DOCUMENTS,
  normalizeIdList,
  normalizeEmailValue,
  normalizePhoneValue,
  buildCompanyDocumentId,
  normalizeCompanyDocuments,
  buildCompanyJobSpecificationId,
  normalizeCompanyJobSpecifications,
  buildCompanyJobPositionId,
  createDefaultCompanyPositionDocuments,
  getCompanyDocumentsForApplicant,
  normalizeCompanyJobPositions
};

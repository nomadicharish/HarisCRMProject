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
      allowedExtensions: normalizeAllowedDocumentExtensions(item.allowedExtensions),
      uploadHelpText: String(item.uploadHelpText || "").trim(),
      updatedAt: new Date()
    });

    return documents;
  }, []);
}

const DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "jpeg", "jpg", "png"];
const DOC_ONLY_EXTENSIONS = ["doc"];
const DEFAULT_DOCUMENT_ASSET_PATH = "/default-documents/";

function defaultDocumentAssetUrl(fileName) {
  return `${DEFAULT_DOCUMENT_ASSET_PATH}${encodeURIComponent(fileName)}`;
}

function normalizeAllowedDocumentExtensions(value) {
  const normalized = Array.isArray(value)
    ? value.map((item) => String(item || "").replace(".", "").trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS;
  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS;
}

const DEFAULT_COMPANY_POSITION_DOCUMENTS = [
  {
    id: "cv_word_format_with_photo",
    name: "CV in word format with photo",
    required: true,
    allowedExtensions: DOC_ONLY_EXTENSIONS,
    uploadHelpText: "Upload DOC (Max 5 MB)"
  },
  { id: "experience_reference_document", name: "Experience/reference document", required: false },
  { id: "additional_experience_reference_document", name: "Additional Experience/reference document", required: false },
  {
    id: "passport_scan_standard",
    name: "Passport scan as per the given standard",
    required: true,
    referenceFileName: "Passport copy sample.jpeg",
    referenceUrl: defaultDocumentAssetUrl("Passport copy sample.jpeg")
  },
  {
    id: "passport_photo_scan_standard",
    name: "Photo (passport photo scan as per the given standard)",
    required: true,
    referenceFileName: "Visa_Photo_Requirements.pdf",
    referenceUrl: defaultDocumentAssetUrl("Visa_Photo_Requirements.pdf")
  },
  { id: "education_document", name: "Education document (higher secondary school pass certificate)", required: true },
  { id: "additional_education_document", name: "Additional Education Document", required: false },
  {
    id: "podpis_tujca",
    name: "Podpis Tujca (signed with blue pen)",
    required: true,
    documentToFillFileName: "podpisTujca.PDF",
    documentToFillUrl: defaultDocumentAssetUrl("podpisTujca.PDF"),
    templateFileName: "podpisTujca.PDF",
    templateFileUrl: defaultDocumentAssetUrl("podpisTujca.PDF"),
    referenceFileName: "podpisTujcaReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("podpisTujcaReference.jpeg")
  },
  {
    id: "tax_authorization",
    name: "Tax Authorization",
    required: true,
    documentToFillFileName: "taxAuthorization.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("taxAuthorization.pdf"),
    templateFileName: "taxAuthorization.pdf",
    templateFileUrl: defaultDocumentAssetUrl("taxAuthorization.pdf"),
    referenceFileName: "taxAuthorizationReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("taxAuthorizationReference.jpeg")
  },
  { id: "pan_card", name: "Pan card", required: true },
  {
    id: "application_authorization",
    name: "Application Authorization",
    required: true,
    documentToFillFileName: "applicationAuthorization.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("applicationAuthorization.pdf"),
    templateFileName: "applicationAuthorization.pdf",
    templateFileUrl: defaultDocumentAssetUrl("applicationAuthorization.pdf"),
    referenceFileName: "applicationAuthorizationReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("applicationAuthorizationReference.jpeg")
  },
  {
    id: "appointment_authorization",
    name: "Appointment Authorization",
    required: true,
    documentToFillFileName: "AppointmentAuthorization.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("AppointmentAuthorization.pdf"),
    templateFileName: "AppointmentAuthorization.pdf",
    templateFileUrl: defaultDocumentAssetUrl("AppointmentAuthorization.pdf"),
    referenceFileName: "appointmentAuthorizationReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("appointmentAuthorizationReference.jpeg")
  },
  {
    id: "medical_certificate",
    name: "Medical certificate",
    required: true,
    documentToFillFileName: "Medical Certificate_01.2026.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("Medical Certificate_01.2026.pdf"),
    templateFileName: "Medical Certificate_01.2026.pdf",
    templateFileUrl: defaultDocumentAssetUrl("Medical Certificate_01.2026.pdf")
  },
  {
    id: "workwear_measurement",
    name: "Workwear measurement",
    required: false,
    documentToFillFileName: "WorkwearMeasurement.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("WorkwearMeasurement.pdf"),
    templateFileName: "WorkwearMeasurement.pdf",
    templateFileUrl: defaultDocumentAssetUrl("WorkwearMeasurement.pdf"),
    referenceFileName: "footwearSize.jpeg",
    referenceUrl: defaultDocumentAssetUrl("footwearSize.jpeg")
  },
  { id: "affidavit", name: "AFFIDAVIT", required: true },
  { id: "additional_document_1", name: "Additional Document", required: false },
  { id: "additional_document_2", name: "Additional Document", required: false },
  { id: "additional_document_3", name: "Additional Document", required: false }
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
  normalizeAllowedDocumentExtensions,
  buildCompanyDocumentId,
  normalizeCompanyDocuments,
  buildCompanyJobSpecificationId,
  normalizeCompanyJobSpecifications,
  buildCompanyJobPositionId,
  createDefaultCompanyPositionDocuments,
  getCompanyDocumentsForApplicant,
  normalizeCompanyJobPositions
};

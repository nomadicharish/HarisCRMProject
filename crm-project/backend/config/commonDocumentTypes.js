const COMMON_DOCUMENT_TYPES = [
  { value: "standard_reference_document", label: "Standard Reference Document" },
  { value: "cv_reference_document", label: "CV Reference Document", targetDocumentId: "cv_word_format_with_photo", targetField: "reference" },
  { value: "experience_reference_document", label: "Experience Reference Document", targetDocumentId: "experience_reference_document", targetField: "reference" },
  { value: "passport_reference_document", label: "Passport Reference Document", targetDocumentId: "passport_scan_standard", targetField: "reference" },
  { value: "photo_reference_document", label: "Photo Reference Document", targetDocumentId: "passport_photo_scan_standard", targetField: "reference" },
  { value: "education_document_reference_document", label: "Education Document Reference Document", targetDocumentId: "education_document", targetField: "reference" },
  { value: "podpis_tujca_reference_document", label: "Podpis Tujca Reference Document", targetDocumentId: "podpis_tujca", targetField: "reference" },
  { value: "podpis_tujca_document_to_fill", label: "Podpis Tujca Document to fill", targetDocumentId: "podpis_tujca", targetField: "documentToFill" },
  { value: "tax_authorization_reference_document", label: "Tax Authorization Reference Document", targetDocumentId: "tax_authorization", targetField: "reference" },
  { value: "tax_authorization_document_to_fill", label: "Tax Authorization Document to fill", targetDocumentId: "tax_authorization", targetField: "documentToFill" },
  { value: "pan_card_reference_document", label: "Pan card Reference Document", targetDocumentId: "pan_card", targetField: "reference" },
  { value: "application_authorization_reference_document", label: "Application Authorization Reference Document", targetDocumentId: "application_authorization", targetField: "reference" },
  { value: "application_authorization_document_to_fill", label: "Application Authorization Document to fill", targetDocumentId: "application_authorization", targetField: "documentToFill" },
  { value: "appointment_authorization_reference_document", label: "Appointment Authorization Reference Document", targetDocumentId: "appointment_authorization", targetField: "reference" },
  { value: "appointment_authorization_document_to_fill", label: "Appointment Authorization Document to fill", targetDocumentId: "appointment_authorization", targetField: "documentToFill" },
  { value: "medical_certificate_reference_document", label: "Medical certificate Reference Document", targetDocumentId: "medical_certificate", targetField: "reference" },
  { value: "medical_certificate_document_to_fill", label: "Medical certificate Document to fill", targetDocumentId: "medical_certificate", targetField: "documentToFill" },
  { value: "workwear_measurement_reference_document", label: "Workwear measurement Reference Document", targetDocumentId: "workwear_measurement", targetField: "reference" },
  { value: "workwear_measurement_document_to_fill", label: "Workwear measurement Document to fill", targetDocumentId: "workwear_measurement", targetField: "documentToFill" },
  { value: "affidavit_document_to_fill", label: "AFFIDAVIT Document to fill", targetDocumentId: "affidavit", targetField: "documentToFill" },
  { value: "affidavit_reference_document", label: "AFFIDAVIT Reference Document", targetDocumentId: "affidavit", targetField: "reference" },
  { value: "pcc_reference_document", label: "PCC Reference Document", targetDocumentId: "pcc", targetField: "reference" },
  { value: "pcc_document_to_fill", label: "PCC Document to fill", targetDocumentId: "pcc", targetField: "documentToFill" },
  { value: "advisory_document", label: "Advisory Document" }
];

const COMMON_DOCUMENT_TYPE_MAP = new Map(COMMON_DOCUMENT_TYPES.map((type) => [type.value, type]));

function getCommonDocumentType(value) {
  return COMMON_DOCUMENT_TYPE_MAP.get(String(value || "").trim()) || null;
}

function getCommonDocumentTypeByTarget(documentId, targetField, documentName = "") {
  const normalizedName = String(documentName || "").trim().toLowerCase();
  const nameTarget = normalizedName.includes("cv in word") ? "cv_word_format_with_photo"
    : normalizedName.includes("passport scan") ? "passport_scan_standard"
    : normalizedName === "passport" || normalizedName.includes("passport copy") ? "passport_scan_standard"
    : normalizedName.includes("passport photo") || normalizedName.startsWith("photo ") ? "passport_photo_scan_standard"
    : normalizedName.includes("education document") ? "education_document"
    : normalizedName.includes("podpis tujca") ? "podpis_tujca"
    : normalizedName.includes("tax authorization") ? "tax_authorization"
    : normalizedName.includes("pan card") ? "pan_card"
    : normalizedName.includes("application authorization") ? "application_authorization"
    : normalizedName.includes("appointment authorization") ? "appointment_authorization"
    : normalizedName.includes("medical certificate") ? "medical_certificate"
    : normalizedName.includes("workwear measurement") ? "workwear_measurement"
    : normalizedName.includes("affidavit") ? "affidavit"
    : normalizedName === "pcc" ? "pcc"
    : normalizedName.includes("experience/reference") ? "experience_reference_document"
    : String(documentId || "");
  return COMMON_DOCUMENT_TYPES.find(
    (type) => type.targetDocumentId === nameTarget && type.targetField === targetField
  ) || null;
}

module.exports = { COMMON_DOCUMENT_TYPES, getCommonDocumentType, getCommonDocumentTypeByTarget };

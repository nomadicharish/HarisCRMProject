function normalizeApplicantDocumentConfigs(value) {
  if (!Array.isArray(value)) return [];

  return value.reduce((documents, item, index) => {
    if (!item || typeof item !== "object") return documents;

    const key = String(item.id || item.docType || `document_${index + 1}`).trim();
    const label = String(item.name || item.label || "").trim();

    if (!key || !label) return documents;

    documents.push({
      key,
      label,
      required: Boolean(item.required),
      templateFileName: String(item.templateFileName || "").trim(),
      templateFileUrl: String(item.templateFileUrl || "").trim()
    });

    return documents;
  }, []);
}

export function getVisibleApplicantDocuments(applicant, documentConfigs) {
  return normalizeApplicantDocumentConfigs(documentConfigs || applicant?.companyDocuments);
}

export function getRequiredApplicantDocuments(applicant, documentConfigs) {
  return getVisibleApplicantDocuments(applicant, documentConfigs).filter((doc) => doc.required);
}

export function getLatestVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  return versions.reduce((latest, current) =>
    new Date(current.uploadedAt) > new Date(latest.uploadedAt) ? current : latest
  );
}

export function getDocumentReviewState(documents, applicant, documentConfigs) {
  const visibleDocs = getVisibleApplicantDocuments(applicant, documentConfigs);
  const requiredDocs = visibleDocs.filter((doc) => doc.required);

  const latestByType = Object.fromEntries(
    visibleDocs.map((doc) => [doc.key, getLatestVersion(documents?.[doc.key] || [])])
  );

  const approvedRequired =
    requiredDocs.length === 0 ||
    requiredDocs.every((doc) => latestByType[doc.key]?.status === "APPROVED");
  const rejectedRequired = requiredDocs.some((doc) => latestByType[doc.key]?.status === "REJECTED");
  const pendingRequired = requiredDocs.some((doc) => latestByType[doc.key]?.status === "PENDING");
  const uploadedRequired =
    requiredDocs.length === 0 ||
    requiredDocs.every((doc) => ["PENDING", "APPROVED", "REJECTED"].includes(latestByType[doc.key]?.status));

  return {
    visibleDocs,
    requiredDocs,
    latestByType,
    approvedRequired,
    rejectedRequired,
    pendingRequired,
    uploadedRequired
  };
}

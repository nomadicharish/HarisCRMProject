export const APPLICANT_DOCUMENTS = [
  { key: "PASSPORT", label: "Upload applicant's passport copy", required: true },
  { key: "PAN_CARD", label: "Upload applicant's pan card copy", required: true },
  { key: "EDUCATION_10TH", label: "Upload applicant's 10th certificate copy", required: true },
  { key: "EDUCATION_12TH", label: "Upload applicant's 12th certificate copy", required: true },
  { key: "DEGREE", label: "Upload applicant's degree copy", required: false },
  { key: "PHOTO", label: "Upload applicant's passport photo", required: true },
  { key: "WORK_MEASUREMENT", label: "Upload applicant's work measurement", required: false },
  { key: "IDP", label: "Upload applicant's international driving permit", required: false },
  { key: "UNMARRIED_CERTIFICATE", label: "Upload applicant's unmarried certificate", required: false },
  { key: "MARRIAGE_CERTIFICATE", label: "Upload applicant's marriage certificate", required: false },
  { key: "BIRTH_CERTIFICATE", label: "Upload applicant's birth certificate", required: true },
  { key: "MEDICAL_CERTIFICATE", label: "Upload applicant's medical certificate", required: true }
];

export function getVisibleApplicantDocuments(applicant) {
  const maritalStatus =
    applicant?.maritalStatus || applicant?.personalDetails?.maritalStatus || "";

  return APPLICANT_DOCUMENTS.reduce((visibleDocs, doc) => {
    if (doc.key === "UNMARRIED_CERTIFICATE" && maritalStatus !== "Single") {
      return visibleDocs;
    }

    if (doc.key === "MARRIAGE_CERTIFICATE" && maritalStatus !== "Married") {
      return visibleDocs;
    }

    if (doc.key === "UNMARRIED_CERTIFICATE" || doc.key === "MARRIAGE_CERTIFICATE") {
      visibleDocs.push({
        ...doc,
        required: true
      });
      return visibleDocs;
    }

    visibleDocs.push(doc);
    return visibleDocs;
  }, []);
}

export function getRequiredApplicantDocuments(applicant) {
  return getVisibleApplicantDocuments(applicant).filter((doc) => doc.required);
}

export function getLatestVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  return versions.reduce((latest, current) =>
    new Date(current.uploadedAt) > new Date(latest.uploadedAt) ? current : latest
  );
}

export function getDocumentReviewState(documents, applicant) {
  const visibleDocs = getVisibleApplicantDocuments(applicant);
  const requiredDocs = visibleDocs.filter((doc) => doc.required);

  const latestByType = Object.fromEntries(
    visibleDocs.map((doc) => [doc.key, getLatestVersion(documents?.[doc.key] || [])])
  );

  const approvedRequired = requiredDocs.every((doc) => latestByType[doc.key]?.status === "APPROVED");
  const rejectedRequired = requiredDocs.some((doc) => latestByType[doc.key]?.status === "REJECTED");
  const pendingRequired = requiredDocs.some((doc) => latestByType[doc.key]?.status === "PENDING");
  const uploadedRequired = requiredDocs.every((doc) =>
    ["PENDING", "APPROVED", "REJECTED"].includes(latestByType[doc.key]?.status)
  );

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

const { db } = require("../config/firebase");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function buildApplicantSearchDoc(id, applicant = {}) {
  const firstName = applicant?.personalDetails?.firstName || applicant.firstName || "";
  const lastName = applicant?.personalDetails?.lastName || applicant.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    entityType: "applicant",
    entityId: id,
    applicantId: id,
    agencyId: applicant.agencyId || "",
    companyId: applicant.companyId || "",
    countryId: applicant.countryId || "",
    stage: Number(applicant.stage || 1),
    approvalStatus: String(applicant.approvalStatus || ""),
    firstName: normalizeText(firstName),
    lastName: normalizeText(lastName),
    fullName: normalizeText(fullName),
    tokens: Array.from(
      new Set(
        [firstName, lastName, fullName, applicant.companyName, applicant.countryName]
          .join(" ")
          .split(/\s+/)
          .map(normalizeText)
          .filter(Boolean)
      )
    ),
    updatedAt: Date.now()
  };
}

async function upsertApplicantSearchRecord(id, applicant) {
  const searchDoc = buildApplicantSearchDoc(id, applicant);
  await db.collection("searchIndex").doc(`applicant_${id}`).set(searchDoc, { merge: true });
}

module.exports = {
  upsertApplicantSearchRecord
};

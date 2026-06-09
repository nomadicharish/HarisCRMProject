const { admin, db } = require("../config/firebase");
const { getCompanyDocumentsForApplicant } = require("../utils/normalizers");

const MANUAL_STAGE_IDS = [1, 2, 4, 5, 6, 8, 10, 12];
const AUTO_STAGE_IDS = [3, 7, 9, 11];
const MAX_STAGE = 13;

async function addStageLog({ applicantId, fromStage, toStage, role, action }) {
  await db.collection("stageLogs").add({
    applicantId,
    fromStage,
    toStage,
    role,
    action,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function getCompanyDocumentRequirements(applicant = {}) {
  if (!applicant?.companyId) return [];
  const companyDoc = await db.collection("companies").doc(applicant.companyId).get();
  if (!companyDoc.exists) return [];
  return getCompanyDocumentsForApplicant(companyDoc.data() || {}, applicant);
}

async function getRequiredDocumentTypes(applicant) {
  const documents = await getCompanyDocumentRequirements(applicant);
  return documents.filter((doc) => doc.required).map((doc) => doc.id);
}

async function areLatestRequiredDocumentsApproved(applicantId, applicant) {
  if (applicant?.docSummary?.allRequiredApproved === true || applicant?.documentSummary?.allRequiredApproved === true) {
    return true;
  }

  const requiredDocs = await getRequiredDocumentTypes(applicant);
  if (!requiredDocs.length) return true;

  const docRefs = requiredDocs.map((docType) =>
    db.collection("applicants").doc(applicantId).collection("documents").doc(docType)
  );
  const docSnaps = docRefs.length ? await db.getAll(...docRefs) : [];

  for (const docSnap of docSnaps) {
    if (!docSnap.exists) return false;
    const docData = docSnap.data() || {};
    const latestStatus = String(docData?.latestVersion?.status || docData?.latestStatus || "").toUpperCase();
    if (latestStatus) {
      if (latestStatus !== "APPROVED") return false;
      continue;
    }

    const latestSnap = await docSnap.ref.collection("versions").orderBy("uploadedAt", "desc").limit(1).get();
    if (latestSnap.empty) return false;
    if (String(latestSnap.docs[0].data()?.status || "").toUpperCase() !== "APPROVED") return false;
  }

  return true;
}

async function syncApplicantDocumentStage(applicantId, applicant, actorId, actorRole = "SYSTEM") {
  if (!applicant) return applicant;
  const currentStage = Number(applicant.stage || 1);
  if (currentStage < 2) return applicant;

  const allApproved = await areLatestRequiredDocumentsApproved(applicantId, applicant);
  if (!allApproved || currentStage >= 3) return applicant;

  const applicantRef = db.collection("applicants").doc(applicantId);
  await applicantRef.update({
    stage: 3,
    stageUpdatedAt: new Date(),
    lastActionBy: actorId || null
  });

  await addStageLog({
    applicantId,
    fromStage: currentStage,
    toStage: 3,
    role: actorRole,
    action: "ALL_REQUIRED_DOCUMENTS_APPROVED"
  });

  return {
    ...applicant,
    stage: 3,
    stageUpdatedAt: new Date()
  };
}

async function autoAdvanceStage(applicantId, currentStage, reason = "AUTO_ADVANCE") {
  if (!AUTO_STAGE_IDS.includes(currentStage)) return;
  const next = currentStage + 1;
  if (next > MAX_STAGE) return;

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) return;

  const current = applicantSnap.data().stage || currentStage;
  if (current !== currentStage) return;

  await applicantRef.update({
    stage: next,
    stageUpdatedAt: new Date()
  });

  await addStageLog({
    applicantId,
    fromStage: currentStage,
    toStage: next,
    role: "SYSTEM",
    action: reason
  });
}

module.exports = {
  AUTO_STAGE_IDS,
  MANUAL_STAGE_IDS,
  MAX_STAGE,
  addStageLog,
  autoAdvanceStage,
  getRequiredDocumentTypes,
  syncApplicantDocumentStage
};

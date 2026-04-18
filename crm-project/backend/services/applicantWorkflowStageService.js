const { admin, db } = require("../config/firebase");

const MANUAL_STAGE_IDS = [1, 2, 4, 5, 7, 9, 11];
const AUTO_STAGE_IDS = [3, 6, 8, 10];
const MAX_STAGE = 11;

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

function normalizeCompanyDocuments(value) {
  if (!Array.isArray(value)) return [];
  return value.reduce((documents, item, index) => {
    if (!item || typeof item !== "object") return documents;

    const name = String(item.name || item.label || "").trim();
    const id = String(item.id || item.docType || `document_${index + 1}`).trim();
    if (!name || !id) return documents;

    documents.push({
      id,
      name,
      required: Boolean(item.required),
      templateFileName: String(item.templateFileName || "").trim(),
      templateFileUrl: String(item.templateFileUrl || "").trim()
    });
    return documents;
  }, []);
}

async function getCompanyDocumentRequirements(companyId) {
  if (!companyId) return [];
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) return [];
  return normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded);
}

async function getRequiredDocumentTypes(applicant) {
  const documents = await getCompanyDocumentRequirements(applicant?.companyId);
  return documents.filter((doc) => doc.required).map((doc) => doc.id);
}

async function areLatestRequiredDocumentsApproved(applicantId, applicant) {
  const requiredDocs = await getRequiredDocumentTypes(applicant);
  if (!requiredDocs.length) return true;

  for (const docType of requiredDocs) {
    const latestSnap = await db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType)
      .collection("versions")
      .orderBy("uploadedAt", "desc")
      .limit(1)
      .get();

    if (latestSnap.empty) return false;
    if (latestSnap.docs[0].data()?.status !== "APPROVED") return false;
  }

  return true;
}

async function syncApplicantDocumentStage(applicantId, applicant, actorId, actorRole = "SYSTEM") {
  if (!applicant) return;
  const currentStage = Number(applicant.stage || 1);
  if (currentStage < 2) return;

  const allApproved = await areLatestRequiredDocumentsApproved(applicantId, applicant);
  if (!allApproved || currentStage >= 3) return;

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

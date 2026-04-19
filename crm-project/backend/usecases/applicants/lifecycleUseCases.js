const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { resolveApplicantTotalEur, toNumber } = require("../../services/applicantDomainService");
const { approveAndMoveStageUseCase } = require("./workflowStageUseCases");

async function approveApplicantUseCase(req) {
  const applicantId = req.params.applicantId;
  const userRole = req.user?.role || "";
  const userId = req.user?.uid || "";

  if (userRole !== "SUPER_USER") throw new AppError("Only SUPER_USER can approve", 403);

  const ref = db.collection("applicants").doc(applicantId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError("Applicant not found", 404);

  const data = snap.data() || {};
  if (data.approvalStatus === "approved") throw new AppError("Already approved", 400);

  await ref.update({
    approvalStatus: "approved",
    applicantBannerStatus: "Document upload pending",
    approvedBy: userId,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await refreshApplicantSummaries(applicantId, {
    ...data,
    approvalStatus: "approved"
  });

  return { message: "Applicant approved successfully" };
}

async function completeApplicantUseCase(req) {
  const applicantId = req.params.id;
  if (req.user.role !== "SUPER_USER") throw new AppError("Only Super User can complete process", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  const doc = await docRef.get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);

  const data = doc.data() || {};
  if (Number(data.stage || 0) < 10) throw new AppError("Process not ready for completion", 400);

  await docRef.update({
    stage: 12,
    applicantBannerStatus: "Candidate Arrived and Process Completed",
    completedAt: new Date(),
    completedBy: req.user.uid,
    stageUpdatedAt: new Date()
  });

  await refreshApplicantSummaries(applicantId);
  return { message: "Process completed successfully" };
}

async function updateApplicantUseCase(req) {
  const { id } = req.params;
  if (req.user.role !== "SUPER_USER") throw new AppError("Only Super User can update applicant", 403);

  const applicantRef = db.collection("applicants").doc(id);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const incomingTotal = toNumber(req.body?.totalApplicantPayment ?? req.body?.totalAmount);
  const resolvedTotal =
    incomingTotal > 0
      ? incomingTotal
      : await resolveApplicantTotalEur({ ...applicantSnap.data(), ...req.body });

  await applicantRef.update({
    ...req.body,
    totalApplicantPayment: resolvedTotal,
    totalAmount: resolvedTotal,
    updatedAt: new Date()
  });

  await refreshApplicantSummaries(id, {
    ...applicantSnap.data(),
    ...req.body,
    totalApplicantPayment: resolvedTotal,
    totalAmount: resolvedTotal
  });

  return { message: "Applicant updated successfully" };
}

module.exports = {
  approveAndMoveStageUseCase,
  approveApplicantUseCase,
  completeApplicantUseCase,
  updateApplicantUseCase
};

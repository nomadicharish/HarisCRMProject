const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const {
  buildApplicantListDerivedFields,
  normalizePaymentCurrency,
  resolveApplicantReferenceFields,
  resolveApplicantTotalAmount,
  toNumber
} = require("../../services/applicantDomainService");
const { approveAndMoveStageUseCase } = require("./workflowStageUseCases");
const { isSuperUserLikeRole } = require("../../utils/roles");
const { hasRight } = require("../../config/userRights");
const { recordNotificationAction, getUserName } = require("../../services/notificationService");
const { invalidateLatestDocumentsCache } = require("../../services/applicantDocumentCache");

async function deleteDocumentTree(documentRef) {
  const childCollections = await documentRef.listCollections();
  for (const collection of childCollections) {
    const snapshot = await collection.get();
    for (const child of snapshot.docs) await deleteDocumentTree(child.ref);
  }
  await documentRef.delete();
}

async function deleteApplicantLinkedRecords(collectionName, applicantId) {
  const snapshot = await db.collection(collectionName).where("applicantId", "==", applicantId).get();
  await Promise.all(snapshot.docs.map((doc) => deleteDocumentTree(doc.ref)));
}

async function deleteApplicantUseCase(req) {
  if (!isSuperUserLikeRole(req.user?.role)) throw new AppError("Only Super User can delete applicants", 403);

  const applicantId = req.params.id;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantDoc = await applicantRef.get();
  if (!applicantDoc.exists) throw new AppError("Applicant not found", 404);

  // Uploaded applicant assets are always namespaced by applicant id.
  await admin.storage().bucket().deleteFiles({ prefix: `applicants/${applicantId}/` }).catch(() => {});
  await Promise.all([
    deleteApplicantLinkedRecords("stageLogs", applicantId),
    deleteApplicantLinkedRecords("appNotifications", applicantId),
    deleteApplicantLinkedRecords("changeEvents", applicantId),
    db.collection("searchIndex").doc(`applicant_${applicantId}`).delete().catch(() => {})
  ]);
  await deleteDocumentTree(applicantRef);
  invalidateLatestDocumentsCache(applicantId);

  return { message: "Applicant and all related records were deleted successfully" };
}

async function notifyApplicantApproval({ applicantId, applicant = {}, user = {} }) {
  await recordNotificationAction({
    actionKey: "APPLICANT_APPROVED",
    applicantId,
    applicant,
    user,
    recipientRoles: ["AGENCY"],
    recipientAgencyId: applicant.agencyId || ""
  });

  if (!applicant?.createdBy) return;
  const creatorName = await getUserName(applicant.createdBy);
  await recordNotificationAction({
    actionKey: "APPLICANT_ADDED",
    applicantId,
    applicant: { ...applicant, approvalStatus: "approved" },
    user: { uid: applicant.createdBy },
    actorName: creatorName || "",
    recipientRoles: ["EMPLOYER"],
    recipientCompanyId: applicant.companyId || "",
    recipientEmployerId: applicant.employerId || ""
  });
}

async function approveApplicantUseCase(req) {
  const applicantId = req.params.applicantId;
  const userRole = req.user?.role || "";
  const userId = req.user?.uid || "";

  if (!isSuperUserLikeRole(userRole)) throw new AppError("Only SUPER_USER can approve", 403);

  const ref = db.collection("applicants").doc(applicantId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError("Applicant not found", 404);

  const data = snap.data() || {};
  if (data.approvalStatus === "approved") throw new AppError("Already approved", 400);

  await ref.update({
    approvalStatus: "approved",
    applicantBannerStatus: "Document upload pending",
    ...buildApplicantListDerivedFields({
      ...data,
      approvalStatus: "approved",
      applicantBannerStatus: "Document upload pending"
    }),
    approvedBy: userId,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await refreshApplicantSummaries(applicantId, {
    ...data,
    approvalStatus: "approved"
  });
  try {
    await notifyApplicantApproval({ applicantId, applicant: data, user: req.user });
  } catch (err) {
    // swallow errors to avoid blocking approval response
  }

  return { message: "Applicant approved successfully" };
}

async function completeApplicantUseCase(req) {
  const applicantId = req.params.id;
  if (!hasRight(req.user, "COMPLETE_APPLICANT_ARRIVAL")) throw new AppError("Access denied", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  const doc = await docRef.get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);

  const data = doc.data() || {};
  if (Number(data.stage || 0) < 12) throw new AppError("Process not ready for completion", 400);
  const hasApplicantArrivalDetails = Boolean(
    data?.visaTravel?.date ||
    data?.visaTravel?.time ||
    data?.visaTravel?.flightNumber ||
    data?.visaTravel?.arrivalPlace
  );
  if (!hasApplicantArrivalDetails) {
    throw new AppError("Applicant arrival details must be saved before completing process", 400);
  }

  await docRef.update({
    stage: 13,
    applicantBannerStatus: "Candidate Arrived and Process Completed",
    ...buildApplicantListDerivedFields({
      ...data,
      stage: 13,
      applicantBannerStatus: "Candidate Arrived and Process Completed"
    }),
    completedAt: new Date(),
    completedBy: req.user.uid,
    stageUpdatedAt: new Date()
  });

  await refreshApplicantSummaries(applicantId);
  await recordNotificationAction({
    actionKey: "PROCESS_COMPLETED",
    applicantId,
    applicant: data,
    user: req.user,
    recipientRoles: ["AGENCY", "EMPLOYER"],
    recipientAgencyId: data.agencyId || "",
    recipientCompanyId: data.companyId || "",
    recipientEmployerId: data.employerId || ""
  });
  return { message: "Process completed successfully" };
}

async function updateApplicantUseCase(req) {
  const { id } = req.params;
  if (!isSuperUserLikeRole(req.user.role)) throw new AppError("Only Super User can update applicant", 403);

  const applicantRef = db.collection("applicants").doc(id);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const incomingTotal = toNumber(req.body?.totalApplicantPayment ?? req.body?.totalAmount);
  const existingApplicant = applicantSnap.data() || {};
  const incomingCurrency = normalizePaymentCurrency(
    req.body?.paymentCurrency || req.body?.currency || existingApplicant.paymentCurrency || existingApplicant.currency
  );
  const mergedApplicant = { ...existingApplicant, ...req.body };
  const resolvedTotal = incomingTotal > 0 ? incomingTotal : await resolveApplicantTotalAmount(mergedApplicant);
  const referenceFields = await resolveApplicantReferenceFields(mergedApplicant);

  await applicantRef.update({
    ...req.body,
    ...referenceFields,
    ...buildApplicantListDerivedFields({
      ...mergedApplicant,
      ...referenceFields,
      paymentCurrency: incomingCurrency,
      currency: incomingCurrency,
      totalApplicantPayment: resolvedTotal,
      totalAmount: resolvedTotal
    }),
    totalApplicantPayment: resolvedTotal,
    totalAmount: resolvedTotal,
    paymentCurrency: incomingCurrency,
    currency: incomingCurrency,
    updatedAt: new Date()
  });

  await refreshApplicantSummaries(id, {
    ...existingApplicant,
    ...req.body,
    ...referenceFields,
    totalApplicantPayment: resolvedTotal,
    totalAmount: resolvedTotal,
    paymentCurrency: incomingCurrency,
    currency: incomingCurrency
  });

  return { message: "Applicant updated successfully" };
}

module.exports = {
  approveAndMoveStageUseCase,
  approveApplicantUseCase,
  completeApplicantUseCase,
  deleteApplicantUseCase,
  notifyApplicantApproval,
  updateApplicantUseCase
};

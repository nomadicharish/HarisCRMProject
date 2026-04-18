const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { getAuthenticatedUserFromReq } = require("../../services/applicantDomainService");
const {
  AUTO_STAGE_IDS,
  MANUAL_STAGE_IDS,
  MAX_STAGE,
  addStageLog,
  autoAdvanceStage,
  getRequiredDocumentTypes
} = require("../../services/applicantWorkflowStageService");

async function addAppointmentUseCase(req) {
  const { applicantId, type } = req.params;
  const { date, time } = req.body;
  const { userRole, userId } = getAuthenticatedUserFromReq(req);

  const allowedTypes = ["EMBASSY_APPOINTMENT", "EMBASSY_INTERVIEW", "VISA_COLLECTION", "BIOMETRIC", "INTERVIEW"];
  if (!allowedTypes.includes(type)) throw new AppError("Invalid appointment type", 400);
  if (!["EMPLOYER", "SUPER_USER"].includes(userRole)) throw new AppError("Not allowed to add appointment", 403);

  const autoApprove = userRole === "SUPER_USER";
  const appointment = {
    type,
    date,
    time,
    addedBy: userId,
    addedRole: userRole,
    approved: autoApprove,
    approvedBy: autoApprove ? userId : null,
    approvedAt: autoApprove ? admin.firestore.FieldValue.serverTimestamp() : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("applicants").doc(applicantId).collection("appointments").doc(type).set(appointment);
  await db.collection("applicants").doc(applicantId).set(
    {
      hasPendingAppointmentApproval: !autoApprove
    },
    { merge: true }
  );
  await refreshApplicantSummaries(applicantId);
  return { message: "Appointment added successfully" };
}

async function approveAppointmentUseCase(req) {
  const { applicantId, type } = req.params;
  const { userRole, userId } = getAuthenticatedUserFromReq(req);
  if (userRole !== "SUPER_USER") throw new AppError("Only Super User can approve", 403);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const appointmentRef = applicantRef.collection("appointments").doc(type);
  const appointmentSnap = await appointmentRef.get();
  if (!appointmentSnap.exists) throw new AppError("Appointment not found", 404);

  await appointmentRef.update({
    approved: true,
    approvedBy: userId,
    approvedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await db.collection("applicants").doc(applicantId).set(
    {
      hasPendingAppointmentApproval: false
    },
    { merge: true }
  );
  await refreshApplicantSummaries(applicantId);

  let newStage = null;
  if (type === "EMBASSY_APPOINTMENT") newStage = 6;
  if (type === "EMBASSY_INTERVIEW") newStage = 8;
  if (type === "VISA_COLLECTION") newStage = 10;
  if (type === "BIOMETRIC") newStage = 8;
  if (type === "INTERVIEW") newStage = 10;

  if (newStage !== null) {
    const applicantSnap = await applicantRef.get();
    const currentStage = applicantSnap.data().stage || 1;
    if (newStage > currentStage) {
      await applicantRef.update({ stage: newStage });
      await addStageLog({
        applicantId,
        fromStage: currentStage,
        toStage: newStage,
        role: "SUPER_USER",
        action: `APPOINTMENT_APPROVAL_${type}`
      });

      if (AUTO_STAGE_IDS.includes(newStage)) {
        await autoAdvanceStage(applicantId, newStage, `AUTO_AFTER_${type}_APPROVAL`);
      }
    }
  }

  return { message: "Appointment approved and stage updated if applicable" };
}

async function approveAndMoveStageUseCase(req) {
  const applicantId = req.params.id || req.params.applicantId;
  if (req.user.role !== "SUPER_USER") throw new AppError("Only Super User can approve stages", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  const doc = await docRef.get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);

  const applicant = doc.data();
  const currentStage = applicant.stage || 1;
  if (currentStage >= MAX_STAGE) throw new AppError("Applicant already at final stage", 400);
  if (!MANUAL_STAGE_IDS.includes(currentStage)) {
    throw new AppError("Current stage is automated and cannot be manually approved", 400);
  }

  if (currentStage === 2) {
    const docsSnap = await db.collection("applicants").doc(applicantId).collection("documents").get();
    const uploadedDocs = {};

    for (const item of docsSnap.docs) {
      const versionsSnap = await item.ref.collection("versions").orderBy("uploadedAt", "desc").limit(1).get();
      if (!versionsSnap.empty) {
        uploadedDocs[item.id] = versionsSnap.docs[0].data();
      }
    }

    const requiredDocs = await getRequiredDocumentTypes(applicant);
    for (const docType of requiredDocs) {
      if (!uploadedDocs[docType]) throw new AppError(`Missing required document: ${docType}`, 400);
      if (uploadedDocs[docType].status !== "APPROVED") {
        throw new AppError(`Document not approved: ${docType}`, 400);
      }
    }
  }

  const nextStage = currentStage + 1;
  const updatePayload = {
    stage: nextStage,
    stageUpdatedAt: new Date(),
    lastActionBy: req.user.uid
  };

  if (currentStage === 1) {
    updatePayload.approvalStatus = "approved";
    updatePayload.approvedAt = new Date();
    updatePayload.approvedBy = req.user.uid;
  }

  await docRef.update(updatePayload);
  await refreshApplicantSummaries(applicantId);
  await addStageLog({
    applicantId,
    fromStage: currentStage,
    toStage: nextStage,
    role: req.user.role,
    action: "MANUAL_STAGE_APPROVAL"
  });

  const finalApplicant = await docRef.get();
  const finalStage = finalApplicant.exists ? finalApplicant.data().stage : nextStage;

  return {
    message: "Stage approved and moved successfully",
    previousStage: currentStage,
    newStage: finalStage
  };
}

module.exports = {
  addAppointmentUseCase,
  approveAndMoveStageUseCase,
  approveAppointmentUseCase
};

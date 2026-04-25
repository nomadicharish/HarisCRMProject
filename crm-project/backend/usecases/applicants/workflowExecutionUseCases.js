const { db, admin } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { normalizeDate } = require("../../services/applicantDomainService");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { addStageLog, autoAdvanceStage } = require("../../services/applicantWorkflowStageService");
const { deleteStorageFileIfExists } = require("../../utils/storageFiles");

async function addDispatchUseCase(req) {
  const applicantId = req.params.id;
  const { note, trackingUrl, awbNumber } = req.body;
  const userRole = req.user?.role || "";

  if (userRole !== "AGENCY") throw new AppError("Only agency can add dispatch details", 403);
  if (!note || !awbNumber) throw new AppError("Note and AWB Number are required", 400);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicantStage = Number(applicantSnap.data()?.stage || 1);
  if (applicantStage < 3 || applicantStage >= 5) {
    throw new AppError("Dispatch can only be added during dispatch or contract stage", 400);
  }

  const docRef = await applicantRef.collection("dispatches").add({
    note,
    trackingUrl: trackingUrl || "",
    awbNumber,
    createdBy: req.user.uid,
    createdByRole: userRole,
    createdAt: new Date()
  });

  if (applicantStage === 3) {
    await autoAdvanceStage(applicantId, 3, "AUTO_AFTER_DISPATCH");
  }

  return { message: "Dispatch added successfully", id: docRef.id };
}

async function getDispatchesUseCase(req) {
  const snapshot = await db
    .collection("applicants")
    .doc(req.params.id)
    .collection("dispatches")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: normalizeDate(doc.data()?.createdAt)
  }));
}

async function uploadContractUseCase(req) {
  const applicantId = req.params.id;
  const isSuperUser = req.user.role === "SUPER_USER";
  const isEmployer = req.user.role === "EMPLOYER";

  if (!isSuperUser && !isEmployer) throw new AppError("Only Super User or Employer can upload contract", 403);
  if (!req.file) throw new AppError("File required", 400);

  const bucket = admin.storage().bucket();
  const fileName = `contracts/${applicantId}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);

  await fileUpload.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype }
  });
  await fileUpload.makePublic();

  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnapBeforeUpdate = await applicantRef.get();
  const previousContractUrl = applicantSnapBeforeUpdate.exists
    ? applicantSnapBeforeUpdate.data()?.contract?.fileUrl || ""
    : "";
  const uploadedAt = new Date();
  const contractStatus = isSuperUser ? "APPROVED" : "PENDING";

  await applicantRef.set(
    {
      contract: {
        fileUrl,
        status: contractStatus,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt,
        issuedAt: uploadedAt,
        approvedBy: isSuperUser ? req.user.uid : null,
        approvedAt: isSuperUser ? uploadedAt : null
      }
    },
    { merge: true }
  );

  await deleteStorageFileIfExists(bucket, previousContractUrl);

  if (isSuperUser) {
    const currentStage = applicantSnapBeforeUpdate.data()?.stage || 1;
    if (currentStage === 4) {
      await applicantRef.update({
        stage: 5,
        stageUpdatedAt: uploadedAt
      });
      await addStageLog({
        applicantId,
        fromStage: 4,
        toStage: 5,
        role: "SUPER_USER",
        action: "AUTO_ADVANCE_CONTRACT_UPLOADED"
      });
    }
  }

  await refreshApplicantSummaries(applicantId);
  return {
    message: "Contract uploaded successfully",
    fileUrl,
    status: contractStatus
  };
}

async function approveContractUseCase(req) {
  const applicantId = req.params.id;
  if (req.user.role !== "SUPER_USER") throw new AppError("Only Super User can approve contract", 403);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data();
  const contract = applicant?.contract;
  if (!contract?.fileUrl) throw new AppError("No contract available to approve", 400);
  if (contract.status === "APPROVED") return { message: "Contract already approved" };

  const approvedAt = new Date();
  await applicantRef.set(
    {
      contract: {
        ...contract,
        status: "APPROVED",
        approvedBy: req.user.uid,
        approvedAt
      }
    },
    { merge: true }
  );

  const currentStage = Number(applicant.stage || 1);
  if (currentStage === 4) {
    await applicantRef.update({
      stage: 5,
      stageUpdatedAt: approvedAt
    });
    await addStageLog({
      applicantId,
      fromStage: 4,
      toStage: 5,
      role: "SUPER_USER",
      action: "CONTRACT_APPROVED"
    });
  }

  await refreshApplicantSummaries(applicantId);
  return { message: "Contract approved successfully" };
}

async function getContractUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const contract = doc.data()?.contract || null;
  if (!contract) return null;

  let uploadedByName = "";
  if (contract.uploadedBy) {
    const uploadedByDoc = await db.collection("users").doc(contract.uploadedBy).get();
    uploadedByName = uploadedByDoc.exists ? uploadedByDoc.data()?.name || "" : "";
  }

  let approvedByName = "";
  if (contract.approvedBy) {
    const approvedByDoc = await db.collection("users").doc(contract.approvedBy).get();
    approvedByName = approvedByDoc.exists ? approvedByDoc.data()?.name || "" : "";
  }

  return {
    ...contract,
    uploadedByName,
    approvedByName,
    uploadedAt: normalizeDate(contract.uploadedAt),
    issuedAt: normalizeDate(contract.issuedAt),
    approvedAt: normalizeDate(contract.approvedAt)
  };
}

async function addEmbassyInterviewUseCase(req) {
  const applicantId = req.params.id;
  const { dateTime } = req.body;
  if (!["SUPER_USER", "EMPLOYER"].includes(req.user.role)) {
    throw new AppError("Only Super User or Employer can add interview", 403);
  }
  if (!dateTime) throw new AppError("Date & Time required", 400);

  const isSuperUser = req.user.role === "SUPER_USER";
  const docRef = db.collection("applicants").doc(applicantId);

  await docRef.set(
    {
      embassyInterview: {
        dateTime,
        status: isSuperUser ? "APPROVED" : "PENDING",
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        approved: isSuperUser,
        approvedBy: isSuperUser ? req.user.uid : null,
        createdAt: new Date()
      }
    },
    { merge: true }
  );

  if (isSuperUser) {
    const doc = await docRef.get();
    const currentStage = doc.data()?.stage || 1;
    await docRef.update({
      stage: currentStage + 1,
      stageUpdatedAt: new Date()
    });
  }

  await refreshApplicantSummaries(applicantId);
  return { message: "Embassy interview added" };
}

async function approveEmbassyInterviewUseCase(req) {
  const applicantId = req.params.id;
  if (req.user.role !== "SUPER_USER") throw new AppError("Only Super User can approve", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  const doc = await docRef.get();
  const applicant = doc.data();
  if (!applicant?.embassyInterview) throw new AppError("No interview data", 400);

  await docRef.update({
    "embassyInterview.approved": true,
    "embassyInterview.status": "APPROVED",
    "embassyInterview.approvedBy": req.user.uid,
    stage: (applicant.stage || 1) + 1,
    stageUpdatedAt: new Date()
  });

  await refreshApplicantSummaries(applicantId);
  return { message: "Interview approved & stage moved" };
}

async function getEmbassyInterviewUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const interview = doc.data()?.embassyInterview || null;
  if (!interview) return null;

  return {
    ...interview,
    createdAt: normalizeDate(interview.createdAt)
  };
}

async function addInterviewTicketUseCase(req) {
  const applicantId = req.params.id;
  const { date, time } = req.body;
  if (req.user.role !== "AGENCY") throw new AppError("Only Agency can upload interview ticket", 403);
  if (!date || !time) throw new AppError("Date and Time required", 400);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);
  const currentStage = Number(applicantSnap.data()?.stage || 1);
  if (currentStage < 8) throw new AppError("Cannot add interview ticket before interview completion stage", 400);

  let fileUrl = "";
  const existingTicket = applicantSnap.data()?.interviewTicket || {};
  if (req.file) {
    const bucket = admin.storage().bucket();
    const fileName = `interview-ticket/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();
    fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    await deleteStorageFileIfExists(bucket, existingTicket.fileUrl);
  }

  await applicantRef.set(
    {
      interviewTicket: {
        date,
        time,
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        createdAt: new Date()
      }
    },
    { merge: true }
  );
  return { message: "Interview ticket saved" };
}

async function getInterviewTicketUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const interviewTicket = doc.data()?.interviewTicket || null;
  if (!interviewTicket) return null;

  return {
    ...interviewTicket,
    createdAt: normalizeDate(interviewTicket.createdAt)
  };
}

async function uploadInterviewBiometricUseCase(req) {
  const applicantId = req.params.id;
  if (req.user.role !== "AGENCY") throw new AppError("Only Agency can upload interview biometric slip", 403);
  if (!req.file) throw new AppError("File required", 400);

  const bucket = admin.storage().bucket();
  const fileName = `interview-biometric/${applicantId}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);
  await fileUpload.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype }
  });
  await fileUpload.makePublic();
  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

  const docRef = db.collection("applicants").doc(applicantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new AppError("Applicant not found", 404);
  const currentStage = Number(docSnap.data()?.stage || 1);
  const previousBiometricUrl = docSnap.data()?.interviewBiometric?.fileUrl || "";
  if (currentStage < 8) throw new AppError("Cannot add interview biometric before interview completion stage", 400);

  await docRef.set(
    {
      interviewBiometric: {
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt: new Date()
      }
    },
    { merge: true }
  );

  await deleteStorageFileIfExists(bucket, previousBiometricUrl);

  await docRef.update({
    stage: 9,
    stageUpdatedAt: new Date()
  });

  return { message: "Interview biometric uploaded & stage completed" };
}

async function getInterviewBiometricUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const interviewBiometric = doc.data()?.interviewBiometric || null;
  if (!interviewBiometric) return null;

  return {
    ...interviewBiometric,
    uploadedAt: normalizeDate(interviewBiometric.uploadedAt)
  };
}

async function getInterviewWorkflowUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);
  const data = doc.data() || {};

  const embassyInterview = data.embassyInterview
    ? {
        ...data.embassyInterview,
        createdAt: normalizeDate(data.embassyInterview.createdAt)
      }
    : null;

  const interviewTicket = data.interviewTicket
    ? {
        ...data.interviewTicket,
        createdAt: normalizeDate(data.interviewTicket.createdAt)
      }
    : null;

  const interviewBiometric = data.interviewBiometric
    ? {
        ...data.interviewBiometric,
        uploadedAt: normalizeDate(data.interviewBiometric.uploadedAt)
      }
    : null;

  return {
    embassyInterview,
    interviewTicket,
    interviewBiometric
  };
}

module.exports = {
  addDispatchUseCase,
  addEmbassyInterviewUseCase,
  addInterviewTicketUseCase,
  approveContractUseCase,
  approveEmbassyInterviewUseCase,
  getContractUseCase,
  getDispatchesUseCase,
  getEmbassyInterviewUseCase,
  getInterviewWorkflowUseCase,
  getInterviewBiometricUseCase,
  getInterviewTicketUseCase,
  uploadContractUseCase,
  uploadInterviewBiometricUseCase
};

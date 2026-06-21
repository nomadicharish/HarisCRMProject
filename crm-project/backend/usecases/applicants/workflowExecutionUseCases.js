const { db, admin } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { logger } = require("../../lib/logger");
const { normalizeDate } = require("../../services/applicantDomainService");
const { refreshApplicantDocumentSummary } = require("../../services/applicantSummaryService");
const { addStageLog, autoAdvanceStage } = require("../../services/applicantWorkflowStageService");
const {
  recordAdminApproval,
  recordAgencyTask,
  recordEmployerWorkflowInitiated
} = require("../../services/notificationService");
const { safeSendCalendarInvite } = require("../../services/calendarInviteService");
const { deleteStorageFileIfExists } = require("../../utils/storageFiles");
const { isSuperUserLikeRole } = require("../../utils/roles");
const SIGNED_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

async function addDispatchUseCase(req) {
  const applicantId = req.params.id;
  const { note, trackingUrl, awbNumber } = req.body;
  const userRole = req.user?.role || "";

  if (userRole !== "AGENCY") throw new AppError("Only agency can add dispatch details", 403);
  if (!note || !awbNumber) throw new AppError("Note and AWB Number are required", 400);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  const applicantStage = Number(applicant.stage || 1);
  if (applicantStage < 3 || applicantStage >= 5) {
    throw new AppError("Dispatch can only be added during dispatch or contract stage", 400);
  }
  if (applicantStage === 4 && applicant.contract?.fileUrl) {
    throw new AppError("Dispatch details cannot be added after the employer uploads the contract", 400);
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

  await recordAgencyTask({
    applicantId,
    applicant: applicantSnap.data() || {},
    user: req.user,
    actionKey: "DOCUMENT_DISPATCHED"
  });

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
  const isSuperUser = isSuperUserLikeRole(req.user.role);
  const isEmployer = req.user.role === "EMPLOYER";
  const contractFile = req.file || (Array.isArray(req.files?.file) ? req.files.file[0] : null);

  if (!isSuperUser && !isEmployer) throw new AppError("Only Super User or Employer can upload contract", 403);
  if (!contractFile) throw new AppError("File required", 400);

  const bucket = admin.storage().bucket();
  const fileName = `contracts/${applicantId}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);

  await fileUpload.save(contractFile.buffer, {
    metadata: { contentType: contractFile.mimetype }
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
        additionalDocuments: await uploadAdditionalContractDocuments(req, applicantId),
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

  await refreshApplicantDocumentSummary(applicantId);
  await recordEmployerWorkflowInitiated({
    applicantId,
    applicant: applicantSnapBeforeUpdate.data() || {},
    user: req.user,
    actionKey: "CONTRACT_ISSUED"
  });

  return {
    message: "Contract uploaded successfully",
    fileUrl,
    status: contractStatus
  };
}

async function uploadAdditionalContractDocuments(req, applicantId) {
  const files = Array.isArray(req.files?.additionalDocuments) ? req.files.additionalDocuments.slice(0, 3) : [];
  if (!files.length) return [];

  const bucket = admin.storage().bucket();
  const uploadedAt = new Date();
  const uploads = [];

  for (const [index, file] of files.entries()) {
    const fileName = `contracts/additional/${applicantId}_${Date.now()}_${index}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    });
    await fileUpload.makePublic();
    uploads.push({
      name: file.originalname || `Additional Document ${index + 1}`,
      fileUrl: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
      uploadedAt
    });
  }

  return uploads;
}

async function uploadSignedContractUseCase(req) {
  const applicantId = req.params.id;
  if (req.user.role !== "AGENCY") throw new AppError("Only Agent can upload signed contract", 403);
  const contractFile = req.file || (Array.isArray(req.files?.file) ? req.files.file[0] : null);
  const additionalFiles = Array.isArray(req.files?.additionalDocuments) ? req.files.additionalDocuments.slice(0, 3) : [];
  validateSignedDocumentFileSize([contractFile, ...additionalFiles].filter(Boolean));

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  const currentStage = Number(applicant.stage || 1);
  if (currentStage < 5) throw new AppError("Cannot upload signed contract before contract issue stage", 400);

  const existingDocuments = normalizeSignedContractDocuments(applicant.signedContract);
  const rejectedDocuments = existingDocuments.filter((document) => document.status === "REJECTED");
  const mainDocument = existingDocuments.find((document) => document.id === "signed-contract");
  const mustUploadMain = !mainDocument?.fileUrl || mainDocument?.status === "REJECTED";
  if (mustUploadMain && !contractFile) throw new AppError("Signed contract file required", 400);
  if (!mustUploadMain && !rejectedDocuments.length && !contractFile && !additionalFiles.length) {
    throw new AppError("File required", 400);
  }

  const bucket = admin.storage().bucket();
  const uploadedAt = new Date();
  const documents = existingDocuments.length ? existingDocuments : buildEmptySignedContractDocuments();

  if (contractFile) {
    const uploadedDocument = await uploadSignedDocumentFile(bucket, applicantId, contractFile, "signed-contract");
    const previousMainUrl = documents[0]?.fileUrl || applicant?.signedContract?.fileUrl || "";
    documents[0] = {
      ...documents[0],
      ...uploadedDocument,
      status: "UPLOADED",
      required: true,
      uploadedBy: req.user.uid,
      uploadedByRole: req.user.role,
      uploadedAt,
      rejectedBy: null,
      rejectedAt: null
    };
    await deleteStorageFileIfExists(bucket, previousMainUrl);
  }

  const additionalTargets = getAdditionalUploadTargets(documents, additionalFiles.length);
  for (const [index, file] of additionalFiles.entries()) {
    const targetIndex = additionalTargets[index];
    if (targetIndex === undefined) break;
    const uploadedDocument = await uploadSignedDocumentFile(bucket, applicantId, file, documents[targetIndex].id);
    const previousUrl = documents[targetIndex]?.fileUrl || "";
    documents[targetIndex] = {
      ...documents[targetIndex],
      ...uploadedDocument,
      status: "UPLOADED",
      uploadedBy: req.user.uid,
      uploadedByRole: req.user.role,
      uploadedAt,
      rejectedBy: null,
      rejectedAt: null
    };
    await deleteStorageFileIfExists(bucket, previousUrl);
  }

  const hasRejected = documents.some((document) => document.status === "REJECTED");
  const activeMainDocument = documents[0]?.status === "UPLOADED" ? documents[0] : null;
  if (!activeMainDocument?.fileUrl) throw new AppError("Signed contract file required", 400);

  await applicantRef.set(
    {
      signedContract: {
        fileUrl: activeMainDocument.fileUrl,
        name: activeMainDocument.name,
        documents: documents.map(cleanSignedContractDocumentForWrite),
        status: hasRejected ? "REJECTED" : "UPLOADED",
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt,
        rejectedDocumentCount: documents.filter((document) => document.status === "REJECTED").length
      }
    },
    { merge: true }
  );

  if (currentStage === 5 && !hasRejected) {
    await applicantRef.update({
      stage: 6,
      stageUpdatedAt: uploadedAt
    });
    await safeAddStageLog({
      applicantId,
      fromStage: 5,
      toStage: 6,
      role: req.user.role,
      action: "SIGNED_CONTRACT_UPLOADED"
    });
  }

  await safeRefreshApplicantDocumentSummary(applicantId);
  await recordAgencyTask({
    applicantId,
    applicant,
    user: req.user,
    actionKey: "SIGNED_CONTRACT_UPLOADED"
  });
  return { message: "Signed contract uploaded successfully", fileUrl: activeMainDocument.fileUrl };
}

async function getSignedContractUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const signedContract = doc.data()?.signedContract || null;
  if (!signedContract) return null;
  return normalizeSignedContractResponse(signedContract);
}

async function rejectSignedContractDocumentUseCase(req) {
  const applicantId = req.params.id;
  const documentId = req.params.documentId;
  if (!isSuperUserLikeRole(req.user.role)) throw new AppError("Only Super User can reject signed documents", 403);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  const documents = normalizeSignedContractDocuments(applicant.signedContract);
  const documentIndex = documents.findIndex((document) => document.id === documentId);
  if (documentIndex < 0) throw new AppError("Signed document not found", 404);
  if (!documents[documentIndex].fileUrl) throw new AppError("Signed document has no uploaded file", 400);

  const rejectedAt = new Date();
  const bucket = admin.storage().bucket();
  const rejectedUrl = documents[documentIndex].fileUrl;
  documents[documentIndex] = {
    ...documents[documentIndex],
    rejectedFileUrl: rejectedUrl,
    fileUrl: "",
    status: "REJECTED",
    rejectedBy: req.user.uid,
    rejectedByRole: req.user.role,
    rejectedAt
  };

  const activeMainDocument = documents[0]?.status === "UPLOADED" ? documents[0] : null;
  await applicantRef.set(
    {
      signedContract: {
        ...(applicant.signedContract || {}),
        fileUrl: activeMainDocument?.fileUrl || "",
        name: activeMainDocument?.name || documents[0]?.name || "",
        documents: documents.map(cleanSignedContractDocumentForWrite),
        status: "REJECTED",
        rejectedBy: req.user.uid,
        rejectedAt,
        rejectedDocumentCount: documents.filter((document) => document.status === "REJECTED").length
      },
      applicantBannerStatus: "Super user rejected few document."
    },
    { merge: true }
  );

  await deleteStorageFileIfExists(bucket, rejectedUrl);
  await safeRefreshApplicantDocumentSummary(applicantId);
  return { message: "Signed document rejected" };
}

async function safeAddStageLog(payload) {
  try {
    await addStageLog(payload);
  } catch (error) {
    logger.error("Signed contract stage log failed", {
      applicantId: payload?.applicantId,
      message: error?.message,
      stack: error?.stack
    });
  }
}

async function safeRefreshApplicantDocumentSummary(applicantId) {
  try {
    await refreshApplicantDocumentSummary(applicantId);
  } catch (error) {
    logger.error("Signed contract summary refresh failed", {
      applicantId,
      message: error?.message,
      stack: error?.stack
    });
  }
}

function buildEmptySignedContractDocuments() {
  return [
    {
      id: "signed-contract",
      label: "Signed Contract",
      required: true,
      status: "PENDING"
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `additional-${index + 1}`,
      label: `Additional Signed Document ${index + 1}`,
      required: false,
      status: "PENDING"
    }))
  ];
}

function cleanSignedContractDocumentForWrite(document = {}) {
  return Object.fromEntries(
    Object.entries(document)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value === undefined ? null : value])
  );
}

function validateSignedDocumentFileSize(files = []) {
  const oversizedFile = files.find((file) => Number(file?.size || 0) > SIGNED_DOCUMENT_MAX_BYTES);
  if (oversizedFile) {
    throw new AppError("Signed documents must be 5 MB or smaller", 400);
  }
}

function normalizeSignedContractDocuments(signedContract = null) {
  const emptyDocuments = buildEmptySignedContractDocuments();
  const sourceDocuments = Array.isArray(signedContract?.documents) ? signedContract.documents : [];
  const documents = emptyDocuments.map((emptyDocument) => {
    const existing = sourceDocuments.find((document) => document.id === emptyDocument.id);
    return {
      ...emptyDocument,
      ...(existing || {}),
      uploadedAt: existing?.uploadedAt || null,
      rejectedAt: existing?.rejectedAt || null
    };
  });

  if (!sourceDocuments.length && signedContract?.fileUrl) {
    documents[0] = {
      ...documents[0],
      name: signedContract.name || "Signed Contract",
      fileUrl: signedContract.fileUrl,
      status: "UPLOADED",
      uploadedBy: signedContract.uploadedBy || "",
      uploadedByRole: signedContract.uploadedByRole || "",
      uploadedAt: signedContract.uploadedAt || null
    };
  }

  return documents;
}

function normalizeSignedContractResponse(signedContract) {
  const documents = normalizeSignedContractDocuments(signedContract).map((document) => ({
    ...document,
    uploadedAt: normalizeDate(document.uploadedAt),
    rejectedAt: normalizeDate(document.rejectedAt)
  }));
  const activeMainDocument = documents[0]?.status === "UPLOADED" ? documents[0] : null;
  return {
    ...signedContract,
    fileUrl: activeMainDocument?.fileUrl || signedContract.fileUrl || "",
    documents,
    uploadedAt: normalizeDate(signedContract.uploadedAt),
    rejectedAt: normalizeDate(signedContract.rejectedAt),
    rejectedDocumentCount: documents.filter((document) => document.status === "REJECTED").length
  };
}

async function uploadSignedDocumentFile(bucket, applicantId, file, documentId) {
  const fileName = `signed-contracts/${applicantId}_${documentId}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);
  await fileUpload.save(file.buffer, {
    metadata: { contentType: file.mimetype }
  });
  await fileUpload.makePublic();

  return {
    name: file.originalname || "Signed Document",
    fileUrl: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
    contentType: file.mimetype,
    size: file.size || 0
  };
}

function getAdditionalUploadTargets(documents, uploadCount) {
  if (!uploadCount) return [];
  const additionalIndexes = documents
    .map((document, index) => ({ document, index }))
    .filter(({ document }) => !document.required);
  const rejectedIndexes = additionalIndexes
    .filter(({ document }) => document.status === "REJECTED")
    .map(({ index }) => index);
  const emptyIndexes = additionalIndexes
    .filter(({ document }) => !document.fileUrl && document.status !== "REJECTED")
    .map(({ index }) => index);
  return [...rejectedIndexes, ...emptyIndexes].slice(0, uploadCount);
}

function assertNoRejectedSignedDocuments(applicant) {
  const signedContract = applicant?.signedContract;
  const rejectedCount = Number(signedContract?.rejectedDocumentCount || 0);
  const hasRejectedDocument =
    String(signedContract?.status || "").toUpperCase() === "REJECTED" ||
    rejectedCount > 0 ||
    normalizeSignedContractDocuments(signedContract).some((document) => document.status === "REJECTED");
  if (hasRejectedDocument) {
    throw new AppError("Super user rejected few document. Upload the rejected signed document before continuing.", 400);
  }
}

async function approveContractUseCase(req) {
  const applicantId = req.params.id;
  if (!isSuperUserLikeRole(req.user.role)) throw new AppError("Only Super User can approve contract", 403);

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

  await refreshApplicantDocumentSummary(applicantId);
  await recordAdminApproval({
    applicantId,
    applicant,
    user: req.user,
    actionKey: "CONTRACT_APPROVED"
  });
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
  if (!(isSuperUserLikeRole(req.user.role) || req.user.role === "EMPLOYER")) {
    throw new AppError("Only Super User or Employer can add interview", 403);
  }
  if (!dateTime) throw new AppError("Date & Time required", 400);

  const isSuperUser = isSuperUserLikeRole(req.user.role);
  const docRef = db.collection("applicants").doc(applicantId);
  const existingApplicantSnap = await docRef.get();
  const previousDocumentUrl = existingApplicantSnap.exists
    ? existingApplicantSnap.data()?.embassyInterview?.documentUrl || ""
    : "";

  let documentUrl = "";
  let bucket = null;
  if (req.file) {
    bucket = admin.storage().bucket();
    const fileName = `embassy-interview-documents/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();
    documentUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  }

  await docRef.set(
    {
      embassyInterview: {
        dateTime,
        documentUrl,
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

  if (documentUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousDocumentUrl);
  }

  if (isSuperUser) {
    const doc = await docRef.get();
    const currentStage = doc.data()?.stage || 1;
    if (currentStage === 8) {
      await docRef.update({
        stage: 9,
        stageUpdatedAt: new Date()
      });
    }
  }

  await refreshApplicantDocumentSummary(applicantId);
  if (isSuperUser) {
    await safeSendCalendarInvite({
      applicantRef: docRef,
      applicantId,
      applicant: existingApplicantSnap.data() || {},
      eventType: "embassyInterview",
      workflow: {
        ...(existingApplicantSnap.data()?.embassyInterview || {}),
        dateTime
      },
      includeAgency: true
    });
  }
  await recordEmployerWorkflowInitiated({
    applicantId,
    applicant: existingApplicantSnap.data() || {},
    user: req.user,
    actionKey: "EMBASSY_INTERVIEW_INITIATED"
  });
  return { message: "Embassy interview added" };
}

async function approveEmbassyInterviewUseCase(req) {
  const applicantId = req.params.id;
  if (!isSuperUserLikeRole(req.user.role)) throw new AppError("Only Super User can approve", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  const doc = await docRef.get();
  const applicant = doc.data();
  if (!applicant?.embassyInterview) throw new AppError("No interview data", 400);

  await docRef.update({
    "embassyInterview.approved": true,
    "embassyInterview.status": "APPROVED",
    "embassyInterview.approvedBy": req.user.uid,
    "embassyInterview.approvedAt": new Date(),
    stage: Number(applicant.stage || 1) === 8 ? 9 : Number(applicant.stage || 1),
    stageUpdatedAt: new Date()
  });

  await refreshApplicantDocumentSummary(applicantId);
  await safeSendCalendarInvite({
    applicantRef: docRef,
    applicantId,
    applicant,
    eventType: "embassyInterview",
    workflow: applicant.embassyInterview,
    includeAgency: true
  });
  await recordAdminApproval({
    applicantId,
    applicant,
    user: req.user,
    actionKey: "EMBASSY_INTERVIEW_APPROVED"
  });
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
  assertNoRejectedSignedDocuments(applicantSnap.data() || {});
  const currentStage = Number(applicantSnap.data()?.stage || 1);
  if (currentStage < 9) throw new AppError("Cannot add interview ticket before interview completion stage", 400);

  const existingTicket = applicantSnap.data()?.interviewTicket || {};
  let fileUrl = existingTicket.fileUrl || "";
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
        createdAt: existingTicket.createdAt || new Date(),
        updatedAt: new Date()
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
  assertNoRejectedSignedDocuments(docSnap.data() || {});
  const currentStage = Number(docSnap.data()?.stage || 1);
  const previousBiometricUrl = docSnap.data()?.interviewBiometric?.fileUrl || "";
  if (currentStage < 9) throw new AppError("Cannot add interview biometric before interview completion stage", 400);

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
    stage: 10,
    stageUpdatedAt: new Date()
  });

  await recordAgencyTask({
    applicantId,
    applicant: docSnap.data() || {},
    user: req.user,
    actionKey: "EMBASSY_INTERVIEW_COMPLETED"
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
  assertNoRejectedSignedDocuments,
  getContractUseCase,
  getDispatchesUseCase,
  getEmbassyInterviewUseCase,
  getInterviewWorkflowUseCase,
  getInterviewBiometricUseCase,
  getSignedContractUseCase,
  getInterviewTicketUseCase,
  rejectSignedContractDocumentUseCase,
  uploadContractUseCase,
  uploadInterviewBiometricUseCase,
  uploadSignedContractUseCase
};

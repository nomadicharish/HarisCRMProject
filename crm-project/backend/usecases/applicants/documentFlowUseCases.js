const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantDocumentSummary } = require("../../services/applicantSummaryService");
const { getAuthenticatedUserFromReq } = require("../../services/applicantDomainService");
const { recordAgencyTask, recordNotificationAction } = require("../../services/notificationService");
const {
  areLatestRequiredDocumentsApproved,
  syncApplicantDocumentStage
} = require("../../services/applicantWorkflowStageService");
const { getCompanyDocumentsForApplicant, normalizeAllowedDocumentExtensions } = require("../../utils/normalizers");
const { deleteStorageFileIfExists, getAuthorizedReadUrl } = require("../../utils/storageFiles");
const { isSuperUserLikeRole } = require("../../utils/roles");
const {
  getLatestDocumentsCache,
  setLatestDocumentsCache,
  invalidateLatestDocumentsCache
} = require("../../services/applicantDocumentCache");

const DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "jpeg", "jpg", "png"];
const CV_WORD_DOCUMENT_ID = "cv_word_format_with_photo";
const CV_WORD_ALLOWED_EXTENSIONS = ["doc", "docx"];
const MIME_TYPES_BY_EXTENSION = {
  pdf: ["application/pdf"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  png: ["image/png"],
  doc: ["application/msword", "application/doc", "application/vnd.ms-word", "application/x-msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"]
};

function normalizeDateValue(value) {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "object" && value._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

async function readLatestVersionRecord(docSnap) {
  if (!docSnap?.exists) return null;
  const docData = docSnap.data() || {};

  if (docData?.latestVersion?.id || docData?.latestVersion?.status || docData?.latestVersion?.fileUrl) {
    const latest = {
      id: docData.latestVersion.id || "latest",
      ...docData.latestVersion,
      uploadedAt: normalizeDateValue(docData.latestVersion.uploadedAt),
      reviewedAt: normalizeDateValue(docData.latestVersion.reviewedAt),
      createdAt: normalizeDateValue(docData.latestVersion.createdAt)
    };
    if (latest.fileUrl) {
      latest.fileUrl = await getAuthorizedReadUrl(admin.storage().bucket(), latest.fileUrl);
    }
    return latest;
  }

  const latestSnap = await docSnap.ref.collection("versions").orderBy("uploadedAt", "desc").limit(1).get();
  if (!latestSnap.empty) {
    const latestDoc = latestSnap.docs[0];
    return {
      id: latestDoc.id,
      ...latestDoc.data(),
      uploadedAt: normalizeDateValue(latestDoc.data()?.uploadedAt),
      reviewedAt: normalizeDateValue(latestDoc.data()?.reviewedAt),
      createdAt: normalizeDateValue(latestDoc.data()?.createdAt)
    };
  }

  if (docData?.fileUrl) {
    const legacy = {
      id: "legacy-root",
      fileUrl: docData.fileUrl,
      status: String(docData.status || "PENDING").toUpperCase(),
      uploadedAt: normalizeDateValue(docData.uploadedAt),
      uploadedBy: docData.uploadedBy || "",
      uploadedByRole: docData.uploadedByRole || "",
      rejectedReason: docData.rejectedReason || "",
      fileName: docData.fileName || ""
    };
    if (legacy.fileUrl) {
      legacy.fileUrl = await getAuthorizedReadUrl(admin.storage().bucket(), legacy.fileUrl);
    }
    return legacy;
  }

  return null;
}

async function getLatestDocumentsMap(applicantId) {
  const cachedDocuments = getLatestDocumentsCache(applicantId);
  if (cachedDocuments) return cachedDocuments;

  const snapshot = await db.collection("applicants").doc(applicantId).collection("documents").get();
  const entries = await Promise.all(
    snapshot.docs.map(async (docSnap) => [docSnap.id, await readLatestVersionRecord(docSnap)])
  );

  const documents = Object.fromEntries(
    entries
      .filter(([, latestVersion]) => Boolean(latestVersion))
      .map(([docType, latestVersion]) => [docType, [latestVersion]])
  );
  setLatestDocumentsCache(applicantId, documents);
  return documents;
}

function normalizeAllowedExtensionsForUpload(documentType, documentConfig = null) {
  const allowedExtensions = normalizeAllowedDocumentExtensions(
    documentConfig?.allowedExtensions?.length ? documentConfig.allowedExtensions : DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS
  );
  const configDocumentId = String(documentConfig?.id || documentConfig?.key || documentConfig?.docType || documentType || "").trim();
  if (configDocumentId === CV_WORD_DOCUMENT_ID) {
    return Array.from(new Set([...allowedExtensions, ...CV_WORD_ALLOWED_EXTENSIONS]));
  }
  return allowedExtensions;
}

function validateUploadedFileForDocument(file, documentConfig = null, documentType = "") {
  const allowedExtensions = normalizeAllowedExtensionsForUpload(documentType, documentConfig);
  const allowedExtensionSet = new Set(allowedExtensions);
  const allowedMimeTypes = new Set(allowedExtensions.flatMap((extension) => MIME_TYPES_BY_EXTENSION[extension] || []));
  const extension = String(file?.originalname || "").split(".").pop().toLowerCase();

  if (!allowedExtensionSet.has(extension) || !allowedMimeTypes.has(file?.mimetype)) {
    throw new AppError(`Only ${allowedExtensions.map((item) => item.toUpperCase()).join(", ")} files are allowed`, 400);
  }
}

async function getApplicantDocumentConfig(applicantId, documentType) {
  const applicantDoc = await db.collection("applicants").doc(applicantId).get();
  if (!applicantDoc.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantDoc.data() || {};
  const companyDoc = applicant.companyId ? await db.collection("companies").doc(applicant.companyId).get() : null;
  if (!companyDoc?.exists) return null;

  const companyDocuments = getCompanyDocumentsForApplicant(companyDoc.data() || {}, applicant);
  return companyDocuments.find((document) => document.id === documentType) || null;
}

async function uploadDocumentByTypeUseCase(req) {
  const { applicantId, docType } = req.params;
  const file = req.file;
  if (!file) throw new AppError("No file uploaded", 400);
  validateUploadedFileForDocument(file, await getApplicantDocumentConfig(applicantId, docType), docType);

  const { userId } = getAuthenticatedUserFromReq(req);
  const bucket = admin.storage().bucket();
  const fileName = `${docType}-${Date.now()}`;
  const filePath = `applicants/${applicantId}/documents/${fileName}`;
  const fileUpload = bucket.file(filePath);

  await fileUpload.save(file.buffer, {
    metadata: { contentType: file.mimetype }
  });

  // Store internal storage path; signed URLs are generated on read for authenticated users
  const fileUrl = `gs://${bucket.name}/${filePath}`;

  const docRef = db.collection("applicants").doc(applicantId).collection("documents").doc(docType);
  const existingDoc = await docRef.get();
  const previousFileUrl = existingDoc.exists ? existingDoc.data()?.fileUrl : "";
  const uploadedAt = new Date();
  try {
    await docRef.set({
      uploaded: true,
      fileUrl,
      fileName: file.originalname || "",
      status: "PENDING",
      uploadedBy: userId,
      uploadedAt,
      deferred: false,
      deferredAt: null,
      deferredBy: null,
      deferReason: null,
      latestStatus: "PENDING",
      latestVersion: {
        id: "legacy-root",
        fileUrl,
        status: "PENDING",
        uploadedAt,
        uploadedBy: userId,
        fileName: file.originalname || "",
        contentType: file.mimetype || "",
        sizeBytes: Number(file.size || 0)
      }
    }, { merge: true });
  } catch (error) {
    await deleteStorageFileIfExists(bucket, fileUrl);
    throw error;
  }

  await deleteStorageFileIfExists(bucket, previousFileUrl);

  invalidateLatestDocumentsCache(applicantId);
  await refreshApplicantDocumentSummary(applicantId);
  const applicantSnap = await db.collection("applicants").doc(applicantId).get();
  await recordAgencyTask({
    applicantId,
    applicant: applicantSnap.exists ? applicantSnap.data() || {} : {},
    user: req.user,
    actionKey: "DOCUMENT_UPLOADED"
  });
  return { message: "Document uploaded successfully", fileUrl };
}

async function markDocumentSeenUseCase(req) {
  const { applicantId, docType } = req.params;
  const { userRole, userId } = getAuthenticatedUserFromReq(req);
  if (!["AGENCY", "EMPLOYER"].includes(userRole)) throw new AppError("Invalid role", 403);

  const docRef = db.collection("applicants").doc(applicantId).collection("documents").doc(docType);
  const snap = await docRef.get();
  if (!snap.exists) throw new AppError("Document not found", 404);

  const roleKey = userRole.toLowerCase();
  await docRef.update({
    [`seenBy.${roleKey}`]: admin.firestore.FieldValue.arrayUnion(userId)
  });
  invalidateLatestDocumentsCache(applicantId);
  return { message: "Document marked as seen" };
}

async function deferDocumentUseCase(req) {
  const applicantId = req.params.applicantId || req.params.id;
  const docType = req.params.docType;
  const { reason } = req.body || {};
  const { userRole, userId } = getAuthenticatedUserFromReq(req);

  if (req.params.applicantId) {
    if (userRole !== "AGENCY") throw new AppError("Only Agency can defer documents", 403);
    const docRef = db.collection("applicants").doc(applicantId).collection("documents").doc(docType);
    const snap = await docRef.get();
    if (!snap.exists) throw new AppError("Document not found", 404);
    await docRef.update({
      deferred: true,
      deferredAt: admin.firestore.FieldValue.serverTimestamp(),
      deferredBy: userId,
      deferReason: reason || "Deferred by agency"
    });
  } else {
    await db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType)
      .collection("versions")
      .add({
        status: "DEFERRED",
        fileUrl: "",
        rejectedReason: "",
        uploadedAt: new Date(),
        uploadedBy: userId,
        uploadedByRole: userRole
      });
  }

  invalidateLatestDocumentsCache(applicantId);
  await refreshApplicantDocumentSummary(applicantId);
  return { message: "Document deferred" };
}

async function uploadDocumentGenericUseCase(req) {
  const { id } = req.params;
  const { documentType } = req.body;
  if (!req.file) throw new AppError("File required", 400);
  validateUploadedFileForDocument(req.file, await getApplicantDocumentConfig(id, documentType), documentType);

  const bucket = admin.storage().bucket();
  const fileName = `applicants/${id}/${documentType}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);

  await fileUpload.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype }
  });
  // Store internal path; generate signed URLs when serving to authenticated clients
  const fileUrl = `gs://${bucket.name}/${fileName}`;
  const docRef = db.collection("applicants").doc(id).collection("documents").doc(documentType);
  const latestVersionSnap = await docRef
    .collection("versions")
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();
  const previousVersionFileUrl = latestVersionSnap.empty ? "" : latestVersionSnap.docs[0].data()?.fileUrl || "";

  const versionRef = docRef.collection("versions").doc();
  const versionPayload = {
    fileUrl,
    status: "PENDING",
    rejectedReason: "",
    uploadedAt: new Date(),
    uploadedBy: req.user.uid,
    uploadedByRole: req.user.role,
    fileName: req.file.originalname || "",
    contentType: req.file.mimetype || "",
    sizeBytes: Number(req.file.size || 0)
  };

  try {
    await versionRef.set(versionPayload);
    await docRef.set({
      documentType,
      updatedAt: new Date(),
      latestStatus: "PENDING",
      latestVersion: {
        id: versionRef.id,
        ...versionPayload
      }
    }, { merge: true });
  } catch (error) {
    await deleteStorageFileIfExists(bucket, fileUrl);
    throw error;
  }

  await deleteStorageFileIfExists(bucket, previousVersionFileUrl);

  invalidateLatestDocumentsCache(id);
  await refreshApplicantDocumentSummary(id);
  const applicantSnap = await db.collection("applicants").doc(id).get();
  await recordAgencyTask({
    applicantId: id,
    applicant: applicantSnap.exists ? applicantSnap.data() || {} : {},
    user: req.user,
    actionKey: "DOCUMENT_UPLOADED"
  });
  return { message: "Uploaded successfully" };
}

async function getDocumentsUseCase(req) {
  const includeHistory = ["1", "true", "yes"].includes(String(req.query?.history || req.query?.full || "").toLowerCase());
  if (!includeHistory) {
    return getLatestDocumentsMap(req.params.id);
  }

  const snapshot = await db.collection("applicants").doc(req.params.id).collection("documents").get();
  const result = {};
  const versionEntries = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const versionsSnap = await doc.ref.collection("versions").orderBy("uploadedAt", "desc").get();
      return [
        doc.id,
        versionsSnap.docs.map((v) => ({
          id: v.id,
          ...v.data()
        }))
      ];
    })
  );
  versionEntries.forEach(([docId, versions]) => {
    result[docId] = versions;
  });
  return result;
}

async function rejectDocumentUseCase(req) {
  const { id, docType, versionId } = req.params;
  const { reason } = req.body;
  const versionRef = db
    .collection("applicants")
    .doc(id)
    .collection("documents")
    .doc(docType)
    .collection("versions")
    .doc(versionId);
  const versionSnap = await versionRef.get();
  const previousVersionData = versionSnap.exists ? versionSnap.data() || {} : {};
  const reviewedAt = new Date();
  await versionRef.update({
      status: "REJECTED",
      rejectedReason: reason,
      reviewedAt
  });

  await db.collection("applicants").doc(id).collection("documents").doc(docType).set({
    latestStatus: "REJECTED",
    latestVersion: {
      id: versionId,
      ...previousVersionData,
      status: "REJECTED",
      rejectedReason: reason,
      reviewedAt
    },
    updatedAt: reviewedAt
  }, { merge: true });

  invalidateLatestDocumentsCache(id);
  await refreshApplicantDocumentSummary(id);
  const applicantSnap = await db.collection("applicants").doc(id).get();
  await recordNotificationAction({
    actionKey: "DOCUMENT_REJECTED",
    applicantId: id,
    applicant: applicantSnap.exists ? applicantSnap.data() || {} : {},
    user: req.user
  });
  return { message: "Rejected" };
}

async function approveDocumentUseCase(req) {
  const { id, docType, versionId } = req.params;
  if (!isSuperUserLikeRole(req.user.role)) {
    throw new AppError("Only Super User can approve documents", 403);
  }

  const versionRef = db
    .collection("applicants")
    .doc(id)
    .collection("documents")
    .doc(docType)
    .collection("versions")
    .doc(versionId);
  const applicantRef = db.collection("applicants").doc(id);
  const applicantSnap = await applicantRef.get();
  const applicant = applicantSnap.exists ? applicantSnap.data() : null;
  const hadAllRequiredApproved = await areLatestRequiredDocumentsApproved(id, applicant || {});
  const versionSnap = await versionRef.get();
  const previousVersionData = versionSnap.exists ? versionSnap.data() || {} : {};
  const reviewedAt = new Date();
  await versionRef.update({
      status: "APPROVED",
      reviewedAt,
      reviewedBy: req.user.uid
  });

  await db.collection("applicants").doc(id).collection("documents").doc(docType).set({
    latestStatus: "APPROVED",
    latestVersion: {
      id: versionId,
      ...previousVersionData,
      status: "APPROVED",
      reviewedAt,
      reviewedBy: req.user.uid,
      rejectedReason: ""
    },
    updatedAt: reviewedAt
  }, { merge: true });

  invalidateLatestDocumentsCache(id);
  await syncApplicantDocumentStage(id, applicant, req.user.uid, req.user.role);
  await refreshApplicantDocumentSummary(id);
  const hasAllRequiredApproved = await areLatestRequiredDocumentsApproved(id, applicant || {});
  if (!hadAllRequiredApproved && hasAllRequiredApproved) {
    await recordNotificationAction({
      actionKey: "DOCUMENT_APPROVED",
      applicantId: id,
      applicant: applicant || {},
      user: req.user
    });
  }
  return { message: "Document approved" };
}

module.exports = {
  approveDocumentUseCase,
  deferDocumentUseCase,
  getLatestDocumentsMap,
  getDocumentsUseCase,
  markDocumentSeenUseCase,
  rejectDocumentUseCase,
  uploadDocumentByTypeUseCase,
  uploadDocumentGenericUseCase
};

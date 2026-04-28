const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { getAuthenticatedUserFromReq } = require("../../services/applicantDomainService");
const { syncApplicantDocumentStage } = require("../../services/applicantWorkflowStageService");
const { deleteStorageFileIfExists } = require("../../utils/storageFiles");

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
    return {
      id: docData.latestVersion.id || "latest",
      ...docData.latestVersion,
      uploadedAt: normalizeDateValue(docData.latestVersion.uploadedAt),
      reviewedAt: normalizeDateValue(docData.latestVersion.reviewedAt),
      createdAt: normalizeDateValue(docData.latestVersion.createdAt)
    };
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
    return {
      id: "legacy-root",
      fileUrl: docData.fileUrl,
      status: String(docData.status || "PENDING").toUpperCase(),
      uploadedAt: normalizeDateValue(docData.uploadedAt),
      uploadedBy: docData.uploadedBy || "",
      uploadedByRole: docData.uploadedByRole || "",
      rejectedReason: docData.rejectedReason || "",
      fileName: docData.fileName || ""
    };
  }

  return null;
}

async function getLatestDocumentsMap(applicantId) {
  const snapshot = await db.collection("applicants").doc(applicantId).collection("documents").get();
  const entries = await Promise.all(
    snapshot.docs.map(async (docSnap) => [docSnap.id, await readLatestVersionRecord(docSnap)])
  );

  return Object.fromEntries(
    entries
      .filter(([, latestVersion]) => Boolean(latestVersion))
      .map(([docType, latestVersion]) => [docType, [latestVersion]])
  );
}

async function uploadDocumentByTypeUseCase(req) {
  const { applicantId, docType } = req.params;
  const file = req.file;
  if (!file) throw new AppError("No file uploaded", 400);

  const { userId } = getAuthenticatedUserFromReq(req);
  const bucket = admin.storage().bucket();
  const fileName = `${docType}-${Date.now()}`;
  const filePath = `applicants/${applicantId}/documents/${fileName}`;
  const fileUpload = bucket.file(filePath);

  await fileUpload.save(file.buffer, {
    metadata: { contentType: file.mimetype }
  });

  const [fileUrl] = await fileUpload.getSignedUrl({
    action: "read",
    expires: "03-01-2035"
  });

  const docRef = db.collection("applicants").doc(applicantId).collection("documents").doc(docType);
  const existingDoc = await docRef.get();
  const previousFileUrl = existingDoc.exists ? existingDoc.data()?.fileUrl : "";
  const uploadedAt = new Date();
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

  await deleteStorageFileIfExists(bucket, previousFileUrl);

  await refreshApplicantSummaries(applicantId);
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

  await refreshApplicantSummaries(applicantId);
  return { message: "Document deferred" };
}

async function uploadDocumentGenericUseCase(req) {
  const { id } = req.params;
  const { documentType } = req.body;
  if (!req.file) throw new AppError("File required", 400);

  const bucket = admin.storage().bucket();
  const fileName = `applicants/${id}/${documentType}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);

  await fileUpload.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype }
  });
  await fileUpload.makePublic();

  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
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

  await deleteStorageFileIfExists(bucket, previousVersionFileUrl);

  await refreshApplicantSummaries(id);
  return { message: "Uploaded successfully" };
}

async function getDocumentsUseCase(req) {
  const latestOnly = String(req.query?.latest || "").toLowerCase() === "true";
  if (latestOnly) {
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

  await refreshApplicantSummaries(id);
  return { message: "Rejected" };
}

async function approveDocumentUseCase(req) {
  const { id, docType, versionId } = req.params;
  if (req.user.role !== "SUPER_USER") {
    throw new AppError("Only Super User can approve documents", 403);
  }

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

  const applicantRef = db.collection("applicants").doc(id);
  const applicantSnap = await applicantRef.get();
  const applicant = applicantSnap.exists ? applicantSnap.data() : null;
  await syncApplicantDocumentStage(id, applicant, req.user.uid, req.user.role);
  await refreshApplicantSummaries(id);
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

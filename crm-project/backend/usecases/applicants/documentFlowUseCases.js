const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { getAuthenticatedUserFromReq } = require("../../services/applicantDomainService");
const { syncApplicantDocumentStage } = require("../../services/applicantWorkflowStageService");

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
  await docRef.update({
    uploaded: true,
    fileUrl,
    uploadedBy: userId,
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    deferred: false,
    deferredAt: null,
    deferredBy: null,
    deferReason: null
  });

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

  await docRef.set({ documentType, updatedAt: new Date() }, { merge: true });
  await docRef.collection("versions").add({
    fileUrl,
    status: "PENDING",
    rejectedReason: "",
    uploadedAt: new Date(),
    uploadedBy: req.user.uid,
    uploadedByRole: req.user.role
  });

  await refreshApplicantSummaries(id);
  return { message: "Uploaded successfully" };
}

async function getDocumentsUseCase(req) {
  const latestOnly = String(req.query?.latest || "").toLowerCase() === "true";
  const snapshot = await db.collection("applicants").doc(req.params.id).collection("documents").get();
  const result = {};

  for (const doc of snapshot.docs) {
    let query = doc.ref.collection("versions").orderBy("uploadedAt", "desc");
    if (latestOnly) query = query.limit(1);
    const versionsSnap = await query.get();
    result[doc.id] = versionsSnap.docs.map((v) => ({
      id: v.id,
      ...v.data()
    }));
  }
  return result;
}

async function rejectDocumentUseCase(req) {
  const { id, docType, versionId } = req.params;
  const { reason } = req.body;
  await db
    .collection("applicants")
    .doc(id)
    .collection("documents")
    .doc(docType)
    .collection("versions")
    .doc(versionId)
    .update({
      status: "REJECTED",
      rejectedReason: reason,
      reviewedAt: new Date()
    });

  await refreshApplicantSummaries(id);
  return { message: "Rejected" };
}

async function approveDocumentUseCase(req) {
  const { id, docType, versionId } = req.params;
  if (req.user.role !== "SUPER_USER") {
    throw new AppError("Only Super User can approve documents", 403);
  }

  await db
    .collection("applicants")
    .doc(id)
    .collection("documents")
    .doc(docType)
    .collection("versions")
    .doc(versionId)
    .update({
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: req.user.uid
    });

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
  getDocumentsUseCase,
  markDocumentSeenUseCase,
  rejectDocumentUseCase,
  uploadDocumentByTypeUseCase,
  uploadDocumentGenericUseCase
};

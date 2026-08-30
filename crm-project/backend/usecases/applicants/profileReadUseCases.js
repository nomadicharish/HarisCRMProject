const { db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { getCompanyDocumentsForApplicant } = require("../../utils/normalizers");
const { getCommonDocumentType, getCommonDocumentTypeByTarget } = require("../../config/commonDocumentTypes");
const {
  areLatestRequiredDocumentsApproved,
  syncApplicantDocumentStage
} = require("../../services/applicantWorkflowStageService");
const { buildPaymentSummaryResponse } = require("./paymentUseCases");
const { getLatestDocumentsMap } = require("./documentFlowUseCases");
const {
  getApplicantBannerStatusText,
  getApplicantStageLabel,
  normalizeDate,
  resolveApplicantPaymentCurrency,
  resolveApplicantTotalEur,
  roundCurrency
} = require("../../services/applicantDomainService");
const { isSuperUserLikeRole } = require("../../utils/roles");
const { admin } = require("../../config/firebase");
const { extractStoragePath } = require("../../utils/storageFiles");

function applyCommonDocumentOverrides(documents = [], commonDocuments = {}, countryId = "") {
  const storedItems = Array.isArray(commonDocuments.documents) ? commonDocuments.documents : [];
  const legacyItems = Array.isArray(commonDocuments.standardReferences) ? commonDocuments.standardReferences : [];
  const items = [...storedItems, ...legacyItems.filter((legacyItem) => !storedItems.some((item) => item?.id === legacyItem?.id))];
  const overrides = items.filter((item) => Array.isArray(item?.countryIds) && item.countryIds.includes(countryId));

  return documents.map((document) => {
    const matchingOverride = overrides.find((item) => {
      const definition = getCommonDocumentType(item.documentType);
      return definition?.targetField && getCommonDocumentTypeByTarget(document.id, definition.targetField, document.name)?.value === definition.value;
    });
    if (!matchingOverride) return document;
    const definition = getCommonDocumentType(matchingOverride.documentType);
    if (definition?.targetField === "reference") {
      return { ...document, referenceFileName: matchingOverride.fileName || "", referenceUrl: matchingOverride.fileUrl || "" };
    }
    if (definition?.targetField === "documentToFill") {
      return {
        ...document,
        documentToFillFileName: matchingOverride.fileName || "",
        documentToFillUrl: matchingOverride.fileUrl || "",
        templateFileName: matchingOverride.fileName || "",
        templateFileUrl: matchingOverride.fileUrl || ""
      };
    }
    return document;
  });
}

function projectAccountantApplicant(applicant = {}) {
  const personalDetails = applicant.personalDetails || {};
  return {
    id: applicant.id || "",
    firstName: applicant.firstName || personalDetails.firstName || "",
    lastName: applicant.lastName || personalDetails.lastName || "",
    fullName:
      applicant.fullName ||
      [applicant.firstName || personalDetails.firstName, applicant.lastName || personalDetails.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
    age: applicant.age ?? personalDetails.age ?? null,
    personalDetails: {
      age: personalDetails.age ?? applicant.age ?? null
    },
    jobPositionName: applicant.jobPositionName || "",
    companyName: applicant.companyName || "",
    agencyName: applicant.agencyName || "",
    profilePhotoUrl: applicant.profilePhotoUrl || "",
    photoUrl: applicant.photoUrl || "",
    passportPhotoUrl: applicant.passportPhotoUrl || "",
    passportSizePhotoUrl: applicant.passportSizePhotoUrl || "",
    stage: Number(applicant.stage || 1),
    approvalStatus: applicant.approvalStatus || "",
    stageLabel: applicant.stageLabel || "",
    applicantBannerStatus: applicant.applicantBannerStatus || "",
    statusText: applicant.statusText || "",
    workflowFlags: applicant.workflowFlags || {},
    payment: applicant.payment || {},
    paymentCurrency: applicant.paymentCurrency || applicant.currency || "",
    currency: applicant.currency || applicant.paymentCurrency || "",
    totalApplicantPayment: applicant.totalApplicantPayment ?? applicant.totalAmount ?? 0,
    totalAmount: applicant.totalAmount ?? applicant.totalApplicantPayment ?? 0,
    amountPaid: applicant.amountPaid ?? applicant.paidAmount ?? 0,
    paidAmount: applicant.paidAmount ?? applicant.amountPaid ?? 0
  };
}

function shouldProjectAccountantApplicant(role) {
  return role === "JUNIOR_ACCOUNTANT" || role === "SENIOR_ACCOUNTANT";
}

async function getApplicantProfilePhotoUrl(applicantId) {
  const docsRef = db.collection("applicants").doc(applicantId).collection("documents");
  const [photoDoc, legacyPhotoDoc] = await Promise.all([
    docsRef.doc("passport_photo_scan_standard").get(),
    docsRef.doc("passport_size_photo").get()
  ]);
  const data = photoDoc.exists ? photoDoc.data() || {} : legacyPhotoDoc.exists ? legacyPhotoDoc.data() || {} : {};
  return data?.latestVersion?.fileUrl || data?.fileUrl || "";
}

async function syncApplicantDocumentStageFromSummary(applicantId, applicant, user) {
  // Document mutations always refresh docSummary. On profile reads, use that
  // materialized result instead of re-reading every document and the company
  // configuration. This retains automatic stage advancement when all required
  // documents are approved and removes the expensive read-time scan.
  const documentSummary = applicant?.docSummary || applicant?.documentSummary || {};
  if (documentSummary.allRequiredApproved !== true) return applicant;
  return syncApplicantDocumentStage(applicantId, applicant, user?.uid, user?.role);
}

async function assertEmployerApplicantAccess(req, applicant) {
  if (req.user?.role !== "EMPLOYER") throw new AppError("Only Employer can access quick print assets", 403);
  if (String(applicant?.approvalStatus || "").toLowerCase() !== "approved") {
    // Keep direct profile, document, and file URLs consistent with the
    // employer list: an employer must never be able to access an applicant
    // before the applicant has been approved.
    throw new AppError("Applicant is pending admin approval", 403);
  }
  let employerId = req.user?.employerId || "";
  if (!employerId) {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    employerId = userDoc.exists ? userDoc.data()?.employerId || "" : "";
  }
  if (!employerId) throw new AppError("Employer profile not linked", 403);
  const employerDoc = await db.collection("employers").doc(employerId).get();
  const employer = employerDoc.exists ? employerDoc.data() || {} : {};
  const employerCompanyIds = Array.isArray(employer.companyIds) && employer.companyIds.length
    ? employer.companyIds
    : employer.companyId
      ? [employer.companyId]
      : [];
  if (!employerCompanyIds.includes(applicant.companyId)) {
    throw new AppError("Applicant is outside employer scope", 403);
  }
}

async function getApplicantQuickPrintAssetUseCase(req) {
  const applicantId = req.params.id;
  const assetType = String(req.params.assetType || "").toLowerCase();
  const applicantDoc = await db.collection("applicants").doc(applicantId).get();
  if (!applicantDoc.exists) throw new AppError("Applicant not found", 404);
  const applicant = applicantDoc.data() || {};
  await assertEmployerApplicantAccess(req, applicant);

  const assetUrls = {
    photo: await getApplicantProfilePhotoUrl(applicantId),
    flight: applicant?.visaTravel?.fileUrl || "",
    bus: applicant?.visaTravel?.busTicketUrl || ""
  };
  const fileUrl = assetUrls[assetType];
  if (!Object.prototype.hasOwnProperty.call(assetUrls, assetType)) throw new AppError("Invalid quick print asset type", 400);
  if (!fileUrl) throw new AppError("Quick print asset not found", 404);

  const bucket = admin.storage().bucket();
  const storagePath = extractStoragePath(fileUrl, bucket.name);
  if (storagePath) {
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) throw new AppError("Quick print asset not found", 404);
    const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
    return {
      buffer,
      contentType: metadata?.contentType || "application/octet-stream",
      fileName: metadata?.name?.split("/").pop() || `${assetType}-asset`
    };
  }

  if (!/^https:\/\//i.test(fileUrl)) throw new AppError("Unsupported quick print asset URL", 400);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new AppError("Unable to download quick print asset", 502);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    fileName: `${assetType}-asset`
  };
}

function containsFileUrl(value, fileUrl) {
  if (!value || typeof value !== "object") return value === fileUrl;
  if (Array.isArray(value)) return value.some((item) => containsFileUrl(item, fileUrl));
  return Object.values(value).some((item) => containsFileUrl(item, fileUrl));
}

async function getApplicantPrivateFileUseCase(req) {
  const applicantId = req.params.id;
  const fileUrl = String(req.query.url || "");
  const applicantDoc = await db.collection("applicants").doc(applicantId).get();
  if (!applicantDoc.exists) throw new AppError("Applicant not found", 404);
  const applicant = applicantDoc.data() || {};
  if (!containsFileUrl(applicant, fileUrl)) throw new AppError("File not linked to applicant", 403);
  if (req.user?.role === "EMPLOYER") await assertEmployerApplicantAccess(req, applicant);
  const bucket = admin.storage().bucket();
  const storagePath = extractStoragePath(fileUrl, bucket.name);
  if (!storagePath) throw new AppError("Unsupported private file", 400);
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new AppError("File not found", 404);
  const [metadata] = await file.getMetadata();
  return { stream: file.createReadStream(), contentType: metadata.contentType || "application/octet-stream", fileName: storagePath.split("/").pop() };
}

async function getApplicantByIdUseCase(req) {
  const applicantId = req.params.id;
  const doc = await db.collection("applicants").doc(applicantId).get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);

  const applicant = doc.data() || {};
  if (req.user?.role === "EMPLOYER") await assertEmployerApplicantAccess(req, applicant);
  const applicantData = await syncApplicantDocumentStageFromSummary(applicantId, applicant, req.user);

  const [companyDoc, countryDoc, agencyDoc] = await Promise.all([
    applicantData.companyId ? db.collection("companies").doc(applicantData.companyId).get() : Promise.resolve(null),
    !applicantData.countryName && applicantData.countryId ? db.collection("countries").doc(applicantData.countryId).get() : Promise.resolve(null),
    !applicantData.agencyName && applicantData.agencyId ? db.collection("agencies").doc(applicantData.agencyId).get() : Promise.resolve(null)
  ]);

  const companyName = applicantData.companyName || (companyDoc?.exists ? companyDoc.data()?.name || "" : "");
  const companyDocuments = companyDoc?.exists ? getCompanyDocumentsForApplicant(companyDoc.data() || {}, applicantData) : [];
  const countryName = applicantData.countryName || (countryDoc?.exists ? countryDoc.data()?.name || "" : "");
  const agencyName = applicantData.agencyName || (agencyDoc?.exists ? agencyDoc.data()?.name || "" : "");
  const profilePhotoUrl = await getApplicantProfilePhotoUrl(applicantId);

  const applicantPaid = roundCurrency(
    applicantData?.paymentSummary?.applicant?.paid ??
      applicantData?.paymentsSummary?.applicant?.paid ??
      applicantData?.amountPaid ??
      applicantData?.paidAmount ??
      0
  );
  const totalApplicantPayment = await resolveApplicantTotalEur(applicantData);
  const paymentCurrency = resolveApplicantPaymentCurrency(applicantData);

  const docSummary = applicantData?.docSummary || applicantData?.documentSummary || {};
  const approvalFlags = applicantData?.approvalFlags || {};
  const approvedRequired = Number(docSummary.approvedCount || 0) > 0 && Number(docSummary.pendingCount || 0) === 0;
  const rejectedRequired = Number(docSummary.rejectedCount || 0) > 0;
  const pendingRequired = Number(docSummary.pendingCount || 0) > 0;
  const uploadedRequired = Number(docSummary.totalCount || 0) > 0;
  const hasPendingEmbassyInterviewApproval =
    Boolean(approvalFlags?.hasPendingEmbassyInterviewApproval) ||
    String(applicantData?.embassyInterview?.status || "").toUpperCase() === "PENDING" ||
    (Boolean(applicantData?.embassyInterview?.dateTime) && !Boolean(applicantData?.embassyInterview?.approved));
  const hasPendingEmbassyAppointmentApproval =
    String(applicantData?.embassyAppointment?.status || "").toUpperCase() === "PENDING";
  const hasPendingVisaCollectionApproval =
    String(applicantData?.visaCollection?.status || "").toUpperCase() === "PENDING";
  const hasRejectedSignedContractDocuments =
    String(applicantData?.signedContract?.status || "").toUpperCase() === "REJECTED" ||
    Number(applicantData?.signedContract?.rejectedDocumentCount || 0) > 0;
  const stageLabel = getApplicantStageLabel(applicantData?.stage, applicantData?.approvalStatus);
  const applicantBannerStatus = getApplicantBannerStatusText(applicantData, {
    hasCompletedDocumentStage: Number(applicantData?.stage || 1) >= 3 && approvedRequired,
    pendingRequired,
    rejectedRequired,
    uploadedRequired,
    hasDocuments: uploadedRequired,
    hasTravelDetails: Boolean(
      applicantData?.travelDetails?.travelDate ||
      applicantData?.travelDetails?.time ||
      applicantData?.travelDetails?.fileUrl
    ),
    hasBiometricSlip: Boolean(applicantData?.biometricSlip?.fileUrl),
    hasInterviewTicket: Boolean(
      applicantData?.interviewTicket?.date ||
      applicantData?.interviewTicket?.time ||
      applicantData?.interviewTicket?.fileUrl
    ),
    hasInterviewBiometric: Boolean(applicantData?.interviewBiometric?.fileUrl),
    hasVisaTravel: Boolean(
      applicantData?.visaTravel?.date ||
      applicantData?.visaTravel?.time ||
      applicantData?.visaTravel?.fileUrl
    ),
    hasResidencePermit: Boolean(
      applicantData?.residencePermit?.trpUrl ||
      applicantData?.residencePermit?.frontUrl ||
      applicantData?.residencePermit?.backUrl ||
      applicantData?.residencePermit?.fileUrl
    ),
    hasPendingEmbassyInterviewApproval,
    hasPendingEmbassyAppointmentApproval,
    hasPendingVisaCollectionApproval,
    hasRejectedSignedContractDocuments,
    hasEmbassyAppointment: Boolean(
      applicantData?.embassyAppointment?.date ||
      applicantData?.embassyAppointment?.time ||
      applicantData?.embassyAppointment?.fileUrl
    )
  });

  const response = {
    id: doc.id,
    ...applicantData,
    companyName,
    companyDocuments,
    profilePhotoUrl,
    agencyName,
    countryName,
    totalApplicantPayment,
    totalAmount: totalApplicantPayment,
    paymentCurrency,
    currency: paymentCurrency,
    stageLabel,
    applicantBannerStatus,
    statusText: applicantBannerStatus,
    amountPaid: applicantPaid,
    paidAmount: applicantPaid,
    payment: {
      total: totalApplicantPayment,
      totalInr: totalApplicantPayment,
      paid: applicantPaid,
      paidInr: applicantPaid,
      pending: Math.max(0, totalApplicantPayment - applicantPaid),
      pendingInr: Math.max(0, totalApplicantPayment - applicantPaid),
      currency: paymentCurrency,
      sourceCurrency: paymentCurrency,
      confirmedAmount: roundCurrency(applicantData?.paymentSummary?.applicant?.confirmedAmount ?? applicantPaid),
      awaitingJuniorAmount: roundCurrency(applicantData?.paymentSummary?.applicant?.awaitingJuniorAmount),
      awaitingSeniorAmount: roundCurrency(applicantData?.paymentSummary?.applicant?.awaitingSeniorAmount),
      hasPendingAcknowledgement: Boolean(applicantData?.paymentSummary?.applicant?.hasPendingAcknowledgement),
      hasPendingConfirmation: Boolean(applicantData?.paymentSummary?.applicant?.hasPendingConfirmation),
      paymentCompleted: Boolean(applicantData?.paymentSummary?.applicant?.paymentCompleted)
    }
  };
  return shouldProjectAccountantApplicant(req.user?.role)
    ? projectAccountantApplicant(response)
    : response;
}

async function getApplicantWorkflowBundleUseCase(req) {
  const applicantId = req.params.id;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  if (req.user?.role === "EMPLOYER") await assertEmployerApplicantAccess(req, applicant);
  const applicantData = await syncApplicantDocumentStageFromSummary(applicantId, applicant, req.user);
  const profilePhotoUrl = await getApplicantProfilePhotoUrl(applicantId);

  const [companyDoc, countryDoc, agencyDoc] = await Promise.all([
    !applicantData.companyName && applicantData.companyId ? db.collection("companies").doc(applicantData.companyId).get() : Promise.resolve(null),
    !applicantData.countryName && applicantData.countryId ? db.collection("countries").doc(applicantData.countryId).get() : Promise.resolve(null),
    !applicantData.agencyName && applicantData.agencyId ? db.collection("agencies").doc(applicantData.agencyId).get() : Promise.resolve(null)
  ]);

  const companyName = applicantData.companyName || (companyDoc?.exists ? companyDoc.data()?.name || "" : "");
  const countryName = applicantData.countryName || (countryDoc?.exists ? countryDoc.data()?.name || "" : "");
  const agencyName = applicantData.agencyName || (agencyDoc?.exists ? agencyDoc.data()?.name || "" : "");

  const totalApplicantPayment = await resolveApplicantTotalEur(applicantData);
  const paymentCurrency = resolveApplicantPaymentCurrency(applicantData);
  const paidFromSummary = roundCurrency(
    applicantData?.paymentSummary?.applicant?.paid ??
      applicantData?.paymentsSummary?.applicant?.paid ??
      applicantData?.amountPaid ??
      applicantData?.paidAmount ??
      0
  );
  const applicantPaid = Math.max(0, paidFromSummary);

  const includeDetails = ["1", "true", "yes"].includes(String(req.query?.includeDetails || "").toLowerCase());

  const contract = applicantData.contract
    ? {
        ...applicantData.contract,
        uploadedAt: normalizeDate(applicantData.contract.uploadedAt),
        issuedAt: normalizeDate(applicantData.contract.issuedAt),
        approvedAt: normalizeDate(applicantData.contract.approvedAt)
      }
    : null;

  const embassyAppointment = applicantData.embassyAppointment
    ? {
        ...applicantData.embassyAppointment,
        time:
          applicantData.embassyAppointment.time ||
          applicantData.embassyAppointment.appointmentTime ||
          (applicantData.embassyAppointment.dateTime
            ? String(applicantData.embassyAppointment.dateTime).split("T")[1]?.slice(0, 5)
            : "") ||
          "",
        createdAt: normalizeDate(applicantData.embassyAppointment.createdAt)
      }
    : null;

  const biometricSlip = applicantData.biometricSlip
    ? {
        ...applicantData.biometricSlip,
        uploadedAt: normalizeDate(applicantData.biometricSlip.uploadedAt)
      }
    : null;

  const embassyInterview = applicantData.embassyInterview
    ? {
        ...applicantData.embassyInterview,
        createdAt: normalizeDate(applicantData.embassyInterview.createdAt)
      }
    : null;

  const interviewTicket = applicantData.interviewTicket
    ? {
        ...applicantData.interviewTicket,
        createdAt: normalizeDate(applicantData.interviewTicket.createdAt)
      }
    : null;

  const interviewBiometric = applicantData.interviewBiometric
    ? {
        ...applicantData.interviewBiometric,
        uploadedAt: normalizeDate(applicantData.interviewBiometric.uploadedAt)
      }
    : null;

  const visaCollection =
    applicantData.visaCollection &&
    (String(applicantData.visaCollection.status || "").toUpperCase() === "APPROVED" ||
      (isSuperUserLikeRole(req.user?.role) || req.user?.role === "EMPLOYER"))
      ? {
          ...applicantData.visaCollection,
          createdAt: normalizeDate(applicantData.visaCollection.createdAt),
          approvedAt: normalizeDate(applicantData.visaCollection.approvedAt)
        }
      : null;

  const visaTravel = applicantData.visaTravel
    ? {
        ...applicantData.visaTravel,
        createdAt: normalizeDate(applicantData.visaTravel.createdAt),
        updatedAt: normalizeDate(applicantData.visaTravel.updatedAt)
      }
    : null;

  const visaCollectionTravel = applicantData.visaCollectionTravel
    ? {
        ...applicantData.visaCollectionTravel,
        createdAt: normalizeDate(applicantData.visaCollectionTravel.createdAt),
        updatedAt: normalizeDate(applicantData.visaCollectionTravel.updatedAt)
      }
    : null;

  const residencePermit = applicantData.residencePermit
    ? {
        ...applicantData.residencePermit,
        uploadedAt: normalizeDate(applicantData.residencePermit.uploadedAt)
      }
    : null;

  const docSummary = applicantData?.docSummary || applicantData?.documentSummary || {};
  const approvalFlags = applicantData?.approvalFlags || {};
  const approvedRequired = Number(docSummary.approvedCount || 0) > 0 && Number(docSummary.pendingCount || 0) === 0;
  const rejectedRequired = Number(docSummary.rejectedCount || 0) > 0;
  const pendingRequired = Number(docSummary.pendingCount || 0) > 0;
  const uploadedRequired = Number(docSummary.totalCount || 0) > 0;
  const hasDocuments = uploadedRequired;
  const hasPendingEmbassyInterviewApproval =
    Boolean(approvalFlags?.hasPendingEmbassyInterviewApproval) ||
    String(applicantData?.embassyInterview?.status || "").toUpperCase() === "PENDING" ||
    (Boolean(applicantData?.embassyInterview?.dateTime) && !Boolean(applicantData?.embassyInterview?.approved));
  const hasPendingEmbassyAppointmentApproval =
    String(applicantData?.embassyAppointment?.status || "").toUpperCase() === "PENDING";
  const hasPendingVisaCollectionApproval =
    String(applicantData?.visaCollection?.status || "").toUpperCase() === "PENDING";
  const hasRejectedSignedContractDocuments =
    String(applicantData?.signedContract?.status || "").toUpperCase() === "REJECTED" ||
    Number(applicantData?.signedContract?.rejectedDocumentCount || 0) > 0;
  const hasTravelDetails = Boolean(
    applicantData?.travelDetails?.travelDate ||
    applicantData?.travelDetails?.time ||
    applicantData?.travelDetails?.fileUrl
  );
  const hasBiometricSlip = Boolean(applicantData?.biometricSlip?.fileUrl);
  const hasInterviewTicket = Boolean(
    applicantData?.interviewTicket?.date ||
    applicantData?.interviewTicket?.time ||
    applicantData?.interviewTicket?.fileUrl
  );
  const hasInterviewBiometric = Boolean(applicantData?.interviewBiometric?.fileUrl);
  const hasVisaTravel = Boolean(
    applicantData?.visaTravel?.date ||
    applicantData?.visaTravel?.time ||
    applicantData?.visaTravel?.fileUrl
  );
  const hasVisaCollectionTravel = Boolean(
    applicantData?.visaCollectionTravel?.date ||
    applicantData?.visaCollectionTravel?.time ||
    applicantData?.visaCollectionTravel?.fileUrl
  );
  const hasResidencePermit = Boolean(
    applicantData?.residencePermit?.trpUrl ||
    applicantData?.residencePermit?.frontUrl ||
    applicantData?.residencePermit?.backUrl ||
    applicantData?.residencePermit?.fileUrl
  );
  const hasEmbassyAppointment = Boolean(
    applicantData?.embassyAppointment?.date ||
    applicantData?.embassyAppointment?.time ||
    applicantData?.embassyAppointment?.fileUrl
  );
  const hasCompletedDocumentStage = Number(applicantData?.stage || 1) >= 3 && approvedRequired;
  const stageLabel = getApplicantStageLabel(applicantData?.stage, applicantData?.approvalStatus);
  const computedStatusText = getApplicantBannerStatusText(applicantData, {
    hasCompletedDocumentStage,
    pendingRequired,
    rejectedRequired,
    uploadedRequired,
    hasDocuments,
    hasTravelDetails,
    hasBiometricSlip,
    hasInterviewTicket,
    hasInterviewBiometric,
    hasVisaTravel,
    hasResidencePermit,
    hasPendingEmbassyInterviewApproval,
    hasPendingEmbassyAppointmentApproval,
    hasPendingVisaCollectionApproval,
    hasRejectedSignedContractDocuments,
    hasEmbassyAppointment
  });
  const applicantBannerStatus = String(computedStatusText || "");
  const statusText = applicantBannerStatus;

  const workflowFlags = {
    isDocumentsApproved: Boolean(hasCompletedDocumentStage),
    hasRejectedDocuments: Boolean(rejectedRequired),
    hasPendingDocumentsApproval: Boolean(pendingRequired),
    isDispatchCompleted:
      Boolean(applicantData?.documentDispatch?.hasDispatch) ||
      Number(applicantData?.dispatchSummary?.count || 0) > 0 ||
      Number(applicantData?.stage || 1) >= 4,
    isContractIssued: Number(applicantData?.stage || 1) >= 5 || String(applicantData?.contract?.status || "").toUpperCase() === "APPROVED",
    isSignedContractUploaded:
      !hasRejectedSignedContractDocuments &&
      (Number(applicantData?.stage || 1) >= 6 || Boolean(applicantData?.signedContract?.fileUrl)),
    hasRejectedSignedContractDocuments,
    isContractPendingApproval: String(applicantData?.contract?.status || "").toUpperCase() === "PENDING",
    isEmbassyAppointmentCreated: Boolean(hasEmbassyAppointment),
    isEmbassyAppointmentApproved:
      String(applicantData?.embassyAppointment?.status || "").toUpperCase() === "APPROVED" ||
      Boolean(applicantData?.embassyAppointment?.approved) ||
      Number(applicantData?.stage || 1) >= 7,
    isEmbassyAppointmentPendingApproval: Boolean(hasPendingEmbassyAppointmentApproval),
    isEmbassyAppointmentCompleted: Number(applicantData?.stage || 1) >= 8,
    isTravelTicketUploaded: Boolean(hasTravelDetails),
    isBiometricCompleted: Boolean(hasBiometricSlip),
    isEmbassyInterviewCreated: Boolean(applicantData?.embassyInterview?.dateTime),
    isEmbassyInterviewApproved:
      String(applicantData?.embassyInterview?.status || "").toUpperCase() === "APPROVED" ||
      Number(applicantData?.stage || 1) >= 9,
    isEmbassyInterviewPendingApproval: Boolean(hasPendingEmbassyInterviewApproval),
    isInterviewTicketUploaded: Boolean(hasInterviewTicket),
    isInterviewBiometricCompleted: Boolean(hasInterviewBiometric),
    isVisaCollectionCreated: Boolean(applicantData?.visaCollection?.date && applicantData?.visaCollection?.time),
    isVisaCollectionApproved:
      String(applicantData?.visaCollection?.status || "").toUpperCase() === "APPROVED" ||
      Number(applicantData?.stage || 1) >= 11,
    isVisaCollectionPendingApproval: Boolean(hasPendingVisaCollectionApproval),
    isVisaCollectionTravelAdded: Boolean(hasVisaCollectionTravel),
    isVisaTravelUploaded: Boolean(hasVisaTravel),
    isResidencePermitUploaded: Boolean(hasResidencePermit)
  };
  const {
    contract: _contract,
    biometricSlip: _biometricSlip,
    embassyAppointment: _embassyAppointment,
    embassyInterview: _embassyInterview,
    interviewTicket: _interviewTicket,
    interviewBiometric: _interviewBiometric,
    visaCollection: _visaCollection,
    visaCollectionTravel: _visaCollectionTravel,
    visaTravel: _visaTravel,
    residencePermit: _residencePermit,
    travelDetails: _travelDetails,
    paymentSummary: _paymentSummary,
    paymentsSummary: _paymentsSummary,
    companyDocuments: _companyDocuments,
    documentSummary: _documentSummary,
    ...applicantCore
  } = applicantData || {};

  const normalizedDocSummary = applicantData?.docSummary || applicantData?.documentSummary || {};

  const total = roundCurrency(totalApplicantPayment);
  const paid = roundCurrency(applicantPaid);
  const pending = Math.max(0, roundCurrency(total - paid));

  const response = {
    applicant: {
      id: applicantId,
      ...applicantCore,
      profilePhotoUrl,
      docSummary: normalizedDocSummary,
      companyName,
      agencyName,
      countryName,
      totalApplicantPayment,
      totalAmount: totalApplicantPayment,
      paymentCurrency,
      currency: paymentCurrency,
      stageLabel,
      applicantBannerStatus,
      currentStatus: applicantBannerStatus,
      statusText,
      workflowFlags,
      amountPaid: paid,
      paidAmount: paid,
      payment: {
        total,
        totalEur: total,
        totalInr: total,
        paid,
        paidInr: paid,
        pending,
        pendingInr: pending,
        currency: paymentCurrency,
        sourceCurrency: paymentCurrency,
        confirmedAmount: roundCurrency(applicantData?.paymentSummary?.applicant?.confirmedAmount ?? paid),
        awaitingJuniorAmount: roundCurrency(applicantData?.paymentSummary?.applicant?.awaitingJuniorAmount),
        awaitingSeniorAmount: roundCurrency(applicantData?.paymentSummary?.applicant?.awaitingSeniorAmount),
        hasPendingAcknowledgement: Boolean(applicantData?.paymentSummary?.applicant?.hasPendingAcknowledgement),
        hasPendingConfirmation: Boolean(applicantData?.paymentSummary?.applicant?.hasPendingConfirmation),
        paymentCompleted: Boolean(applicantData?.paymentSummary?.applicant?.paymentCompleted)
      }
    },
    currency: paymentCurrency
  };

  if (shouldProjectAccountantApplicant(req.user?.role)) {
    response.applicant = projectAccountantApplicant(response.applicant);
    return response;
  }

  if (includeDetails) {
    return {
      ...response,
      contract,
      embassyAppointment,
      biometricSlip,
      embassyInterview,
      interviewTicket,
      interviewBiometric,
      visaCollection,
      visaCollectionTravel,
      visaTravel,
      residencePermit
    };
  }

  return response;
}

async function getApplicantDocumentsContextUseCase(req) {
  const applicantId = req.params.id;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  if (req.user?.role === "EMPLOYER") await assertEmployerApplicantAccess(req, applicant);
  const profilePhotoUrl = await getApplicantProfilePhotoUrl(applicantId);
  const [companyDoc, commonDocumentsDoc] = await Promise.all([
    applicant.companyId ? db.collection("companies").doc(applicant.companyId).get() : Promise.resolve(null),
    db.collection("settings").doc("commonDocuments").get()
  ]);
  const companyData = companyDoc?.exists ? companyDoc.data() || {} : {};
  const commonDocuments = commonDocumentsDoc.exists ? commonDocumentsDoc.data() || {} : {};
  const storedCommonDocuments = Array.isArray(commonDocuments.documents) ? commonDocuments.documents : [];
  const legacyCommonDocuments = Array.isArray(commonDocuments.standardReferences) ? commonDocuments.standardReferences : [];
  const commonDocumentItems = [
    ...storedCommonDocuments,
    ...legacyCommonDocuments.filter((legacyItem) => !storedCommonDocuments.some((item) => item?.id === legacyItem?.id))
  ];
  const countryReference = commonDocumentItems.find(
    (reference) => reference.documentType === "standard_reference_document" && Array.isArray(reference?.countryIds) && reference.countryIds.includes(applicant.countryId)
  );
  const documentConfigs = companyDoc?.exists
    ? applyCommonDocumentOverrides(getCompanyDocumentsForApplicant(companyData, applicant), commonDocuments, applicant.countryId)
    : [];

  return {
    applicant: {
      id: applicantId,
      firstName: applicant.firstName || applicant.personalDetails?.firstName || "",
      lastName: applicant.lastName || applicant.personalDetails?.lastName || "",
      fullName:
        applicant.fullName ||
        [applicant.firstName || applicant.personalDetails?.firstName, applicant.lastName || applicant.personalDetails?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
      stage: Number(applicant.stage || 1),
      approvalStatus: applicant.approvalStatus || "",
      companyId: applicant.companyId || "",
      countryId: applicant.countryId || "",
      agencyId: applicant.agencyId || "",
      jobPositionId: applicant.jobPositionId || "",
      jobPositionName: applicant.jobPositionName || "",
      standardReferenceFileName: countryReference?.fileName || commonDocuments.standardReferenceFileName || "",
      standardReferenceUrl: countryReference?.fileUrl || commonDocuments.standardReferenceUrl || "",
      profilePhotoUrl
    },
    documentConfigs
  };
}

async function getApplicantPaymentsPageUseCase(req) {
  const applicantId = req.params.applicantId || req.params.id;
  const applicantReq = {
    ...req,
    params: {
      ...req.params,
      id: applicantId
    }
  };
  const applicant = await getApplicantByIdUseCase(applicantReq);
  const paymentSummary = await buildPaymentSummaryResponse(applicantId, applicant);

  return {
    applicant,
    paymentSummary
  };
}

async function getApplicantDocumentsPageUseCase(req) {
  const applicantId = req.params.id;
  const [context, documents] = await Promise.all([
    getApplicantDocumentsContextUseCase(req),
    getLatestDocumentsMap(applicantId)
  ]);

  if (req.user?.role === "EMPLOYER") {
    await assertEmployerApplicantAccess(req, context.applicant);
    const allRequiredDocumentsApproved = await areLatestRequiredDocumentsApproved(applicantId, context.applicant);
    if (!allRequiredDocumentsApproved) {
      throw new AppError("Documents are available after all required documents are approved", 403);
    }
  }

  return {
    applicant: context.applicant,
    documentConfigs: context.documentConfigs,
    documents
  };
}

module.exports = {
  getApplicantByIdUseCase,
  getApplicantDocumentsPageUseCase,
  getApplicantDocumentsContextUseCase,
  getApplicantPaymentsPageUseCase,
  getApplicantWorkflowBundleUseCase,
  getApplicantQuickPrintAssetUseCase
  ,getApplicantPrivateFileUseCase
};

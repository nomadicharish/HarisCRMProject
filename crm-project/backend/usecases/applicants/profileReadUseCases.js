const { db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { getCompanyDocumentsForApplicant } = require("../../utils/normalizers");
const { syncApplicantDocumentStage } = require("../../services/applicantWorkflowStageService");
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

async function getApplicantProfilePhotoUrl(applicantId) {
  const doc = await db.collection("applicants").doc(applicantId).collection("documents").doc("passport_size_photo").get();
  const data = doc.exists ? doc.data() || {} : {};
  return data?.latestVersion?.fileUrl || data?.fileUrl || "";
}

async function getApplicantByIdUseCase(req) {
  const applicantId = req.params.id;
  const doc = await db.collection("applicants").doc(applicantId).get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);

  const applicant = doc.data() || {};
  const applicantData = await syncApplicantDocumentStage(applicantId, applicant, req.user?.uid, req.user?.role);

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

  return {
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
      sourceCurrency: paymentCurrency
    }
  };
}

async function getApplicantWorkflowBundleUseCase(req) {
  const applicantId = req.params.id;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  const applicantData = await syncApplicantDocumentStage(applicantId, applicant, req.user?.uid, req.user?.role);
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
      ["SUPER_USER", "EMPLOYER"].includes(req.user?.role))
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
    isDispatchCompleted: Number(applicantData?.stage || 1) >= 4,
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
        sourceCurrency: paymentCurrency
      }
    },
    currency: paymentCurrency
  };

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
  const profilePhotoUrl = await getApplicantProfilePhotoUrl(applicantId);
  const companyDoc = applicant.companyId ? await db.collection("companies").doc(applicant.companyId).get() : null;
  const companyData = companyDoc?.exists ? companyDoc.data() || {} : {};
  const documentConfigs = companyDoc?.exists ? getCompanyDocumentsForApplicant(companyData, applicant) : [];

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
      standardReferenceFileName: companyData.standardReferenceFileName || "",
      standardReferenceUrl: companyData.standardReferenceUrl || "",
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
  getApplicantWorkflowBundleUseCase
};

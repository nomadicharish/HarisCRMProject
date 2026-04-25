const { db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { normalizeCompanyDocuments } = require("../../utils/normalizers");
const { syncApplicantDocumentStage } = require("../../services/applicantWorkflowStageService");
const {
  getApplicantBannerStatusText,
  getApplicantStageLabel,
  getTodayEurToInrRate,
  normalizeDate,
  resolveApplicantTotalEur,
  roundCurrency
} = require("../../services/applicantDomainService");

async function getApplicantByIdUseCase(req) {
  const applicantId = req.params.id;
  const doc = await db.collection("applicants").doc(applicantId).get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);

  const applicant = doc.data() || {};
  await syncApplicantDocumentStage(applicantId, applicant, req.user?.uid, req.user?.role);

  const refreshedApplicantSnap = await db.collection("applicants").doc(applicantId).get();
  const applicantData = refreshedApplicantSnap.exists ? refreshedApplicantSnap.data() : applicant;

  const [companyDoc, countryDoc, agencyDoc, applicantPaymentsSnap] = await Promise.all([
    applicantData.companyId ? db.collection("companies").doc(applicantData.companyId).get() : Promise.resolve(null),
    applicantData.countryId ? db.collection("countries").doc(applicantData.countryId).get() : Promise.resolve(null),
    applicantData.agencyId ? db.collection("agencies").doc(applicantData.agencyId).get() : Promise.resolve(null),
    db.collection("applicants").doc(applicantId).collection("payments").where("type", "==", "APPLICANT").get()
  ]);

  const companyName = companyDoc?.exists ? companyDoc.data()?.name || "" : "";
  const companyDocuments = companyDoc?.exists ? normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded) : [];
  const countryName = countryDoc?.exists ? countryDoc.data()?.name || "" : "";
  const agencyName = agencyDoc?.exists ? agencyDoc.data()?.name || "" : "";

  let applicantPaid = 0;
  applicantPaymentsSnap.forEach((paymentDoc) => {
    const amount = Number(paymentDoc.data()?.amount);
    if (Number.isFinite(amount)) applicantPaid += amount;
  });

  const storedPaidAmount = Number(applicantData.amountPaid ?? applicantData.paidAmount ?? 0) || 0;
  applicantPaid = Math.max(applicantPaid, storedPaidAmount);
  const totalApplicantPayment = await resolveApplicantTotalEur(applicantData);

  const stageLabel = getApplicantStageLabel(applicantData?.stage, applicantData?.approvalStatus);
  const applicantBannerStatus = String(applicantData?.applicantBannerStatus || stageLabel || "Candidate Created");

  return {
    id: doc.id,
    ...applicantData,
    companyName,
    companyDocuments,
    agencyName,
    countryName,
    totalApplicantPayment,
    totalAmount: totalApplicantPayment,
    stageLabel,
    applicantBannerStatus,
    statusText: applicantBannerStatus,
    amountPaid: applicantPaid,
    paidAmount: applicantPaid,
    payment: {
      total: totalApplicantPayment,
      paid: applicantPaid,
      pending: Math.max(0, totalApplicantPayment - applicantPaid)
    }
  };
}

async function getApplicantWorkflowBundleUseCase(req) {
  const applicantId = req.params.id;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  await syncApplicantDocumentStage(applicantId, applicant, req.user?.uid, req.user?.role);

  const refreshedApplicantSnap = await applicantRef.get();
  const applicantData = refreshedApplicantSnap.exists ? refreshedApplicantSnap.data() : applicant;

  const [companyDoc, countryDoc, agencyDoc] = await Promise.all([
    applicantData.companyId ? db.collection("companies").doc(applicantData.companyId).get() : Promise.resolve(null),
    applicantData.countryId ? db.collection("countries").doc(applicantData.countryId).get() : Promise.resolve(null),
    applicantData.agencyId ? db.collection("agencies").doc(applicantData.agencyId).get() : Promise.resolve(null)
  ]);

  const companyName = companyDoc?.exists ? companyDoc.data()?.name || "" : "";
  const countryName = countryDoc?.exists ? countryDoc.data()?.name || "" : "";
  const agencyName = agencyDoc?.exists ? agencyDoc.data()?.name || "" : "";

  const eurToInrRate = await getTodayEurToInrRate();
  const totalApplicantPayment = await resolveApplicantTotalEur(applicantData);
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
        createdAt: normalizeDate(applicantData.visaTravel.createdAt)
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
  const hasPendingVisaCollectionApproval =
    String(applicantData?.visaCollection?.status || "").toUpperCase() === "PENDING";
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
  const hasResidencePermit = Boolean(
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
    hasPendingVisaCollectionApproval,
    hasEmbassyAppointment
  });
  const applicantBannerStatus = String(computedStatusText || "");
  const statusText = applicantBannerStatus;
  if (applicantBannerStatus !== String(applicantData?.applicantBannerStatus || "")) {
    await applicantRef.set(
      {
        applicantBannerStatus,
        updatedAt: new Date()
      },
      { merge: true }
    );
  }

  const workflowFlags = {
    isDocumentsApproved: Boolean(hasCompletedDocumentStage),
    hasRejectedDocuments: Boolean(rejectedRequired),
    hasPendingDocumentsApproval: Boolean(pendingRequired),
    isDispatchCompleted: Number(applicantData?.stage || 1) >= 4,
    isContractIssued: Number(applicantData?.stage || 1) >= 5 || String(applicantData?.contract?.status || "").toUpperCase() === "APPROVED",
    isContractPendingApproval: String(applicantData?.contract?.status || "").toUpperCase() === "PENDING",
    isEmbassyAppointmentCreated: Boolean(hasEmbassyAppointment),
    isEmbassyAppointmentApproved:
      Boolean(applicantData?.embassyAppointment?.approved) || Number(applicantData?.stage || 1) >= 6,
    isEmbassyAppointmentCompleted: Number(applicantData?.stage || 1) >= 7,
    isTravelTicketUploaded: Boolean(hasTravelDetails),
    isBiometricCompleted: Boolean(hasBiometricSlip),
    isEmbassyInterviewCreated: Boolean(applicantData?.embassyInterview?.dateTime),
    isEmbassyInterviewApproved:
      String(applicantData?.embassyInterview?.status || "").toUpperCase() === "APPROVED" ||
      Number(applicantData?.stage || 1) >= 8,
    isEmbassyInterviewPendingApproval: Boolean(hasPendingEmbassyInterviewApproval),
    isInterviewTicketUploaded: Boolean(hasInterviewTicket),
    isInterviewBiometricCompleted: Boolean(hasInterviewBiometric),
    isVisaCollectionCreated: Boolean(applicantData?.visaCollection?.date && applicantData?.visaCollection?.time),
    isVisaCollectionApproved:
      String(applicantData?.visaCollection?.status || "").toUpperCase() === "APPROVED" ||
      Number(applicantData?.stage || 1) >= 10,
    isVisaCollectionPendingApproval: Boolean(hasPendingVisaCollectionApproval),
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

  const totalInr = roundCurrency(totalApplicantPayment * eurToInrRate);
  const paidInr = roundCurrency(applicantPaid);
  const pendingInr = Math.max(0, roundCurrency(totalInr - paidInr));

  const response = {
    applicant: {
      id: applicantId,
      ...applicantCore,
      docSummary: normalizedDocSummary,
      companyName,
      agencyName,
      countryName,
      totalApplicantPayment,
      totalAmount: totalApplicantPayment,
      stageLabel,
      applicantBannerStatus,
      currentStatus: applicantBannerStatus,
      statusText,
      workflowFlags,
      amountPaid: roundCurrency(applicantPaid),
      paidAmount: roundCurrency(applicantPaid),
      payment: {
        total: totalApplicantPayment,
        totalEur: totalApplicantPayment,
        totalInr,
        paid: paidInr,
        paidInr,
        pending: pendingInr,
        pendingInr,
        exchangeRate: roundCurrency(eurToInrRate),
        currency: "INR",
        sourceCurrency: "EUR"
      }
    },
    exchangeRate: roundCurrency(eurToInrRate)
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
  const companyDoc = applicant.companyId ? await db.collection("companies").doc(applicant.companyId).get() : null;
  const documentConfigs = companyDoc?.exists ? normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded) : [];

  return {
    applicant: {
      id: applicantId,
      stage: Number(applicant.stage || 1),
      approvalStatus: applicant.approvalStatus || "",
      companyId: applicant.companyId || "",
      countryId: applicant.countryId || "",
      agencyId: applicant.agencyId || ""
    },
    documentConfigs
  };
}

module.exports = {
  getApplicantByIdUseCase,
  getApplicantDocumentsContextUseCase,
  getApplicantWorkflowBundleUseCase
};

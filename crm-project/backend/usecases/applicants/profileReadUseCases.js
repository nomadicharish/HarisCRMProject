const { db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { normalizeCompanyDocuments } = require("../../utils/normalizers");
const { syncApplicantDocumentStage } = require("../../services/applicantWorkflowStageService");
const {
  getApplicantBannerStatusText,
  getApplicantStageLabel,
  getTodayEurToInrRate,
  normalizeDate,
  normalizePaymentMode,
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

  return {
    id: doc.id,
    ...applicantData,
    companyName,
    companyDocuments,
    agencyName,
    countryName,
    totalApplicantPayment,
    totalAmount: totalApplicantPayment,
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

  const [companyDoc, countryDoc, agencyDoc, paymentsSnap, documentsSnap] = await Promise.all([
    applicantData.companyId ? db.collection("companies").doc(applicantData.companyId).get() : Promise.resolve(null),
    applicantData.countryId ? db.collection("countries").doc(applicantData.countryId).get() : Promise.resolve(null),
    applicantData.agencyId ? db.collection("agencies").doc(applicantData.agencyId).get() : Promise.resolve(null),
    applicantRef.collection("payments").get(),
    applicantRef.collection("documents").get()
  ]);

  const companyName = companyDoc?.exists ? companyDoc.data()?.name || "" : "";
  const companyDocuments = companyDoc?.exists ? normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded) : [];
  const countryName = countryDoc?.exists ? countryDoc.data()?.name || "" : "";
  const agencyName = agencyDoc?.exists ? agencyDoc.data()?.name || "" : "";

  let applicantPaid = 0;
  let employerPaid = 0;
  const history = [];
  paymentsSnap.forEach((docSnap) => {
    const payment = docSnap.data() || {};
    const normalizedAmount = roundCurrency(payment.amount);
    const normalizedPaymentMode = normalizePaymentMode(payment.paymentMode);

    if (payment.type === "APPLICANT") applicantPaid += normalizedAmount;
    if (payment.type === "EMPLOYER") employerPaid += normalizedAmount;

    history.push({
      id: docSnap.id,
      ...payment,
      amount: normalizedAmount,
      paymentMode: normalizedPaymentMode || payment.paymentMode || "",
      paidDate: normalizeDate(payment.paidDate || payment.createdAt),
      createdAt: normalizeDate(payment.createdAt)
    });
  });

  const storedPaidAmount = roundCurrency(applicantData.amountPaid ?? applicantData.paidAmount ?? 0);
  if (storedPaidAmount > applicantPaid) {
    const legacyBalance = roundCurrency(storedPaidAmount - applicantPaid);
    if (legacyBalance > 0) {
      history.push({
        id: "legacy-initial-payment",
        type: "APPLICANT",
        amount: legacyBalance,
        currency: "INR",
        paymentMode: "",
        note: history.some((payment) => payment.type === "APPLICANT")
          ? "Mapped from applicant profile"
          : "Initial payment",
        paidBy: applicantData.createdBy || "",
        paidTo: "SUPER_USER",
        paidDate: normalizeDate(applicantData.createdAt || applicantData.updatedAt || new Date()),
        createdAt: normalizeDate(applicantData.createdAt || applicantData.updatedAt || new Date()),
        isLegacyMapped: true
      });
      applicantPaid = roundCurrency(applicantPaid + legacyBalance);
    }
  }

  history.sort((a, b) => (b.paidDate || 0) - (a.paidDate || 0));
  const applicantInstallments = history.filter((payment) => payment.type === "APPLICANT");

  const eurToInrRate = await getTodayEurToInrRate();
  const totalApplicantPayment = await resolveApplicantTotalEur(applicantData);
  const totalInr = roundCurrency(totalApplicantPayment * eurToInrRate);
  const pendingInr = Math.max(0, roundCurrency(totalInr - applicantPaid));

  const documents = {};
  await Promise.all(
    documentsSnap.docs.map(async (docSnap) => {
      const versionsSnap = await docSnap.ref.collection("versions").orderBy("uploadedAt", "desc").limit(1).get();
      documents[docSnap.id] = versionsSnap.docs.map((versionDoc) => ({
        id: versionDoc.id,
        ...versionDoc.data()
      }));
    })
  );

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
  const statusText = getApplicantBannerStatusText(applicantData, {
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

  return {
    applicant: {
      id: applicantId,
      ...applicantData,
      companyName,
      companyDocuments,
      agencyName,
      countryName,
      totalApplicantPayment,
      totalAmount: totalApplicantPayment,
      stageLabel,
      statusText,
      amountPaid: roundCurrency(applicantPaid),
      paidAmount: roundCurrency(applicantPaid),
      payment: {
        total: totalApplicantPayment,
        paid: roundCurrency(applicantPaid),
        pending: Math.max(0, totalApplicantPayment - roundCurrency(applicantPaid))
      }
    },
    documents,
    paymentSummary: {
      applicant: {
        total: totalApplicantPayment,
        totalEur: totalApplicantPayment,
        totalInr,
        paid: roundCurrency(applicantPaid),
        paidInr: roundCurrency(applicantPaid),
        pending: pendingInr,
        pendingInr,
        exchangeRate: roundCurrency(eurToInrRate),
        currency: "INR",
        sourceCurrency: "EUR",
        installmentCount: applicantInstallments.length,
        remainingInstallments: Math.max(0, 4 - applicantInstallments.length),
        history: applicantInstallments
      },
      employer: {
        total: roundCurrency(applicantData.totalEmployerPayment || 0),
        paid: roundCurrency(employerPaid),
        pending: Math.max(0, roundCurrency((applicantData.totalEmployerPayment || 0) - employerPaid))
      },
      history
    },
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

module.exports = {
  getApplicantByIdUseCase,
  getApplicantWorkflowBundleUseCase
};


const { db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { normalizeCompanyJobPositions } = require("../utils/normalizers");

const SUPPORTED_PAYMENT_CURRENCIES = new Set(["INR", "EUR", "USD"]);

const APPLICANT_LIST_SELECT_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "personalDetails.firstName",
  "personalDetails.lastName",
  "personalDetails.email",
  "personalDetails.education",
  "education",
  "countryId",
  "companyId",
  "jobPositionId",
  "agencyId",
  "countryName",
  "companyName",
  "jobPositionName",
  "agencyName",
  "companyPaymentPerApplicant",
  "searchText",
  "workflowStatus",
  "approvalStatus",
  "applicantBannerStatus",
  "stage",
  "stageStatus",
  "createdAt",
  "updatedAt",
  "email",
  "totalApplicantPayment",
  "totalAmount",
  "totalEmployerPayment",
  "paymentSummary",
  "docSummary",
  "documentSummary",
  "approvalFlags",
  "documentDispatch",
  "dispatchSummary",
  "contract.status",
  "signedContract",
  "visaCollection",
  "embassyInterview",
  "embassyAppointment",
  "travelDetails",
  "biometricSlip",
  "interviewTicket",
  "interviewBiometric",
  "visaTravel",
  "residencePermit",
  "hasPendingAppointmentApproval"
];

function getAuthenticatedUserFromReq(req) {
  if (!req.user?.uid || !req.user?.role) {
    throw new AppError("Unauthorized", 401);
  }

  return {
    userId: req.user.uid,
    userRole: req.user.role
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function firstFinitePaymentNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resolveApplicantPaymentSnapshot(applicant = {}) {
  const summary = applicant?.paymentSummary?.applicant || {};
  const total = roundCurrency(firstFinitePaymentNumber(
    summary.total,
    applicant?.totalApplicantPayment,
    applicant?.totalAmount,
    applicant?.totalPayment
  ));
  const paid = roundCurrency(Math.max(
    firstFinitePaymentNumber(summary.paid),
    firstFinitePaymentNumber(applicant?.amountPaid),
    firstFinitePaymentNumber(applicant?.paidAmount)
  ));
  const pending = Math.max(0, roundCurrency(total - paid));
  const currency = resolveApplicantPaymentCurrency(applicant);

  return {
    total,
    totalEur: total,
    totalInr: total,
    paid,
    paidInr: paid,
    pending,
    pendingInr: pending,
    currency,
    sourceCurrency: currency,
    confirmedAmount: roundCurrency(summary.confirmedAmount ?? paid),
    awaitingJuniorAmount: roundCurrency(summary.awaitingJuniorAmount),
    awaitingSeniorAmount: roundCurrency(summary.awaitingSeniorAmount),
    hasPendingAcknowledgement: Boolean(summary.hasPendingAcknowledgement),
    hasPendingConfirmation: Boolean(summary.hasPendingConfirmation),
    paymentCompleted: Boolean(summary.paymentCompleted)
  };
}

function resolveApplicantPaymentStage(applicant = {}, paymentSnapshot = null) {
  const payment = paymentSnapshot || resolveApplicantPaymentSnapshot(applicant);
  const stage = Number(applicant?.stage || 1);
  const approved = String(applicant?.approvalStatus || "").toLowerCase() === "approved";
  let key = "";
  let label = "";
  let percentage = 0;

  if (stage >= 12) {
    key = "after_trc";
    label = "After TRC Added";
    percentage = 100;
  } else if (stage === 11) {
    key = "after_visa_collection";
    label = "After Visa Collection";
    percentage = 100;
  } else if (stage >= 9) {
    key = "after_embassy_interview";
    label = "After Embassy Interview";
    percentage = 60;
  } else if (stage >= 7) {
    key = "after_embassy_appointment";
    label = "After Embassy Appointment";
    percentage = 60;
  } else if (approved) {
    key = "after_approval";
    label = "After Approval";
    percentage = 20;
  }

  const targetAmount = roundCurrency(payment.total * (percentage / 100));
  const pending = Math.max(0, roundCurrency(targetAmount - payment.paid));
  return { key, label, percentage, targetAmount, pending };
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "object" && value._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeTextForSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePaymentMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bank transfer") return "Bank Transfer";
  if (normalized === "upi") return "UPI";
  if (normalized === "bh") return "BH";
  return "";
}

function normalizePaymentCurrency(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "EURO") return "EUR";
  return SUPPORTED_PAYMENT_CURRENCIES.has(normalized) ? normalized : "INR";
}

function parseBooleanQuery(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return fallback;
}

function parseProjectionFields(value) {
  const requested = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!requested.length) return null;
  return new Set(["id", ...requested]);
}

function projectApplicantFields(applicant, fieldSet) {
  if (!fieldSet || !applicant || typeof applicant !== "object") return applicant;
  return Object.fromEntries(Object.entries(applicant).filter(([key]) => fieldSet.has(key)));
}

function buildApplicantListDerivedFields(applicant = {}) {
  const firstName =
    applicant?.personalDetails?.firstName ||
    applicant?.firstName ||
    (applicant?.fullName ? String(applicant.fullName).split(" ")[0] : "") ||
    "";
  const lastName =
    applicant?.personalDetails?.lastName ||
    applicant?.lastName ||
    (applicant?.fullName ? String(applicant.fullName).split(" ").slice(1).join(" ") : "") ||
    "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const docSummary = applicant?.docSummary || applicant?.documentSummary || {};
  const approvalFlags = applicant?.approvalFlags || {};
  const hasPendingDocumentApproval = Number(docSummary.pendingCount || 0) > 0;
  const hasPendingPipelineApproval =
    Boolean(approvalFlags?.hasPendingPipelineApproval) ||
    String(applicant?.approvalStatus || "").toLowerCase() !== "approved" ||
    String(applicant?.contract?.status || "").toUpperCase() === "PENDING" ||
    String(applicant?.visaCollection?.status || "").toUpperCase() === "PENDING" ||
    Boolean(applicant?.hasPendingAppointmentApproval);
  const hasPendingEmbassyInterviewApproval =
    Boolean(approvalFlags?.hasPendingEmbassyInterviewApproval) ||
    String(applicant?.embassyInterview?.status || "").toUpperCase() === "PENDING" ||
    (Boolean(applicant?.embassyInterview?.dateTime) && !Boolean(applicant?.embassyInterview?.approved));
  const attentionRequired = Boolean(
    hasPendingDocumentApproval ||
    hasPendingPipelineApproval ||
    hasPendingEmbassyInterviewApproval
  );
  const workflowStatus =
    Number(applicant?.stage || 1) >= 13
      ? "completed"
      : attentionRequired
      ? "attention_required"
      : "in_progress";

  return {
    firstName,
    lastName,
    fullName,
    attentionRequired,
    workflowStatus,
    searchText: normalizeTextForSearch([
      fullName,
      applicant?.email || applicant?.personalDetails?.email || "",
      applicant?.companyName || "",
      applicant?.jobPositionName || "",
      applicant?.countryName || "",
      applicant?.agencyName || ""
    ].filter(Boolean).join(" "))
  };
}

async function resolveApplicantTotalEur(applicant = {}) {
  const directTotal = roundCurrency(
    applicant?.totalApplicantPayment ?? applicant?.totalAmount ?? applicant?.totalPayment ?? 0
  );
  return directTotal;
}

async function resolveApplicantTotalAmount(applicant = {}) {
  return resolveApplicantTotalEur(applicant);
}

function resolveApplicantPaymentCurrency(applicant = {}) {
  return normalizePaymentCurrency(
    applicant?.paymentCurrency ||
      applicant?.currency ||
      applicant?.payment?.currency ||
      applicant?.paymentSummary?.applicant?.currency ||
      applicant?.paymentsSummary?.applicant?.currency
  );
}

async function resolveApplicantReferenceFields(applicant = {}) {
  const [companyDoc, countryDoc, agencyDoc] = await Promise.all([
    applicant.companyId ? db.collection("companies").doc(applicant.companyId).get() : Promise.resolve(null),
    applicant.countryId ? db.collection("countries").doc(applicant.countryId).get() : Promise.resolve(null),
    applicant.agencyId ? db.collection("agencies").doc(applicant.agencyId).get() : Promise.resolve(null)
  ]);

  const companyData = companyDoc?.exists ? companyDoc.data() || {} : {};
  const jobPositions = normalizeCompanyJobPositions(companyData?.jobPositions, companyData?.documentsNeeded);
  const jobPositionId = String(applicant?.jobPositionId || "").trim();
  const matchedJobPosition = jobPositions.find((position) => position.id === jobPositionId);

  return {
    companyName: companyDoc?.exists ? companyDoc.data()?.name || "" : "",
    jobPositionName: matchedJobPosition?.title || applicant?.jobPositionName || "",
    countryName: countryDoc?.exists ? countryDoc.data()?.name || "" : "",
    agencyName: agencyDoc?.exists ? agencyDoc.data()?.name || "" : "",
    companyPaymentPerApplicant: companyDoc?.exists
      ? roundCurrency(companyDoc.data()?.companyPaymentPerApplicant ?? 0)
      : 0
  };
}

function getApplicantStageLabel(stage, approvalStatus) {
  const normalizedStage = Number(stage || 1);
  if (normalizedStage === 1 && approvalStatus !== "approved") return "Candidate created. Pending for Admin approval";
  if (normalizedStage <= 1) return "Candidate Created";
  if (normalizedStage === 2) return "Upload Documents";
  if (normalizedStage === 3) return "Dispatch Documents";
  if (normalizedStage === 4) return "Issue of the Contract";
  if (normalizedStage === 5) return "Upload Signed Contract";
  if (normalizedStage === 6) return "Embassy Appointment Initiated";
  if (normalizedStage === 7) return "Embassy Appointment Completed";
  if (normalizedStage === 8) return "Initiate Embassy Interview";
  if (normalizedStage === 9) return "Embassy Interview Completed";
  if (normalizedStage === 10) return "Visa Collection Initiated";
  if (normalizedStage === 11) return "Visa Collection Completed";
  if (normalizedStage === 12) return "Applicant Arrival Details";
  return "Candidate Arrived and Process Completed";
}

function getApplicantBannerStatusText(applicant, context = {}) {
  const applicantStage = Number(applicant?.stage || 1);
  const approvalStatus = String(applicant?.approvalStatus || "").toLowerCase();
  const {
    hasCompletedDocumentStage = false,
    pendingRequired = false,
    rejectedRequired = false,
    uploadedRequired = false,
    hasDocuments = false,
    hasTravelDetails = false,
    hasBiometricSlip = false,
    hasInterviewTicket = false,
    hasInterviewBiometric = false,
    hasVisaTravel = false,
    hasResidencePermit = false,
    hasPendingEmbassyAppointmentApproval = false,
    hasPendingEmbassyInterviewApproval = false,
    hasPendingVisaCollectionApproval = false,
    hasEmbassyAppointment = false,
    hasRejectedSignedContractDocuments = false
  } = context;

  const isPendingSuperUserApproval = applicantStage === 1 && approvalStatus === "pending";
  const signedContractRejected =
    hasRejectedSignedContractDocuments || String(applicant?.signedContract?.status || "").toUpperCase() === "REJECTED";
  if (isPendingSuperUserApproval) return "Candidate created. Pending for Admin approval";
  if (applicantStage === 1 && approvalStatus === "approved") return "Document upload pending";
  if (applicantStage === 1) return "Complete the candidate profile for approval";
  if (applicantStage >= 6 && signedContractRejected) return "Super user rejected few document.";
  if (applicantStage >= 13) return "Candidate Arrived and Process Completed";
  if (applicantStage === 12) return hasVisaTravel ? "Candidate arrival pending" : "Applicant arrival details pending";
  if (applicantStage === 11) return "Complete visa collection details";
  if (applicantStage === 10) {
    const hasVisaCollection = Boolean(
      applicant?.visaCollection?.date ||
      applicant?.visaCollection?.time ||
      applicant?.visaCollection?.dateTime
    );
    if (!hasVisaCollection) return "Visa collection initiation pending.";
    if (hasPendingVisaCollectionApproval) return "Visa collection Initiated. Pending admin approval";
    return "Visa Collection Initiated.";
  }
  if (applicantStage === 9) {
    if (hasInterviewBiometric) return "Pending visa collection";
    if (hasInterviewTicket) return "Embassy Interview Initiated. Biometric slip upload pending.";
    return "Embassy Interview Initiated. Travel ticket upload pending.";
  }
  if (applicantStage === 8) {
    if (hasPendingEmbassyInterviewApproval) return "Embassy interview Initiated. Pending admin approval";
    return "Embassy Interview initiation pending";
  }
  if (applicantStage === 7) {
    if (hasBiometricSlip) return "Embassy Interview Initiation pending";
    if (hasTravelDetails) return "Embassy Appointment Initiated. Biometric slip upload pending.";
    return "Embassy Appointment Initiated. Travel ticket upload pending.";
  }
  if (applicantStage === 6) {
    if (hasPendingEmbassyAppointmentApproval) return "Embassy appointment Initiated. Pending admin approval";
    if (!hasEmbassyAppointment) return "Pending Embassy Appointment Initiation.";
    return "Pending embassy appointment.";
  }
  if (applicantStage === 5) return "Signed contract upload pending.";
  if (applicantStage === 4) {
    if (String(applicant?.contract?.status || "").toUpperCase() === "PENDING") {
      return "Contract issued. Pending admin approval.";
    }
    return "Issue of the contract pending.";
  }
  if (hasCompletedDocumentStage) return "Document dispatch pending";
  if (rejectedRequired) return "Admin rejected few documents. Re-upload pending.";
  if (pendingRequired) return "Documents pending admin approval";
  if (hasDocuments || uploadedRequired) return "Document upload pending";
  if (applicantStage === 2) return "Document upload pending";
  return "Document upload pending";
}

module.exports = {
  APPLICANT_LIST_SELECT_FIELDS,
  getApplicantBannerStatusText,
  getApplicantStageLabel,
  getAuthenticatedUserFromReq,
  normalizeDate,
  normalizePaymentCurrency,
  normalizePaymentMode,
  normalizeTextForSearch,
  parseBooleanQuery,
  parseProjectionFields,
  buildApplicantListDerivedFields,
  projectApplicantFields,
  resolveApplicantReferenceFields,
  resolveApplicantPaymentSnapshot,
  resolveApplicantPaymentStage,
  resolveApplicantPaymentCurrency,
  resolveApplicantTotalAmount,
  resolveApplicantTotalEur,
  roundCurrency,
  toNumber
};

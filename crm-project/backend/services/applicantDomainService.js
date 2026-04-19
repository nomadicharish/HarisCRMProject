const { db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { AppError } = require("../lib/AppError");

const DEFAULT_EUR_TO_INR_RATE = 90;
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let fxRateCache = {
  value: DEFAULT_EUR_TO_INR_RATE,
  fetchedAt: 0
};

const APPLICANT_LIST_SELECT_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "personalDetails.firstName",
  "personalDetails.lastName",
  "countryId",
  "companyId",
  "agencyId",
  "approvalStatus",
  "stage",
  "stageStatus",
  "createdAt",
  "updatedAt",
  "totalApplicantPayment",
  "totalAmount",
  "totalEmployerPayment",
  "paymentSummary",
  "docSummary",
  "documentSummary",
  "approvalFlags",
  "contract.status",
  "visaCollection.status",
  "embassyInterview.status",
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
  if (normalized === "check" || normalized === "cheque") return "Check";
  if (normalized === "bank transfer") return "Bank Transfer";
  if (normalized === "upi") return "UPI";
  if (normalized === "cash") return "Cash";
  return "";
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

async function resolveApplicantTotalEur(applicant = {}) {
  const directTotal = roundCurrency(
    applicant?.totalApplicantPayment ?? applicant?.totalAmount ?? applicant?.totalPayment ?? 0
  );
  if (directTotal > 0) return directTotal;

  const companyId = applicant?.companyId;
  if (!companyId) return 0;

  try {
    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) return 0;
    return roundCurrency(companyDoc.data()?.companyPaymentPerApplicant ?? 0);
  } catch {
    return 0;
  }
}

function getApplicantStageLabel(stage, approvalStatus) {
  const normalizedStage = Number(stage || 1);
  if (normalizedStage === 1 && approvalStatus !== "approved") return "Candidate pending for approval";
  if (normalizedStage <= 1) return "Candidate Created";
  if (normalizedStage === 2) return "Upload Documents";
  if (normalizedStage === 3) return "Dispatch Documents";
  if (normalizedStage === 4) return "Issue of the Contract";
  if (normalizedStage === 5) return "Embassy Appointment Initiated";
  if (normalizedStage === 6) return "Embassy Appointment Completed";
  if (normalizedStage === 7) return "Initiate Embassy Interview";
  if (normalizedStage === 8) return "Embassy Interview Completed";
  if (normalizedStage === 9) return "Visa Collection Initiated";
  if (normalizedStage === 10) return "Visa Collection Completed";
  if (normalizedStage === 11) return "Arrival of Candidate";
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
    hasPendingEmbassyInterviewApproval = false,
    hasPendingVisaCollectionApproval = false,
    hasEmbassyAppointment = false
  } = context;

  const isPendingSuperUserApproval = applicantStage === 1 && approvalStatus === "pending";
  if (isPendingSuperUserApproval) return "Candidate pending for approval";
  if (applicantStage === 1 && approvalStatus === "approved") return "Document upload pending";
  if (applicantStage === 1) return "Complete the candidate profile for approval";
  if (applicantStage >= 12) return "Candidate Arrived and Process Completed";
  if (applicantStage === 11) return "Candidate arrival pending";
  if (applicantStage === 10) {
    return hasVisaTravel ? "Pending Residence Permit upload" : "Visa Collection Initiated. Travel Ticket upload pending.";
  }
  if (applicantStage === 9) {
    if (hasPendingVisaCollectionApproval) return "Visa collection Initiated. Pending admin approval";
    return "Visa Collection Initiated. Travel Ticket upload pending.";
  }
  if (applicantStage === 8) {
    if (hasInterviewBiometric) return "Pending visa collection";
    if (hasInterviewTicket) return "Embassy Interview Initiated. Biometric slip upload pending.";
    return "Embassy Interview Initiated. Travel ticket upload pending.";
  }
  if (applicantStage === 7) {
    if (hasPendingEmbassyInterviewApproval) return "Embassy interview Initiated. Pending admin approval";
    return "Embassy Interview initiation pending";
  }
  if (applicantStage === 6) {
    if (hasBiometricSlip) return "Embassy Interview Initiation pending";
    if (hasTravelDetails) return "Embassy Appointment Initiated. Biometric slip upload pending.";
    return "Embassy Appointment Initiated. Travel ticket upload pending.";
  }
  if (applicantStage >= 5) {
    if (!hasEmbassyAppointment) return "Pending Embassy Appointment Initiation.";
    return "Pending embassy appointment.";
  }
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

async function getTodayEurToInrRate() {
  try {
    const now = Date.now();
    if (fxRateCache.fetchedAt && now - fxRateCache.fetchedAt < FX_CACHE_TTL_MS) {
      return fxRateCache.value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch("https://api.frankfurter.app/latest?from=EUR&to=INR", {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Exchange rate request failed with status ${response.status}`);
    }

    const data = await response.json();
    const rate = toNumber(data?.rates?.INR);
    const resolvedRate = rate > 0 ? rate : DEFAULT_EUR_TO_INR_RATE;
    fxRateCache = {
      value: resolvedRate,
      fetchedAt: now
    };
    return resolvedRate;
  } catch (error) {
    logger.warn("Exchange rate fetch error", {
      message: error?.message || String(error || "")
    });
    if (fxRateCache.fetchedAt) return fxRateCache.value;
    return DEFAULT_EUR_TO_INR_RATE;
  }
}

module.exports = {
  APPLICANT_LIST_SELECT_FIELDS,
  getApplicantBannerStatusText,
  getApplicantStageLabel,
  getAuthenticatedUserFromReq,
  getTodayEurToInrRate,
  normalizeDate,
  normalizePaymentMode,
  normalizeTextForSearch,
  parseBooleanQuery,
  parseProjectionFields,
  projectApplicantFields,
  resolveApplicantTotalEur,
  roundCurrency,
  toNumber
};

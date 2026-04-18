const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { AppError } = require("../lib/AppError");
const { refreshApplicantSummaries } = require("../services/applicantSummaryService");

const DEFAULT_EUR_TO_INR_RATE = 90;
const FX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
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

function handleApplicantError(res, context, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  logger.error(context, {
    message: error?.message,
    stack: error?.stack
  });

  return res.status(500).json({ message: "Internal Server Error" });
}

function getAuthenticatedUser(req) {
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

function normalizeTextForSearch(value) {
  return String(value || "").trim().toLowerCase();
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

  return Object.fromEntries(
    Object.entries(applicant).filter(([key]) => fieldSet.has(key))
  );
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

function roundCurrency(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
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

function normalizePaymentMode(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "check" || normalized === "cheque") return "Check";
  if (normalized === "bank transfer") return "Bank Transfer";
  if (normalized === "upi") return "UPI";
  if (normalized === "cash") return "Cash";

  return "";
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
  if (applicantStage === 10) return hasVisaTravel ? "Pending Residence Permit upload" : "Visa collection initiation pending.";
  if (applicantStage === 9) {
    if (hasPendingVisaCollectionApproval) return "Visa collection initiated. Admin approval pending.";
    return "Visa collection initiation pending.";
  }
  if (applicantStage === 8) {
    if (hasInterviewBiometric) return "Pending visa collection";
    if (hasInterviewTicket) return "Embassy Interview Initiated. Biometric slip upload pending.";
    return "Embassy Interview Initiated. Travel ticket upload pending.";
  }
  if (applicantStage === 7) {
    if (hasPendingEmbassyInterviewApproval) return "Embassy Interview pending admin approval";
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

// ===============================
// CREATE APPLICANT
// ===============================



const createApplicant = async (req, res) => {
  const { userRole, userId } = getAuthenticatedUser(req);

  let assignedAgencyId = null;

  if (userRole === "AGENCY") {
    assignedAgencyId = req.user?.agencyId || userId;
  } else if (userRole === "SUPER_USER") {
    assignedAgencyId = req.body.agencyId || null;
  } else {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (!assignedAgencyId) {
    return res.status(400).json({ message: "Agency must be assigned" });
  }
  try {
    const personalDetails = req.body.personalDetails || {};

    const {
      firstName = personalDetails.firstName,
      lastName = personalDetails.lastName,
      dob = personalDetails.dob,
      age = personalDetails.age,
      address = personalDetails.address,
      phone = personalDetails.phone,
      maritalStatus = personalDetails.maritalStatus,
      countryId,
      companyId,
      totalAmount,
      amountPaid,
      currency,
      totalApplicantPayment,
      totalEmployerPayment
    } = req.body;

    const toNumber = (value) => {
      if (value === null || value === undefined || value === "") return 0;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const companySnap = await db.collection("companies").doc(companyId).get();
    const companyPaymentPerApplicant = companySnap.exists
      ? toNumber(companySnap.data()?.companyPaymentPerApplicant)
      : 0;

    const requestedTotal = toNumber(totalApplicantPayment ?? totalAmount);
    const normalizedTotalApplicantPayment =
      requestedTotal > 0 ? requestedTotal : companyPaymentPerApplicant;
    const normalizedTotalEmployerPayment = toNumber(
      totalEmployerPayment ?? companyPaymentPerApplicant
    );
    const normalizedAmountPaid = toNumber(amountPaid);

    const approvalStatus =
      userRole === "AGENCY" ? "pending" : "approved";

    const applicant = {
      personalDetails: {
        firstName,
        lastName,
        dob,
        age,
        address,
        phone,
        maritalStatus
      },
      firstName,
      lastName,
      age,
      countryId,
      companyId,
      agencyId: assignedAgencyId,
      createdBy: userId,
      approvalStatus,
      stage: 1,
      stageStatus: "ongoing",
      totalApplicantPayment: normalizedTotalApplicantPayment,
      totalEmployerPayment: normalizedTotalEmployerPayment,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Create applicant
    const docRef = await db.collection("applicants").add(applicant);
    const applicantId = docRef.id;

    if (normalizedAmountPaid > 0) {
      const initialPayment = {
        type: "APPLICANT",
        amount: normalizedAmountPaid,
        currency: currency || "INR",
        note: "Initial payment",
        paidBy: userRole,
        paidTo: "SUPER_USER",
        paidDate: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db
        .collection("applicants")
        .doc(applicantId)
        .collection("payments")
        .add(initialPayment);
    }

    await refreshApplicantSummaries(applicantId, {
      ...applicant,
      amountPaid: normalizedAmountPaid
    });

    return res.status(201).json({
      message: "Applicant created successfully",
      applicantId
    });

  } catch (error) {
    logger.error("Create Applicant Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};


// ===============================
// UPLOAD DOCUMENT (BY TYPE)
// ===============================

const uploadDocumentByType = async (req, res) => {
  try {
    const { applicantId, docType } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { userRole, userId } = getAuthenticatedUser(req);

    // Firebase Storage
    const bucket = admin.storage().bucket();

    const fileName = `${docType}-${Date.now()}`;
    const filePath = `applicants/${applicantId}/documents/${fileName}`;

    const fileUpload = bucket.file(filePath);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype
      }
    });

    const [fileUrl] = await fileUpload.getSignedUrl({
      action: "read",
      expires: "03-01-2035"
    });

    // Update Firestore document
    const docRef = db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType);

    await docRef.update({
        uploaded: true,
        fileUrl,
        uploadedBy: userId,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),

        // Clear defer automatically
        deferred: false,
        deferredAt: null,
        deferredBy: null,
        deferReason: null
      });

    await refreshApplicantSummaries(applicantId);

    return res.json({
      message: "Document uploaded successfully",
      fileUrl
    });

  } catch (error) {
    logger.error("Upload Document Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

// ===============================
// MARK DOCUMENT SEEN
// ===============================

const markDocumentSeen = async (req, res) => {
  try {
    const { applicantId, docType } = req.params;

    const { userRole, userId } = getAuthenticatedUser(req);

    if (!["AGENCY", "EMPLOYER"].includes(userRole)) {
      return res.status(403).json({ message: "Invalid role" });
    }

    const docRef = db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType);

    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: "Document not found" });
    }

    const roleKey = userRole.toLowerCase(); // agency / employer

    await docRef.update({
      [`seenBy.${roleKey}`]: admin.firestore.FieldValue.arrayUnion(userId)
    });

    return res.json({ message: "Document marked as seen" });

  } catch (error) {
    logger.error("Mark Seen Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

// ===============================
// DEFER DOCUMENT
// ===============================

const deferDocument = async (req, res) => {
  try {
    const { applicantId, docType } = req.params;
    const { reason } = req.body;

    const { userRole, userId } = getAuthenticatedUser(req);

    // Only Agency can defer
    if (userRole !== "AGENCY") {
      return res.status(403).json({ message: "Only Agency can defer documents" });
    }

    const docRef = db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType);

    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: "Document not found" });
    }

    await docRef.update({
      deferred: true,
      deferredAt: admin.firestore.FieldValue.serverTimestamp(),
      deferredBy: userId,
      deferReason: reason || "Deferred by agency"
    });

    await refreshApplicantSummaries(applicantId);

    return res.json({ message: "Document marked as deferred" });

  } catch (error) {
    logger.error("Defer Document Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};


// ===============================
// ADD PAYMENT
// ===============================
const addPayment = async (req, res) => {
  try {
    const { applicantId } = req.params;
    const { type, amount, currency, note, paidDate, paymentMode } = req.body;

    const { userRole, userId } = getAuthenticatedUser(req);

    if (!["APPLICANT", "EMPLOYER"].includes(type)) {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    const normalizedAmount = roundCurrency(amount);
    if (normalizedAmount <= 0) {
      return res.status(400).json({ message: "Paid amount must be greater than 0" });
    }

    const normalizedPaymentMode = normalizePaymentMode(paymentMode);
    if (!normalizedPaymentMode) {
      return res.status(400).json({ message: "Invalid payment mode" });
    }

    // Role rules
    if (
      (type === "APPLICANT" && !["AGENCY", "SUPER_USER"].includes(userRole)) ||
      (type === "EMPLOYER" && !["SUPER_USER", "ACCOUNTANT"].includes(userRole))
    ) {
      return res.status(403).json({ message: "Not allowed to add this payment" });
    }

     // Check installment limit (only for applicant payments)
      if (type === "APPLICANT") {
        const paymentsSnap = await db
          .collection("applicants")
          .doc(applicantId)
          .collection("payments")
          .where("type", "==", "APPLICANT")
          .get();

        if (paymentsSnap.size >= 4) {
          return res.status(400).json({
            message: "Maximum 4 installments allowed"
          });
        }
      }

    const parsedPaidDate = paidDate ? new Date(paidDate) : new Date();
    if (Number.isNaN(parsedPaidDate.getTime())) {
      return res.status(400).json({ message: "Invalid paid date" });
    }

    const payment = {
      type,
      amount: normalizedAmount,
      currency: type === "APPLICANT" ? "INR" : currency || "INR",
      paymentMode: normalizedPaymentMode,
      note: note || "",
      paidBy: userRole,
      paidTo: type === "APPLICANT" ? "SUPER_USER" : "EMPLOYER",
      paidDate: parsedPaidDate,
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db
      .collection("applicants")
      .doc(applicantId)
      .collection("payments")
      .add(payment);

    await refreshApplicantSummaries(applicantId);

    return res.json({ message: "Payment added successfully" });

  } catch (error) {
    logger.error("Add Payment Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

// ===============================
// GET PAYMENT SUMMARY
// ===============================

const getPaymentSummary = async (req, res) => {
  try {
    const { applicantId } = req.params;

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const applicant = applicantSnap.data();

    const paymentsSnap = await applicantRef.collection("payments").get();

    let applicantPaid = 0;
    let employerPaid = 0;
    const history = [];

    paymentsSnap.forEach((doc) => {
      const p = doc.data() || {};
      const normalizedAmount = roundCurrency(p.amount);
      const normalizedPaymentMode = normalizePaymentMode(p.paymentMode);

      if (p.type === "APPLICANT") applicantPaid += normalizedAmount;
      if (p.type === "EMPLOYER") employerPaid += normalizedAmount;

      history.push({
        id: doc.id,
        ...p,
        amount: normalizedAmount,
        paymentMode: normalizedPaymentMode || p.paymentMode || "",
        paidDate: normalizeDate(p.paidDate || p.createdAt),
        createdAt: normalizeDate(p.createdAt)
      });
    });

    const storedPaidAmount = roundCurrency(applicant.amountPaid ?? applicant.paidAmount ?? 0);
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
          paidBy: applicant.createdBy || "",
          paidTo: "SUPER_USER",
          paidDate: normalizeDate(applicant.createdAt || applicant.updatedAt || new Date()),
          createdAt: normalizeDate(applicant.createdAt || applicant.updatedAt || new Date()),
          isLegacyMapped: true
        });

        applicantPaid = roundCurrency(applicantPaid + legacyBalance);
      }
    }

    history.sort((a, b) => (b.paidDate || 0) - (a.paidDate || 0));

    const eurToInrRate = await getTodayEurToInrRate();
    const applicantTotalEur = await resolveApplicantTotalEur(applicant);
    const applicantTotalInr = roundCurrency(applicantTotalEur * eurToInrRate);
    const applicantPendingInr = Math.max(0, roundCurrency(applicantTotalInr - applicantPaid));
    const applicantInstallments = history.filter((payment) => payment.type === "APPLICANT");

    return res.json({
      applicant: {
        total: applicantTotalEur,
        totalEur: applicantTotalEur,
        totalInr: applicantTotalInr,
        paid: roundCurrency(applicantPaid),
        paidInr: roundCurrency(applicantPaid),
        pending: applicantPendingInr,
        pendingInr: applicantPendingInr,
        exchangeRate: roundCurrency(eurToInrRate),
        currency: "INR",
        sourceCurrency: "EUR",
        installmentCount: applicantInstallments.length,
        remainingInstallments: Math.max(0, 4 - applicantInstallments.length),
        history: applicantInstallments
      },
      employer: {
        total: roundCurrency(applicant.totalEmployerPayment || 0),
        paid: roundCurrency(employerPaid),
        pending: Math.max(0, roundCurrency((applicant.totalEmployerPayment || 0) - employerPaid))
      },
      history
    });

  } catch (error) {
    logger.error("Payment Summary Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

// ===============================
// GET APPLICANTS (LIST)
// ===============================
const getApplicants = async (req, res) => {
  try {
    const { userRole } = getAuthenticatedUser(req);
    const userId = req.user?.uid || null;
    const agencyId = req.user?.agencyId || null;
    const liteMode = parseBooleanQuery(req.query?.lite, false);
    const paginated = parseBooleanQuery(req.query?.paginated, true);
    const page = Number(req.query?.page || 1);
    const limit = Number(req.query?.limit || 25);
    const searchQuery = String(req.query?.q || "").trim().toLowerCase();
    const requestedFieldSet = parseProjectionFields(req.query?.fields);

    const parseList = (value) =>
      String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const countryFilters = parseList(req.query?.country);
    const companyFilters = parseList(req.query?.company);
    const agencyFilters = parseList(req.query?.agency);
    const typeFilters = parseList(req.query?.type);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let docs = [];
    let query = db.collection("applicants").select(...APPLICANT_LIST_SELECT_FIELDS);

    if (userRole === "AGENCY") {
      const primaryAgencyId = agencyId || userId;
      const primarySnap = await query.where("agencyId", "==", primaryAgencyId).get();

      if (agencyId && agencyId !== userId) {
        const legacySnap = await query.where("agencyId", "==", userId).get();
        const byId = new Map();
        primarySnap.docs.forEach((d) => byId.set(d.id, d));
        legacySnap.docs.forEach((d) => byId.set(d.id, d));
        docs = Array.from(byId.values());
      } else {
        docs = primarySnap.docs;
      }
    } else if (userRole === "EMPLOYER") {
      const userDoc = await db.collection("users").doc(userId).get();
      const employerId = userDoc.exists ? userDoc.data()?.employerId : null;

      if (!employerId) {
        return res.status(400).json({ message: "Employer profile not linked" });
      }

      const employerDoc = await db.collection("employers").doc(employerId).get();
      const companyId = employerDoc.exists ? employerDoc.data()?.companyId : null;

      if (!companyId) {
        return res.status(400).json({ message: "Employer company not linked" });
      }

      query = query.where("companyId", "==", companyId);
      docs = (await query.get()).docs;
    } else if (!["SUPER_USER", "ACCOUNTANT"].includes(userRole)) {
      return res.status(403).json({ message: "Unauthorized" });
    } else {
      docs = (await query.get()).docs;
    }

    const companyIds = new Set();
    const countryIds = new Set();
    const agencyIds = new Set();
    docs.forEach((d) => {
      const data = d.data();
      if (data?.companyId) companyIds.add(data.companyId);
      if (data?.countryId) countryIds.add(data.countryId);
      if (data?.agencyId) agencyIds.add(data.agencyId);
    });

    const companyIdToPayment = {};
    const companyIdToName = {};
    const countryIdToName = {};
    const agencyIdToName = {};

    const companyRefs = Array.from(companyIds).map((id) => db.collection("companies").doc(id));
    const countryRefs = Array.from(countryIds).map((id) => db.collection("countries").doc(id));
    const agencyRefs = Array.from(agencyIds).map((id) => db.collection("agencies").doc(id));

    const [companyDocs, countryDocs, agencyDocs] = await Promise.all([
      companyRefs.length ? db.getAll(...companyRefs) : Promise.resolve([]),
      countryRefs.length ? db.getAll(...countryRefs) : Promise.resolve([]),
      agencyRefs.length ? db.getAll(...agencyRefs) : Promise.resolve([])
    ]);

    companyDocs.forEach((doc) => {
      companyIdToName[doc.id] = doc.exists ? doc.data()?.name || "" : "";
      companyIdToPayment[doc.id] = doc.exists
        ? roundCurrency(doc.data()?.companyPaymentPerApplicant ?? 0)
        : 0;
    });
    countryDocs.forEach((doc) => {
      countryIdToName[doc.id] = doc.exists ? doc.data()?.name || "" : "";
    });
    agencyDocs.forEach((doc) => {
      agencyIdToName[doc.id] = doc.exists ? doc.data()?.name || "" : "";
    });

    const eurToInrRate = await getTodayEurToInrRate();

    let applicants = docs.map((d) => {
        const data = d.data();

        const firstName =
          data?.personalDetails?.firstName ||
          data?.firstName ||
          (data?.fullName ? data?.fullName.split(" ")[0] : "") ||
          "";
        const lastName =
          data?.personalDetails?.lastName ||
          data?.lastName ||
          (data?.fullName ? data?.fullName.split(" ").slice(1).join(" ") : "") ||
          "";

        const applicantPaid = roundCurrency(toNumber(data?.amountPaid ?? data?.paidAmount));

        const paymentSummary = data?.paymentSummary || {};
        const docSummary = data?.docSummary || data?.documentSummary || {};
        const approvalFlags = data?.approvalFlags || {};

        const storedTotalEur = roundCurrency(
          paymentSummary?.applicant?.total ??
          data?.totalApplicantPayment ??
          data?.totalAmount ??
          data?.totalPayment ??
          0
        );
        const totalEur = storedTotalEur > 0 ? storedTotalEur : roundCurrency(companyIdToPayment[data?.companyId] ?? 0);
        const paidInr = roundCurrency(paymentSummary?.applicant?.paid ?? applicantPaid);
        const totalInr = roundCurrency(totalEur * eurToInrRate);
        const pendingInr = Math.max(0, roundCurrency(totalInr - paidInr));

        const approvedRequired = Number(docSummary.approvedCount || 0) > 0 && Number(docSummary.pendingCount || 0) === 0;
        const rejectedRequired = Number(docSummary.rejectedCount || 0) > 0;
        const pendingRequired = Number(docSummary.pendingCount || 0) > 0;
        const uploadedRequired = Number(docSummary.totalCount || 0) > 0;
        const hasPendingDocumentApproval = pendingRequired;
        const hasRejectedDocument = rejectedRequired;
        const hasDocuments = uploadedRequired;

        const hasPendingAppointmentApproval =
          Boolean(approvalFlags?.hasPendingAppointmentApproval) || Boolean(data?.hasPendingAppointmentApproval);
        const hasPendingPipelineApproval =
          Boolean(approvalFlags?.hasPendingPipelineApproval) ||
          String(data?.approvalStatus || "").toLowerCase() !== "approved" ||
          String(data?.contract?.status || "").toUpperCase() === "PENDING" ||
          String(data?.visaCollection?.status || "").toUpperCase() === "PENDING" ||
          hasPendingAppointmentApproval;
        const hasPendingEmbassyInterviewApproval =
          Boolean(approvalFlags?.hasPendingEmbassyInterviewApproval) ||
          String(data?.embassyInterview?.status || "").toUpperCase() === "PENDING";

        const attentionRequired =
          userRole === "SUPER_USER"
            ? hasPendingDocumentApproval || hasPendingPipelineApproval || hasPendingEmbassyInterviewApproval
            : userRole === "AGENCY"
            ? hasRejectedDocument
            : false;

        const hasTravelDetails = Boolean(
          data?.travelDetails?.travelDate || data?.travelDetails?.time || data?.travelDetails?.fileUrl
        );
        const hasEmbassyAppointment = Boolean(
          data?.embassyAppointment?.date || data?.embassyAppointment?.time || data?.embassyAppointment?.fileUrl
        );
        const hasPendingVisaCollectionApproval =
          String(data?.visaCollection?.status || "").toUpperCase() === "PENDING";
        const hasBiometricSlip = Boolean(data?.biometricSlip?.fileUrl);
        const hasInterviewTicket = Boolean(data?.interviewTicket?.date || data?.interviewTicket?.time || data?.interviewTicket?.fileUrl);
        const hasInterviewBiometric = Boolean(data?.interviewBiometric?.fileUrl);
        const hasVisaTravel = Boolean(data?.visaTravel?.date || data?.visaTravel?.time || data?.visaTravel?.fileUrl);
        const hasResidencePermit = Boolean(data?.residencePermit?.frontFileUrl || data?.residencePermit?.backFileUrl || data?.residencePermit?.fileUrl);
        const hasCompletedDocumentStage = Number(data?.stage || 1) >= 3 && approvedRequired;
        const stageLabel = getApplicantStageLabel(data?.stage, data?.approvalStatus);
        const statusText = getApplicantBannerStatusText(data, {
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
        const workflowStatus =
          Number(data?.stage || 1) >= 12
            ? "completed"
            : attentionRequired
            ? "attention_required"
            : "in_progress";

        const payment = {
          total: totalEur,
          totalEur,
          totalInr,
          paid: paidInr,
          paidInr,
          pending: pendingInr,
          pendingInr
        };

        if (liteMode) {
          return {
            id: d.id,
            firstName,
            lastName,
            fullName: [firstName, lastName].filter(Boolean).join(" ").trim(),
            stage: Number(data?.stage || 1),
            approvalStatus: data?.approvalStatus || "pending",
            companyId: data?.companyId || "",
            countryId: data?.countryId || "",
            agencyId: data?.agencyId || "",
            companyName: data?.companyId ? companyIdToName[data.companyId] : "",
            countryName: data?.countryId ? countryIdToName[data.countryId] : "",
            agencyName: data?.agencyId ? agencyIdToName[data.agencyId] : "",
            attentionRequired,
            workflowStatus,
            stageLabel,
            statusText,
            createdAt: data?.createdAt || null,
            updatedAt: data?.updatedAt || null,
            payment
          };
        }

        return {
          id: d.id,
          ...data,
          firstName,
          lastName,
          companyName: data?.companyId ? companyIdToName[data.companyId] : "",
          countryName: data?.countryId ? countryIdToName[data.countryId] : "",
          agencyName: data?.agencyId ? agencyIdToName[data.agencyId] : "",
          attentionRequired,
          workflowStatus,
          stageLabel,
          statusText,
          exchangeRate: eurToInrRate,
          payment
        };
      });

    applicants = applicants.sort((a, b) => {
      const aDate = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const bDate = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return bDate - aDate;
    });

    if (searchQuery) {
      applicants = applicants.filter((applicant) =>
        normalizeTextForSearch(
          applicant.fullName ||
          `${applicant.firstName || ""} ${applicant.lastName || ""}` ||
          applicant.companyName ||
          ""
        ).includes(searchQuery)
      );
    }

    if (countryFilters.length) {
      applicants = applicants.filter((applicant) => countryFilters.includes(applicant.countryId || ""));
    }

    if (companyFilters.length) {
      applicants = applicants.filter((applicant) => companyFilters.includes(applicant.companyId || ""));
    }

    if (agencyFilters.length) {
      applicants = applicants.filter((applicant) => agencyFilters.includes(applicant.agencyId || ""));
    }

    if (typeFilters.length) {
      applicants = applicants.filter((applicant) => {
        return typeFilters.some((type) => {
          if (type === "attention_required") return Boolean(applicant.attentionRequired);
          return applicant.workflowStatus === type;
        });
      });
    }

    if (!paginated) {
      return res.json(requestedFieldSet ? applicants.map((item) => projectApplicantFields(item, requestedFieldSet)) : applicants);
    }

    const total = applicants.length;
    const safeLimit = Math.max(1, Math.min(100, limit));
    const safePage = Math.max(1, page);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const currentPage = Math.min(safePage, totalPages);
    const startIndex = (currentPage - 1) * safeLimit;
    const pagedItems = applicants.slice(startIndex, startIndex + safeLimit);
    const items = requestedFieldSet
      ? pagedItems.map((item) => projectApplicantFields(item, requestedFieldSet))
      : pagedItems;

    return res.json({
      items,
      pagination: {
        page: currentPage,
        limit: safeLimit,
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error("Get Applicants Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

// ===============================
// APPROVE APPLICANT
// ===============================
const approveApplicant = async (req, res) => {
  try {
    const { applicantId } = req.params;

    const { userRole } = getAuthenticatedUser(req);
    const userId = req.user?.uid || "testSuperUser";

    if (userRole !== "SUPER_USER") {
      return res.status(403).json({ message: "Only SUPER_USER can approve" });
    }

    const ref = db.collection("applicants").doc(applicantId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const data = snap.data();
    if (data.approvalStatus === "approved") {
      return res.status(400).json({ message: "Already approved" });
    }

    await ref.update({
      approvalStatus: "approved",
      approvedBy: userId,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await refreshApplicantSummaries(applicantId, {
      ...data,
      approvalStatus: "approved"
    });

    return res.json({ message: "Applicant approved successfully" });

  } catch (error) {
    logger.error("Approve Applicant Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

// ===============================
// ADD APPOINTMENT
// ===============================
const addAppointment = async (req, res) => {
  try {
    const { applicantId, type } = req.params;
    const { date, time } = req.body;

    const { userRole, userId } = getAuthenticatedUser(req);

    const allowedTypes = ["EMBASSY_APPOINTMENT", "EMBASSY_INTERVIEW", "VISA_COLLECTION", "BIOMETRIC", "INTERVIEW"];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid appointment type" });
    }

    // Role rules
    if (!["EMPLOYER", "SUPER_USER"].includes(userRole)) {
      return res.status(403).json({ message: "Not allowed to add appointment" });
    }

    // All appointments require approval,
// but auto-approve if added by Super User
const autoApprove = userRole === "SUPER_USER";
    const appointment = {
      type,
      date,
      time,

      addedBy: userId,
      addedRole: userRole,

      approved: autoApprove,
      approvedBy: autoApprove ? userId : null,
      approvedAt: autoApprove
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,

      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db
      .collection("applicants")
      .doc(applicantId)
      .collection("appointments")
      .doc(type)
      .set(appointment);

    await db.collection("applicants").doc(applicantId).set(
      {
        hasPendingAppointmentApproval: !autoApprove
      },
      { merge: true }
    );
    await refreshApplicantSummaries(applicantId);

    return res.json({ message: "Appointment added successfully" });

  } catch (error) {
    logger.error("Add Appointment Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};


// ===============================
// APPROVE APPOINTMENT
// ===============================
const approveAppointment = async (req, res) => {
  try {
    const { applicantId, type } = req.params;

    const { userRole, userId } = getAuthenticatedUser(req);

    if (userRole !== "SUPER_USER") {
      return res.status(403).json({ message: "Only Super User can approve" });
    }

    const applicantRef = db.collection("applicants").doc(applicantId);
    const appointmentRef = applicantRef
      .collection("appointments")
      .doc(type);

    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Approve appointment
    await appointmentRef.update({
      approved: true,
      approvedBy: userId,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("applicants").doc(applicantId).set(
      {
        hasPendingAppointmentApproval: false
      },
      { merge: true }
    );
    await refreshApplicantSummaries(applicantId);

    // 🔁 STAGE TRANSITION BASED ON APPOINTMENT TYPE
    let newStage = null;

    if (type === "EMBASSY_APPOINTMENT") newStage = 6;
    if (type === "EMBASSY_INTERVIEW") newStage = 8;
    if (type === "VISA_COLLECTION") newStage = 10;

    // backward compatibility for older values
    if (type === "BIOMETRIC") newStage = 8;
    if (type === "INTERVIEW") newStage = 10;

    if (newStage !== null) {
      const applicantSnap = await applicantRef.get();
      const currentStage = applicantSnap.data().stage || 1;

      if (newStage > currentStage) {
        await applicantRef.update({ stage: newStage });

        await addStageLog({
          applicantId,
          fromStage: currentStage,
          toStage: newStage,
          role: "SUPER_USER",
          action: `APPOINTMENT_APPROVAL_${type}`
        });

        // auto stages move
        if (AUTO_STAGE_IDS.includes(newStage)) {
          await autoAdvanceStage(applicantId, newStage, `AUTO_AFTER_${type}_APPROVAL`);
        }
      }
    }

    return res.json({
      message: "Appointment approved and stage updated if applicable"
    });

  } catch (error) {
    logger.error("Approve Appointment Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

const MANUAL_STAGE_IDS = [1, 2, 4, 5, 7, 9, 11];
const AUTO_STAGE_IDS = [3, 6, 8, 10];
const MAX_STAGE = 11;
const getAllowedRoleForStage = (stage) => {
  // Update as needed for additional workflow/authorization rules
  if (stage >= 1 && stage <= 2) return "AGENCY";
  if (stage >= 3 && stage <= 6) return "EMPLOYER";
  if (stage >= 7 && stage <= 10) return "EMPLOYER";
  if (stage === 11) return "SUPER_USER";
  return null;
};

const addStageLog = async ({ applicantId, fromStage, toStage, role, action }) => {
  await db.collection("stageLogs").add({
    applicantId,
    fromStage,
    toStage,
    role,
    action,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
};

const normalizeCompanyDocuments = (value) => {
  if (!Array.isArray(value)) return [];

  return value.reduce((documents, item, index) => {
    if (!item || typeof item !== "object") return documents;

    const name = String(item.name || item.label || "").trim();
    const id = String(item.id || item.docType || `document_${index + 1}`).trim();

    if (!name || !id) return documents;

    documents.push({
      id,
      name,
      required: Boolean(item.required),
      templateFileName: String(item.templateFileName || "").trim(),
      templateFileUrl: String(item.templateFileUrl || "").trim()
    });

    return documents;
  }, []);
};

const getCompanyDocumentRequirements = async (companyId) => {
  if (!companyId) return [];

  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) return [];

  return normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded);
};

const getRequiredDocumentTypes = async (applicant) => {
  const documents = await getCompanyDocumentRequirements(applicant?.companyId);
  return documents.filter((doc) => doc.required).map((doc) => doc.id);
};

const areLatestRequiredDocumentsApproved = async (applicantId, applicant) => {
  const requiredDocs = await getRequiredDocumentTypes(applicant);

  if (!requiredDocs.length) return true;

  for (const docType of requiredDocs) {
    const latestSnap = await db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType)
      .collection("versions")
      .orderBy("uploadedAt", "desc")
      .limit(1)
      .get();

    if (latestSnap.empty) return false;
    if (latestSnap.docs[0].data()?.status !== "APPROVED") return false;
  }

  return true;
};

const syncApplicantDocumentStage = async (applicantId, applicant, actorId, actorRole = "SYSTEM") => {
  if (!applicant) return;

  const currentStage = Number(applicant.stage || 1);
  if (currentStage < 2) return;
  const allApproved = await areLatestRequiredDocumentsApproved(applicantId, applicant);

  if (!allApproved || currentStage >= 3) {
    return;
  }

  const applicantRef = db.collection("applicants").doc(applicantId);
  await applicantRef.update({
    stage: 3,
    stageUpdatedAt: new Date(),
    lastActionBy: actorId || null
  });

  await addStageLog({
    applicantId,
    fromStage: currentStage,
    toStage: 3,
    role: actorRole,
    action: "ALL_REQUIRED_DOCUMENTS_APPROVED"
  });
};

const autoAdvanceStage = async (applicantId, currentStage, reason = "AUTO_ADVANCE") => {
  if (!AUTO_STAGE_IDS.includes(currentStage)) {
    return;
  }

  const next = currentStage + 1;
  if (next > MAX_STAGE) {
    return;
  }

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) return;

  const current = applicantSnap.data().stage || currentStage;
  if (current !== currentStage) return; // if stage changed meanwhile

  await applicantRef.update({
    stage: next,
    stageUpdatedAt: new Date()
  });

  await addStageLog({
    applicantId,
    fromStage: currentStage,
    toStage: next,
    role: "SYSTEM",
    action: reason
  });
};


// ===============================
// MOVE STAGE
// ===============================
const approveAndMoveStage = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only SUPER USER can approve stage
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve stages"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const applicant = doc.data();

    const currentStage = applicant.stage || 1;

    // ✅ Max stages
    if (currentStage >= MAX_STAGE) {
      return res.status(400).json({
        message: "Applicant already at final stage"
      });
    }

    if (!MANUAL_STAGE_IDS.includes(currentStage)) {
      return res.status(400).json({
        message: "Current stage is automated and cannot be manually approved"
      });
    }

    // ================================
    // 📄 DOCUMENT VALIDATION (ONLY STAGE 2 → 3)
    // ================================
    if (currentStage === 2) {

      const docsSnap = await db
        .collection("applicants")
        .doc(applicantId)
        .collection("documents")
        .get();

      let uploadedDocs = {};

      for (let doc of docsSnap.docs) {

        const versionsSnap = await doc.ref
          .collection("versions")
          .orderBy("uploadedAt", "desc")
          .limit(1)
          .get();

        if (!versionsSnap.empty) {
          uploadedDocs[doc.id] = versionsSnap.docs[0].data(); // latest version
        }
      }

      let requiredDocs = await getRequiredDocumentTypes(applicant);

      for (let docType of requiredDocs) {

        if (!uploadedDocs[docType]) {
          return res.status(400).json({
            message: `Missing required document: ${docType}`
          });
        }

        if (uploadedDocs[docType].status !== "APPROVED") {
          return res.status(400).json({
            message: `Document not approved: ${docType}`
          });
        }
      }
    }

    // ================================
    // 🚀 MOVE TO NEXT STAGE
    // ================================
    const nextStage = currentStage + 1;

    const updatePayload = {
      stage: nextStage,
      stageUpdatedAt: new Date(),
      lastActionBy: req.user.uid
    };

    if (currentStage === 1) {
      updatePayload.approvalStatus = "approved";
      updatePayload.approvedAt = new Date();
      updatePayload.approvedBy = req.user.uid;
    }

    await docRef.update(updatePayload);
    await refreshApplicantSummaries(applicantId);

    await addStageLog({
      applicantId,
      fromStage: currentStage,
      toStage: nextStage,
      role: req.user.role,
      action: "MANUAL_STAGE_APPROVAL"
    });

    const finalApplicant = await docRef.get();
    const finalStage = finalApplicant.exists ? finalApplicant.data().stage : nextStage;

    res.json({
      message: "Stage approved and moved successfully",
      previousStage: currentStage,
      newStage: finalStage
    });

  } catch (error) {
    logger.error("Move Stage Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);
  }
};

// ===============================
// GET APPLICANT BY ID (WITH COMPANY & AGENCY NAME)
// ===============================
const getApplicantById = async (req, res) => {
  try {

    const applicantId = req.params.id;

    const doc = await db.collection("applicants").doc(applicantId).get();

    if (!doc.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const applicant = doc.data();

    // Fetch company name
    let companyName = "";
    let companyDocuments = [];
    if (applicant.companyId) {
      const companyDoc = await db
        .collection("companies")
        .doc(applicant.companyId)
        .get();

      companyName = companyDoc.exists ? companyDoc.data().name : "";
      companyDocuments = companyDoc.exists ? normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded) : [];
    }

    await syncApplicantDocumentStage(applicantId, applicant, req.user?.uid, req.user?.role);

    const refreshedApplicantSnap = await db.collection("applicants").doc(applicantId).get();
    const applicantData = refreshedApplicantSnap.exists ? refreshedApplicantSnap.data() : applicant;

    let countryName = "";
    if (applicantData.countryId) {
      const countryDoc = await db
        .collection("countries")
        .doc(applicantData.countryId)
        .get();

      countryName = countryDoc.exists ? countryDoc.data().name : "";
    }

    // Fetch agency name
    let agencyName = "";
    if (applicantData.agencyId) {
      const agencyDoc = await db
        .collection("agencies")
        .doc(applicantData.agencyId)
        .get();

      agencyName = agencyDoc.exists ? agencyDoc.data().name : "";
    }

    const applicantPaymentsSnap = await db
      .collection("applicants")
      .doc(applicantId)
      .collection("payments")
      .where("type", "==", "APPLICANT")
      .get();

    let applicantPaid = 0;
    applicantPaymentsSnap.forEach((paymentDoc) => {
      const amount = Number(paymentDoc.data()?.amount);
      if (Number.isFinite(amount)) applicantPaid += amount;
    });

    const storedPaidAmount = Number(applicantData.amountPaid ?? applicantData.paidAmount ?? 0) || 0;
    applicantPaid = Math.max(applicantPaid, storedPaidAmount);

    const totalApplicantPayment = await resolveApplicantTotalEur(applicantData);

    res.json({
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
    });

  } catch (error) {
    logger.error("Get Applicant Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);

  }
};

// ===============================
// GET APPLICANT WORKFLOW BUNDLE (PROFILE AGGREGATE)
// ===============================
const getApplicantWorkflowBundle = async (req, res) => {
  try {
    const applicantId = req.params.id;

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

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
        const versionsSnap = await docSnap.ref
          .collection("versions")
          .orderBy("uploadedAt", "desc")
          .limit(1)
          .get();
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

    return res.json({
      applicant: {
        id: applicantId,
        ...applicantData,
        companyName,
        companyDocuments,
        agencyName,
        countryName,
        totalApplicantPayment,
        totalAmount: totalApplicantPayment,
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
          pending: Math.max(
            0,
            roundCurrency((applicantData.totalEmployerPayment || 0) - employerPaid)
          )
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
    });
  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET APPLICANTS (LIST)
// ===============================
exports.getApplicants = async (req, res) => {
  try {

    const snapshot = await db.collection("applicants").get();

    const applicants = [];

    snapshot.forEach(doc => {
      applicants.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json(applicants);

  } catch (error) {
    logger.error("Get Applicants Error", {
      message: error?.message,
      stack: error?.stack
    });
    return handleApplicantError(res, "Applicant controller error", error);

  }
};

// ===============================
// UPLOAD DOCUMENT
// ===============================  
exports.uploadDocument = async (req, res) => {
  try {

    const { id } = req.params;
    const { documentType } = req.body;

    const bucket = admin.storage().bucket();

    const fileName = `applicants/${id}/${documentType}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const docRef = db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(documentType);

    // ✅ ENSURE parent doc exists
    await docRef.set({
      documentType,
      updatedAt: new Date()
    }, { merge: true });

    // ✅ ADD VERSION
    await docRef
      .collection("versions")
      .add({
        fileUrl,
        status: "PENDING",
        rejectedReason: "",
        uploadedAt: new Date(),
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role
      });

    await refreshApplicantSummaries(id);

    res.json({ message: "Uploaded successfully" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET DOCUMENTS FOR APPLICANT
// ===============================
exports.getDocuments = async (req, res) => {
  try {
    const latestOnly = String(req.query?.latest || "").toLowerCase() === "true";

    const snapshot = await db
      .collection("applicants")
      .doc(req.params.id)
      .collection("documents")
      .get();

    const result = {};

    for (let doc of snapshot.docs) {
      let query = doc.ref.collection("versions").orderBy("uploadedAt", "desc");
      if (latestOnly) {
        query = query.limit(1);
      }

      const versionsSnap = await query.get();

      result[doc.id] = versionsSnap.docs.map((v) => ({
        id: v.id,
        ...v.data()
      }));
    }

    res.json(result);

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// REJECT DOCUMENT
// ===============================  
exports.rejectDocument = async (req, res) => {
  try {

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

    res.json({ message: "Rejected" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// DEFER DOCUMENT
// ===============================
exports.deferDocument = async (req, res) => {
  try {

    const { id, docType } = req.params;

    await db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(docType)
      .collection("versions")
      .add({
        status: "DEFERRED",
        fileUrl: "",
        rejectedReason: "",
        uploadedAt: new Date(),
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role
      });

    await refreshApplicantSummaries(id);

    res.json({ message: "Document deferred" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// APPROVE DOCUMENT
// ===============================
exports.approveDocument = async (req, res) => {
  try {

    const { id, docType, versionId } = req.params;

    // 🔒 Only Super User
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve documents"
      });
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

    res.json({ message: "Document approved" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// ADD DISPATCH
// ===============================  
exports.addDispatch = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { note, trackingUrl, awbNumber } = req.body;
    const userRole = req.user?.role || "";

    if (userRole !== "AGENCY") {
      return res.status(403).json({
        message: "Only agency can add dispatch details"
      });
    }

    if (!note || !awbNumber) {
      return res.status(400).json({
        message: "Note and AWB Number are required"
      });
    }

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const applicantStage = Number(applicantSnap.data()?.stage || 1);

    if (applicantStage < 3 || applicantStage >= 5) {
      return res.status(400).json({
        message: "Dispatch can only be added during dispatch or contract stage"
      });
    }

    const docRef = await db
      .collection("applicants")
      .doc(applicantId)
      .collection("dispatches")
      .add({
        note,
        trackingUrl: trackingUrl || "",
        awbNumber,
        createdBy: req.user.uid,
        createdByRole: userRole,
        createdAt: new Date()
      });

    // Auto advance stage 3 -> 4
    if (applicantStage === 3) {
      await autoAdvanceStage(applicantId, 3, "AUTO_AFTER_DISPATCH");
    }

    res.json({
      message: "Dispatch added successfully",
      id: docRef.id
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};  

// ===============================
// GET DISPATCHES FOR APPLICANT
// ===============================

exports.getDispatches = async (req, res) => {
  try {

    const snapshot = await db
      .collection("applicants")
      .doc(req.params.id)
      .collection("dispatches")
      .orderBy("createdAt", "desc")
      .get();

    const dispatches = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data?.createdAt;

      let createdAtMs = null;
      if (createdAt) {
        if (typeof createdAt.toMillis === "function") {
          createdAtMs = createdAt.toMillis();
        } else if (createdAt instanceof Date) {
          createdAtMs = createdAt.getTime();
        } else if (typeof createdAt === "number") {
          createdAtMs = createdAt;
        } else if (typeof createdAt === "object" && createdAt._seconds) {
          createdAtMs = createdAt._seconds * 1000;
        }
      }

      return {
        id: doc.id,
        ...data,
        createdAt: createdAtMs
      };
    });

    res.json(dispatches);

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// UPLOAD CONTRACT
// ===============================
exports.uploadContract = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const isSuperUser = req.user.role === "SUPER_USER";
    const isEmployer = req.user.role === "EMPLOYER";

    if (!isSuperUser && !isEmployer) {
      return res.status(403).json({
        message: "Only Super User or Employer can upload contract"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "File required"
      });
    }

    const bucket = admin.storage().bucket();
    const fileName = `contracts/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    const applicantRef = db.collection("applicants").doc(applicantId);
    const uploadedAt = new Date();
    const contractStatus = isSuperUser ? "APPROVED" : "PENDING";

    await applicantRef.set({
      contract: {
        fileUrl,
        status: contractStatus,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt,
        issuedAt: uploadedAt,
        approvedBy: isSuperUser ? req.user.uid : null,
        approvedAt: isSuperUser ? uploadedAt : null
      }
    }, { merge: true });

    if (isSuperUser) {
      const applicantSnap = await applicantRef.get();
      const currentStage = applicantSnap.data()?.stage || 1;

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

    await refreshApplicantSummaries(applicantId);

    res.json({
      message: "Contract uploaded successfully",
      fileUrl,
      status: contractStatus
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// APPROVE CONTRACT
// ===============================
exports.approveContract = async (req, res) => {
  try {

    const applicantId = req.params.id;

    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve contract"
      });
    }

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const applicant = applicantSnap.data();
    const contract = applicant?.contract;

    if (!contract?.fileUrl) {
      return res.status(400).json({
        message: "No contract available to approve"
      });
    }

    if (contract.status === "APPROVED") {
      return res.json({
        message: "Contract already approved"
      });
    }

    const approvedAt = new Date();

    await applicantRef.set({
      contract: {
        ...contract,
        status: "APPROVED",
        approvedBy: req.user.uid,
        approvedAt
      }
    }, { merge: true });

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

    await refreshApplicantSummaries(applicantId);

    res.json({
      message: "Contract approved successfully"
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET CONTRACT FOR APPLICANT
// ===============================
exports.getContract = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();
    const contract = data.contract || null;

    if (!contract) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

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

    res.json({
      ...contract,
      uploadedByName,
      approvedByName,
      uploadedAt: normalizeDate(contract.uploadedAt),
      issuedAt: normalizeDate(contract.issuedAt),
      approvedAt: normalizeDate(contract.approvedAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// ADD EMBASSY APPOINTMENT// ===============================
exports.addEmbassyAppointment = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { dateTime, date, time } = req.body;

    if (
      req.user.role !== "SUPER_USER" &&
      req.user.role !== "EMPLOYER"
    ) {
      return res.status(403).json({
        message: "Only Super User or Employer can add appointment"
      });
    }

    const resolvedDate = date || (dateTime ? String(dateTime).split("T")[0] : "");
    const resolvedTime = time || (dateTime ? String(dateTime).split("T")[1]?.slice(0, 5) : "");

    if (!resolvedDate || !resolvedTime) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    let fileUrl = "";

    if (req.file) {

      const bucket = admin.storage().bucket();
      const fileName = `appointments/${applicantId}_${Date.now()}`;
      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();
      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    const appointmentDateTime = `${resolvedDate}T${resolvedTime}`;
    const createdAt = new Date();
    const docRef = db.collection("applicants").doc(applicantId);

    await docRef.set({
      embassyAppointment: {
        date: resolvedDate,
        time: resolvedTime,
        dateTime: appointmentDateTime,
        fileUrl,
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        createdAt
      }
    }, { merge: true });

    const doc = await docRef.get();
    const applicant = doc.data();
    const currentStage = Number(applicant.stage || 1);

    if (currentStage === 5) {
      await docRef.update({
        stage: 6,
        stageUpdatedAt: createdAt
      });

      await addStageLog({
        applicantId,
        fromStage: 5,
        toStage: 6,
        role: req.user.role,
        action: "EMBASSY_APPOINTMENT_SAVED"
      });
    }

    res.json({
      message: "Embassy appointment added"
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET EMBASSY APPOINTMENT
// ===============================
exports.getEmbassyAppointment = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();
    const appointment = data.embassyAppointment || null;

    if (!appointment) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    const normalizedTime =
      appointment.time ||
      appointment.appointmentTime ||
      (appointment.dateTime ? String(appointment.dateTime).split("T")[1]?.slice(0, 5) : "") ||
      "";

    res.json({
      ...appointment,
      time: normalizedTime,
      createdAt: normalizeDate(appointment.createdAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// ADD TRAVEL DETAILS
// ===============================
exports.addTravelDetails = async (req, res) => {
  try {
    const applicantId = req.params.id;
    const { travelDate, time, ticketNumber } = req.body;

    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agent can upload travel details"
      });
    }

    if (!travelDate || !time) {
      return res.status(400).json({
        message: "Travel Date and Time are required"
      });
    }

    let fileUrl = "";

    if (req.file) {
      const bucket = admin.storage().bucket();
      const fileName = `travel/${applicantId}_${Date.now()}`;
      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();
      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const currentStage = applicantSnap.data()?.stage || 1;

    if (currentStage < 6) {
      return res.status(400).json({
        message: "Cannot add travel details before stage 6. Complete current stage first."
      });
    }

    await applicantRef.set({
      travelDetails: {
        travelDate,
        time,
        ticketNumber: ticketNumber || "",
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        createdAt: new Date()
      }
    }, { merge: true });

    res.json({
      message: "Travel details saved"
    });
  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET TRAVEL DETAILS
// ===============================
exports.getTravelDetails = async (req, res) => {
  try {
    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();
    const travelDetails = data.travelDetails || null;

    if (!travelDetails) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    res.json({
      ...travelDetails,
      createdAt: normalizeDate(travelDetails.createdAt)
    });
  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// UPLOAD BIOMETRIC SLIP
// ===============================
exports.uploadBiometricSlip = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only AGENCY
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can upload biometric slip"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "File required"
      });
    }

    const bucket = admin.storage().bucket();

    const fileName = `biometric/${applicantId}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const docRef = db.collection("applicants").doc(applicantId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const currentStage = Number(docSnap.data()?.stage || 1);

    if (currentStage < 6) {
      return res.status(400).json({
        message: "Cannot add biometric slip before ticket upload stage"
      });
    }

    // Save biometric slip
    await docRef.set({
      biometricSlip: {
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt: new Date()
      }
    }, { merge: true });

    // 🔥 AUTO STAGE COMPLETE
    await docRef.update({
      stage: 7,
      stageUpdatedAt: new Date()
    });

    res.json({
      message: "Biometric slip uploaded & stage completed"
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET BIOMETRIC SLIP
// ===============================
exports.getBiometricSlip = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();
    const biometricSlip = data.biometricSlip || null;

    if (!biometricSlip) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    res.json({
      ...biometricSlip,
      uploadedAt: normalizeDate(biometricSlip.uploadedAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// ADD EMBASSY INTERVIEW
// ===============================
exports.addEmbassyInterview = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { dateTime } = req.body;

    // 🔒 Only SUPER_USER or EMPLOYER
    if (
      req.user.role !== "SUPER_USER" &&
      req.user.role !== "EMPLOYER"
    ) {
      return res.status(403).json({
        message: "Only Super User or Employer can add interview"
      });
    }

    if (!dateTime) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    const isSuperUser = req.user.role === "SUPER_USER";

    const docRef = db.collection("applicants").doc(applicantId);

    await docRef.set({
      embassyInterview: {
        dateTime,
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        approved: isSuperUser, // auto approve if super user
        approvedBy: isSuperUser ? req.user.uid : null,
        createdAt: new Date()
      }
    }, { merge: true });

    // 🔥 AUTO STAGE MOVE if SUPER USER
    if (isSuperUser) {

      const doc = await docRef.get();
      const applicant = doc.data();
      const currentStage = applicant.stage || 1;

      await docRef.update({
        stage: currentStage + 1,
        stageUpdatedAt: new Date()
      });
    }

    await refreshApplicantSummaries(applicantId);

    res.json({
      message: "Embassy interview added"
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// APPROVE EMBASSY INTERVIEW & MOVE STAGE
// ===============================
exports.approveEmbassyInterview = async (req, res) => {
  try {

    const applicantId = req.params.id;

    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);

    const doc = await docRef.get();
    const applicant = doc.data();

    if (!applicant.embassyInterview) {
      return res.status(400).json({
        message: "No interview data"
      });
    }

    await docRef.update({
      "embassyInterview.approved": true,
      "embassyInterview.approvedBy": req.user.uid,
      stage: (applicant.stage || 1) + 1,
      stageUpdatedAt: new Date()
    });

    await refreshApplicantSummaries(applicantId);

    res.json({
      message: "Interview approved & stage moved"
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET EMBASSY INTERVIEW
// ===============================
exports.getEmbassyInterview = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();
    const interview = data.embassyInterview || null;

    if (!interview) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    res.json({
      ...interview,
      createdAt: normalizeDate(interview.createdAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// ADD INTERVIEW TICKET
// ===============================
exports.addInterviewTicket = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { date, time } = req.body;

    // 🔒 Only AGENCY
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can upload interview ticket"
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        message: "Date and Time required"
      });
    }

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const currentStage = Number(applicantSnap.data()?.stage || 1);

    if (currentStage < 8) {
      return res.status(400).json({
        message: "Cannot add interview ticket before interview completion stage"
      });
    }

    let fileUrl = "";

    // Optional file upload
    if (req.file) {

      const bucket = admin.storage().bucket();

      const fileName = `interview-ticket/${applicantId}_${Date.now()}`;

      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();

      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    await applicantRef.set({
        interviewTicket: {
          date,
          time,
          fileUrl,
          uploadedBy: req.user.uid,
          uploadedByRole: req.user.role,
          createdAt: new Date()
        }
      }, { merge: true });

    res.json({
      message: "Interview ticket saved"
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET INTERVIEW TICKET
// ===============================
exports.getInterviewTicket = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();
    const interviewTicket = data.interviewTicket || null;

    if (!interviewTicket) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    res.json({
      ...interviewTicket,
      createdAt: normalizeDate(interviewTicket.createdAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// UPLOAD INTERVIEW BIOMETRIC SLIP
// ===============================
exports.uploadInterviewBiometric = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only Agency
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can upload interview biometric slip"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "File required"
      });
    }

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

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const currentStage = Number(docSnap.data()?.stage || 1);

    if (currentStage < 8) {
      return res.status(400).json({
        message: "Cannot add interview biometric before interview completion stage"
      });
    }

    // Save document
    await docRef.set({
      interviewBiometric: {
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt: new Date()
      }
    }, { merge: true });

    // 🔥 AUTO MOVE TO STAGE 9
    await docRef.update({
      stage: 9,
      stageUpdatedAt: new Date()
    });

    res.json({
      message: "Interview biometric uploaded & stage completed"
    });

  } catch (err) {
    logger.error("Upload Interview Biometric Error", {
      message: err?.message,
      stack: err?.stack
    });
    return handleApplicantError(res, "Applicant controller error", err);
  }
};


// ===============================
// GET INTERVIEW BIOMETRIC SLIP
// ===============================
exports.getInterviewBiometric = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();
    const interviewBiometric = data.interviewBiometric || null;

    if (!interviewBiometric) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    res.json({
      ...interviewBiometric,
      uploadedAt: normalizeDate(interviewBiometric.uploadedAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// ADD VISA COLLECTION
// ===============================
exports.addVisaCollection = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { date, time } = req.body;

    if (!["EMPLOYER", "SUPER_USER"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Only Employer or Super User can add"
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const currentStage = Number(docSnap.data()?.stage || 1);

    if (currentStage < 9) {
      return res.status(400).json({
        message: "Cannot add visa collection before visa collection stage"
      });
    }

    const status = req.user.role === "SUPER_USER" ? "APPROVED" : "PENDING";

    await docRef.set({
      visaCollection: {
        date,
        time,
        status,
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        createdAt: new Date(),
        approvedBy: status === "APPROVED" ? req.user.uid : null,
        approvedAt: status === "APPROVED" ? new Date() : null
      }
    }, { merge: true });

    // 🔥 If Super User → auto move stage
    if (status === "APPROVED") {
      await docRef.update({
        stage: 10,
        stageUpdatedAt: new Date()
      });
    }

    await refreshApplicantSummaries(applicantId);

    res.json({ message: "Visa collection saved" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// APPROVE VISA COLLECTION
// ===============================
exports.approveVisaCollection = async (req, res) => {
  try {

    const applicantId = req.params.id;

    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);

    await docRef.update({
      "visaCollection.status": "APPROVED",
      "visaCollection.approvedBy": req.user.uid,
      "visaCollection.approvedAt": new Date(),
      stage: 10,
      stageUpdatedAt: new Date()
    });

    await refreshApplicantSummaries(applicantId);

    res.json({ message: "Visa collection approved" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET VISA COLLECTION
// ===============================
exports.getVisaCollection = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data()?.visaCollection;

    if (!data) return res.json(null);

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    // 🔒 Visibility rule
    if (
      data.status !== "APPROVED" &&
      !["SUPER_USER", "EMPLOYER"].includes(req.user.role)
    ) {
      return res.json(null);
    }

    res.json({
      ...data,
      createdAt: normalizeDate(data.createdAt),
      approvedAt: normalizeDate(data.approvedAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// ADD VISA TRAVEL DETAILS
// ===============================
exports.addVisaTravel = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { date, time, ticketNumber } = req.body;

    // 🔒 Only Agency
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can add travel details"
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const currentStage = Number(applicantSnap.data()?.stage || 1);

    if (currentStage < 10) {
      return res.status(400).json({
        message: "Cannot add visa travel before visa collection completion stage"
      });
    }

    let fileUrl = "";

    if (req.file) {
      const bucket = admin.storage().bucket();

      const fileName = `visa-travel/${applicantId}_${Date.now()}`;

      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();

      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    await applicantRef.set({
        visaTravel: {
          date,
          time,
          ticketNumber: ticketNumber || "",
          fileUrl,
          uploadedBy: req.user.uid,
          uploadedByRole: req.user.role,
          createdAt: new Date()
        }
      }, { merge: true });

    res.json({ message: "Visa travel details saved" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET VISA TRAVEL DETAILS
// ===============================
exports.getVisaTravel = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data()?.visaTravel;

    if (!data) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    res.json({
      ...data,
      createdAt: normalizeDate(data.createdAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// UPLOAD RESIDENCE PERMIT (FRONT/BACK)
// ===============================
exports.uploadResidencePermit = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { type } = req.body;

    if (req.user.role !== "AGENCY") {
      return res.status(403).json({ message: "Only Agency allowed" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    const bucket = admin.storage().bucket();

    const fileName = `residence/${applicantId}_${type}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const docRef = db.collection("applicants").doc(applicantId);

    // ✅ GET EXISTING
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }
    const applicantData = doc.data() || {};
    const currentStage = Number(applicantData.stage || 1);

    if (currentStage < 10) {
      return res.status(400).json({
        message: "Cannot upload residence permit before visa collection completion stage"
      });
    }

    if (!applicantData.visaTravel?.date || !applicantData.visaTravel?.time) {
      return res.status(400).json({
        message: "Upload visa travel details before residence permit"
      });
    }
    const existing = applicantData.residencePermit || {};

    // ✅ MERGE PROPERLY
    const updatedPermit = {
      ...existing,
      [type === "FRONT" ? "frontUrl" : "backUrl"]: fileUrl,
      uploadedBy: req.user.uid,
      uploadedByRole: req.user.role,
      uploadedAt: new Date()
    };

    await docRef.set({
      residencePermit: updatedPermit
    }, { merge: true });

    // ✅ FETCH AGAIN (IMPORTANT)
    const updatedDoc = await docRef.get();
    const data = updatedDoc.data()?.residencePermit;

    // ✅ AUTO STAGE COMPLETE
    if (data?.frontUrl && data?.backUrl) {
      await docRef.update({
        stage: 11,
        stageUpdatedAt: new Date()
      });
    }

    res.json({ message: "Uploaded successfully" });

  } catch (err) {
    logger.error("Upload Residence Permit Error", {
      message: err?.message,
      stack: err?.stack
    });
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// GET RESIDENCE PERMIT
// ===============================
exports.getResidencePermit = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const residencePermit = doc.data()?.residencePermit || null;

    if (!residencePermit) {
      return res.json(null);
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      if (typeof value === "object" && value._seconds) return value._seconds * 1000;
      return null;
    };

    res.json({
      ...residencePermit,
      uploadedAt: normalizeDate(residencePermit.uploadedAt)
    });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// COMPLETE APPLICANT PROCESS
// ===============================
exports.completeApplicant = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only Super User
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can complete process"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);

    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const data = doc.data();

    // Optional safety: only allow completion if stage >= 10
    if ((data.stage || 0) < 10) {
      return res.status(400).json({
        message: "Process not ready for completion"
      });
    }

    await docRef.update({
      stage: 12,
      completedAt: new Date(),
      completedBy: req.user.uid,
      stageUpdatedAt: new Date()
    });

    await refreshApplicantSummaries(applicantId);

    res.json({
      message: "Process completed successfully"
    });

  } catch (err) {
    logger.error("Complete Applicant Error", {
      message: err?.message,
      stack: err?.stack
    });
    return handleApplicantError(res, "Applicant controller error", err);
  }
};

// ===============================
// UPDATE APPLICANT (GENERIC)
// ===============================
exports.updateApplicant = async (req, res) => {
  try {
    const { id } = req.params;

    // Only Super User
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can update applicant"
      });
    }

    const applicantRef = db.collection("applicants").doc(id);
    const applicantSnap = await applicantRef.get();
    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const incomingTotal = toNumber(req.body?.totalApplicantPayment ?? req.body?.totalAmount);
    const resolvedTotal =
      incomingTotal > 0
        ? incomingTotal
        : await resolveApplicantTotalEur({ ...applicantSnap.data(), ...req.body });

    await applicantRef.update({
      ...req.body,
      totalApplicantPayment: resolvedTotal,
      totalAmount: resolvedTotal,
      updatedAt: new Date()
    });

    await refreshApplicantSummaries(id, {
      ...applicantSnap.data(),
      ...req.body,
      totalApplicantPayment: resolvedTotal,
      totalAmount: resolvedTotal
    });

    res.json({ message: "Applicant updated successfully" });

  } catch (err) {
    return handleApplicantError(res, "Applicant controller error", err);
  }
};


// ✅ EXPORTS (THIS IS CRITICAL)
module.exports = {
  createApplicant,
  getApplicants,
  approveApplicant,
  getApplicantById, 
  getApplicantWorkflowBundle,
  approveAndMoveStage,
  // Generic upload route: POST /:id/upload-document
  uploadDocument: exports.uploadDocument,
  // Template/type upload route: POST /:applicantId/documents/:docType/upload
  uploadDocumentByType,
  markDocumentSeen,
  deferDocument,
  addPayment,
  getPaymentSummary,
  approveAppointment,
  addAppointment,
  getDocuments: exports.getDocuments,
  rejectDocument: exports.rejectDocument,
  approveDocument: exports.approveDocument,
  addDispatch: exports.addDispatch,
  getDispatches: exports.getDispatches,
  uploadContract: exports.uploadContract,
  approveContract: exports.approveContract,
  getContract: exports.getContract, 
  addEmbassyAppointment: exports.addEmbassyAppointment,
  getEmbassyAppointment: exports.getEmbassyAppointment,
  addTravelDetails: exports.addTravelDetails,
  getTravelDetails: exports.getTravelDetails,
  uploadBiometricSlip: exports.uploadBiometricSlip,
  getBiometricSlip: exports.getBiometricSlip,
  addEmbassyInterview: exports.addEmbassyInterview,
  approveEmbassyInterview: exports.approveEmbassyInterview,
  getEmbassyInterview: exports.getEmbassyInterview,
  addInterviewTicket: exports.addInterviewTicket,
  getInterviewTicket: exports.getInterviewTicket,
  uploadInterviewBiometric: exports.uploadInterviewBiometric,
  getInterviewBiometric: exports.getInterviewBiometric,
  addVisaCollection: exports.addVisaCollection,
  approveVisaCollection: exports.approveVisaCollection,
  getVisaCollection: exports.getVisaCollection,
  addVisaTravel: exports.addVisaTravel,
  getVisaTravel: exports.getVisaTravel,
  uploadResidencePermit: exports.uploadResidencePermit,
  getResidencePermit: exports.getResidencePermit,
  completeApplicant: exports.completeApplicant,
  updateApplicant: exports.updateApplicant
};





const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { updatePaymentSummaryAfterPayment } = require("../../services/applicantSummaryService");
const {
  getAuthenticatedUserFromReq,
  normalizeDate,
  normalizePaymentCurrency,
  normalizePaymentMode,
  resolveApplicantPaymentCurrency,
  resolveApplicantTotalEur,
  roundCurrency
} = require("../../services/applicantDomainService");
const { isSuperUserLikeRole } = require("../../utils/roles");

function sanitizeFileName(value = "document") {
  return String(value || "document")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "document";
}

async function addPaymentUseCase(req) {
  const { applicantId } = req.params;
  const { type, amount, currency, note, paidDate, paymentMode } = req.body;
  const { userRole, userId } = getAuthenticatedUserFromReq(req);

  if (!["APPLICANT", "EMPLOYER"].includes(type)) {
    throw new AppError("Invalid payment type", 400);
  }

  const normalizedAmount = roundCurrency(amount);
  if (normalizedAmount <= 0) {
    throw new AppError("Paid amount must be greater than 0", 400);
  }

  const normalizedPaymentMode = normalizePaymentMode(paymentMode);
  if (!normalizedPaymentMode) {
    throw new AppError("Invalid payment mode", 400);
  }

  if (
    (type === "APPLICANT" && !isSuperUserLikeRole(userRole)) ||
    (type === "EMPLOYER" && !(isSuperUserLikeRole(userRole) || userRole === "ACCOUNTANT"))
  ) {
    throw new AppError("Not allowed to add this payment", 403);
  }

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) {
    throw new AppError("Applicant not found", 404);
  }
  const applicantData = applicantSnap.data() || {};
  const applicantCurrency = resolveApplicantPaymentCurrency(applicantData);

  if (type === "APPLICANT") {
    const paymentsSnap = await applicantRef
      .collection("payments")
      .where("type", "==", "APPLICANT")
      .get();

    if (paymentsSnap.size >= 5) {
      throw new AppError("Maximum 5 installments allowed", 400);
    }
  }

  const parsedPaidDate = paidDate ? new Date(paidDate) : new Date();
  if (Number.isNaN(parsedPaidDate.getTime())) {
    throw new AppError("Invalid paid date", 400);
  }

  let documentUrl = "";
  let documentFileName = "";
  if (req.file) {
    const bucket = admin.storage().bucket();
    documentFileName = sanitizeFileName(req.file.originalname);
    const fileName = `payments/${applicantId}/${Date.now()}_${documentFileName}`;
    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();
    documentUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  }

  const payment = {
    type,
    amount: normalizedAmount,
    currency: type === "APPLICANT" ? applicantCurrency : normalizePaymentCurrency(currency),
    paymentMode: normalizedPaymentMode,
    note: note || "",
    paidBy: userRole,
    paidTo: type === "APPLICANT" ? "SUPER_USER" : "EMPLOYER",
    paidDate: parsedPaidDate,
    createdBy: userId,
    documentUrl,
    documentFileName,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await applicantRef.collection("payments").add(payment);
  await updatePaymentSummaryAfterPayment(applicantId, payment, applicantData);

  return { message: "Payment added successfully" };
}

async function buildPaymentSummaryResponse(applicantId, applicant) {
  const applicantRef = db.collection("applicants").doc(applicantId);
  const paymentsSnap = await applicantRef.collection("payments").get();

  let applicantPaid = 0;
  let employerPaid = 0;
  const history = [];

  paymentsSnap.forEach((doc) => {
    const payment = doc.data() || {};
    const normalizedAmount = roundCurrency(payment.amount);
    const normalizedPaymentMode = normalizePaymentMode(payment.paymentMode);

    if (payment.type === "APPLICANT") applicantPaid += normalizedAmount;
    if (payment.type === "EMPLOYER") employerPaid += normalizedAmount;

    history.push({
      id: doc.id,
      ...payment,
      amount: normalizedAmount,
      paymentMode: normalizedPaymentMode || payment.paymentMode || "",
      paidDate: normalizeDate(payment.paidDate || payment.createdAt),
      createdAt: normalizeDate(payment.createdAt)
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
        currency: resolveApplicantPaymentCurrency(applicant),
        paymentMode: "",
        note: history.some((item) => item.type === "APPLICANT")
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
  const applicantTotalEur = await resolveApplicantTotalEur(applicant);
  const applicantCurrency = resolveApplicantPaymentCurrency(applicant);
  const applicantTotal = roundCurrency(applicantTotalEur);
  const applicantPending = Math.max(0, roundCurrency(applicantTotal - applicantPaid));
  const applicantInstallments = history.filter((item) => item.type === "APPLICANT");

  return {
    applicant: {
      total: applicantTotal,
      totalEur: applicantTotal,
      totalInr: applicantTotal,
      paid: roundCurrency(applicantPaid),
      paidInr: roundCurrency(applicantPaid),
      pending: applicantPending,
      pendingInr: applicantPending,
      currency: applicantCurrency,
      sourceCurrency: applicantCurrency,
      installmentCount: applicantInstallments.length,
      remainingInstallments: Math.max(0, 5 - applicantInstallments.length),
      history: applicantInstallments
    },
    employer: {
      total: roundCurrency(applicant.totalEmployerPayment || 0),
      paid: roundCurrency(employerPaid),
      pending: Math.max(0, roundCurrency((applicant.totalEmployerPayment || 0) - employerPaid))
    },
    history
  };
}

async function getPaymentSummaryUseCase(req) {
  const { applicantId } = req.params;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();

  if (!applicantSnap.exists) {
    throw new AppError("Applicant not found", 404);
  }

  return buildPaymentSummaryResponse(applicantId, applicantSnap.data() || {});
}

module.exports = {
  addPaymentUseCase,
  buildPaymentSummaryResponse,
  getPaymentSummaryUseCase
};

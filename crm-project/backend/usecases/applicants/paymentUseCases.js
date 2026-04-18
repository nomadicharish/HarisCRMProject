const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const {
  getAuthenticatedUserFromReq,
  getTodayEurToInrRate,
  normalizeDate,
  normalizePaymentMode,
  resolveApplicantTotalEur,
  roundCurrency
} = require("../../services/applicantDomainService");

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
    (type === "APPLICANT" && !["AGENCY", "SUPER_USER"].includes(userRole)) ||
    (type === "EMPLOYER" && !["SUPER_USER", "ACCOUNTANT"].includes(userRole))
  ) {
    throw new AppError("Not allowed to add this payment", 403);
  }

  if (type === "APPLICANT") {
    const paymentsSnap = await db
      .collection("applicants")
      .doc(applicantId)
      .collection("payments")
      .where("type", "==", "APPLICANT")
      .get();

    if (paymentsSnap.size >= 4) {
      throw new AppError("Maximum 4 installments allowed", 400);
    }
  }

  const parsedPaidDate = paidDate ? new Date(paidDate) : new Date();
  if (Number.isNaN(parsedPaidDate.getTime())) {
    throw new AppError("Invalid paid date", 400);
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

  await db.collection("applicants").doc(applicantId).collection("payments").add(payment);
  await refreshApplicantSummaries(applicantId);

  return { message: "Payment added successfully" };
}

async function getPaymentSummaryUseCase(req) {
  const { applicantId } = req.params;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();

  if (!applicantSnap.exists) {
    throw new AppError("Applicant not found", 404);
  }

  const applicant = applicantSnap.data();
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
        currency: "INR",
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
  const eurToInrRate = await getTodayEurToInrRate();
  const applicantTotalEur = await resolveApplicantTotalEur(applicant);
  const applicantTotalInr = roundCurrency(applicantTotalEur * eurToInrRate);
  const applicantPendingInr = Math.max(0, roundCurrency(applicantTotalInr - applicantPaid));
  const applicantInstallments = history.filter((item) => item.type === "APPLICANT");

  return {
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
  };
}

module.exports = {
  addPaymentUseCase,
  getPaymentSummaryUseCase
};

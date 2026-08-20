const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const {
  refreshApplicantSummaries,
  updatePaymentSummaryAfterPayment
} = require("../../services/applicantSummaryService");
const { getBankAccount } = require("../../services/bankAccountService");
const { recordNotificationAction } = require("../../services/notificationService");
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
const { hasRight } = require("../../config/userRights");

const PAYMENT_STATUS = {
  PENDING_JUNIOR: "PENDING_JUNIOR",
  PENDING_SENIOR: "PENDING_SENIOR",
  CONFIRMED: "CONFIRMED"
};

function normalizePaymentStatus(payment = {}) {
  const value = String(payment.verificationStatus || payment.status || "").toUpperCase();
  if (Object.values(PAYMENT_STATUS).includes(value)) return value;
  if (payment.requiresVerification === true) {
    if (payment.seniorConfirmed === true || payment.seniorConfirmedAt) return PAYMENT_STATUS.CONFIRMED;
    if (payment.juniorAcknowledged === true || payment.juniorAcknowledgedAt) return PAYMENT_STATUS.PENDING_SENIOR;
    return PAYMENT_STATUS.PENDING_JUNIOR;
  }
  return PAYMENT_STATUS.CONFIRMED;
}

function getUserDisplayName(userData = {}, fallback = "") {
  return String(
    userData.name ||
    userData.agencyName ||
    userData.employerName ||
    userData.companyName ||
    userData.displayName ||
    userData.fullName ||
    [userData.firstName, userData.lastName].filter(Boolean).join(" ") ||
    fallback ||
    ""
  ).trim();
}

async function resolveUserDisplayNames(userIds = []) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const [userSnapshots, agencySnapshots, employerSnapshots] = await Promise.all([
    db.getAll(...uniqueIds.map((id) => db.collection("users").doc(id))),
    db.getAll(...uniqueIds.map((id) => db.collection("agencies").doc(id))),
    db.getAll(...uniqueIds.map((id) => db.collection("employers").doc(id)))
  ]);
  const names = new Map();
  for (const snapshots of [employerSnapshots, agencySnapshots]) {
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const name = getUserDisplayName(snapshot.data() || {});
      if (name) names.set(snapshot.id, name);
    });
  }
  const linkedEntityIds = [];
  userSnapshots.forEach((snapshot) => {
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    if (data.agencyId) linkedEntityIds.push({ userId: snapshot.id, entityId: data.agencyId, collection: "agencies" });
    if (data.employerId) linkedEntityIds.push({ userId: snapshot.id, entityId: data.employerId, collection: "employers" });
    const name = getUserDisplayName(data);
    if (name) names.set(snapshot.id, name);
  });
  if (linkedEntityIds.length) {
    const linkedSnapshots = await db.getAll(
      ...linkedEntityIds.map((item) => db.collection(item.collection).doc(item.entityId))
    );
    linkedSnapshots.forEach((snapshot, index) => {
      const link = linkedEntityIds[index];
      if (!snapshot.exists || names.get(link.userId)) return;
      const name = getUserDisplayName(snapshot.data() || {});
      if (name) names.set(link.userId, name);
    });
  }
  return names;
}

function sanitizeFileName(value = "document") {
  return String(value || "document")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "document";
}

async function addPaymentUseCase(req) {
  const { applicantId } = req.params;
  const {
    type,
    amount,
    currency,
    note,
    paidDate,
    paymentMode,
    bankAccountId,
    utrNumber,
    payeeName,
    payeeBankName,
    payeeBankBranch
  } = req.body;
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
    throw new AppError("Payment mode must be Bank Transfer, UPI or BH", 400);
  }

  if (!hasRight(req.user, "ADD_PAYMENT_DETAILS")) throw new AppError("Access denied", 403);

  if (!paidDate) {
    throw new AppError("Paid date is required", 400);
  }

  let bankAccount = null;
  const normalizedUtrNumber = String(utrNumber || "").trim();
  const normalizedPayeeName = String(payeeName || "").trim();
  const normalizedPayeeBankName = String(payeeBankName || "").trim();
  const normalizedPayeeBankBranch = String(payeeBankBranch || "").trim();
  if (normalizedPaymentMode === "Bank Transfer") {
    if (!String(bankAccountId || "").trim()) {
      throw new AppError("Bank account is required for bank transfer", 400);
    }
    if (!normalizedPayeeName || !normalizedPayeeBankName || !normalizedPayeeBankBranch) {
      throw new AppError("Payee name, payee bank name and payee bank and branch are required for bank transfer", 400);
    }
    bankAccount = await getBankAccount(String(bankAccountId).trim());
  }
  if (normalizedPaymentMode === "UPI" && (!normalizedUtrNumber || !normalizedPayeeName)) {
    throw new AppError("Payee name and UTR number are required for UPI payment", 400);
  }
  if (normalizedPaymentMode === "BH" && !normalizedPayeeName) {
    throw new AppError("Payee name is required for BH payment", 400);
  }

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) {
    throw new AppError("Applicant not found", 404);
  }
  const applicantData = applicantSnap.data() || {};
  if (
    userRole === "AGENCY" &&
    applicantData.agencyId !== (req.user?.agencyId || userId) &&
    applicantData.agencyId !== userId
  ) {
    throw new AppError("Not allowed to add payment for this applicant", 403);
  }
  const applicantCurrency = resolveApplicantPaymentCurrency(applicantData);
  const enteredByNames = await resolveUserDisplayNames([userId]);
  const enteredByName =
    enteredByNames.get(userId) ||
    (userRole === "AGENCY" ? applicantData.agencyName || "" : "") ||
    "Unknown User";

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

  const uploadedFiles = [
    ...(Array.isArray(req.files?.documents) ? req.files.documents : []),
    ...(Array.isArray(req.files?.file) ? req.files.file : [])
  ].slice(0, 5);
  const documents = [];
  if (uploadedFiles.length) {
    const bucket = admin.storage().bucket();
    for (const [index, file] of uploadedFiles.entries()) {
      const documentFileName = sanitizeFileName(file.originalname);
      const fileName = `payments/${applicantId}/${Date.now()}_${index}_${documentFileName}`;
      const fileUpload = bucket.file(fileName);
      await fileUpload.save(file.buffer, {
        metadata: { contentType: file.mimetype }
      });
      documents.push({
        name: documentFileName,
        url: fileName
      });
    }
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
    bankAccountId: bankAccount?.id || "",
    bankAccount: bankAccount
      ? {
          beneficiaryName: bankAccount.beneficiaryName,
          accountNumber: bankAccount.accountNumber,
          bankNameBranch: bankAccount.bankNameBranch
        }
      : null,
    utrNumber: normalizedPaymentMode === "UPI" ? normalizedUtrNumber : "",
    payeeName: ["Bank Transfer", "UPI", "BH"].includes(normalizedPaymentMode) ? normalizedPayeeName : "",
    payeeBankName: normalizedPaymentMode === "Bank Transfer" ? normalizedPayeeBankName : "",
    payeeBankBranch: normalizedPaymentMode === "Bank Transfer" ? normalizedPayeeBankBranch : "",
    verificationStatus: type === "APPLICANT" ? PAYMENT_STATUS.PENDING_JUNIOR : PAYMENT_STATUS.CONFIRMED,
    requiresVerification: type === "APPLICANT",
    juniorAcknowledged: false,
    seniorConfirmed: false,
    enteredByName,
    documents,
    documentUrl: documents[0]?.url || "",
    documentFileName: documents[0]?.name || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await applicantRef.collection("payments").add(payment);
  await updatePaymentSummaryAfterPayment(applicantId, payment, applicantData);
  await recordNotificationAction({
    actionKey: "PAYMENT_ADDED",
    applicantId,
    applicant: applicantData,
    user: req.user,
    actorName: enteredByName
  });

  return { message: "Payment added successfully" };
}

async function buildPaymentSummaryResponse(applicantId, applicant) {
  const applicantRef = db.collection("applicants").doc(applicantId);
  const paymentsSnap = await applicantRef.collection("payments").get();

  let applicantPaid = 0;
  let employerPaid = 0;
  let confirmedAmount = 0;
  let awaitingJuniorAmount = 0;
  let awaitingSeniorAmount = 0;
  const history = [];

  paymentsSnap.forEach((doc) => {
    const payment = doc.data() || {};
    const normalizedAmount = roundCurrency(payment.amount);
    const normalizedPaymentMode = normalizePaymentMode(payment.paymentMode);

    if (payment.type === "APPLICANT") applicantPaid += normalizedAmount;
    if (payment.type === "EMPLOYER") employerPaid += normalizedAmount;
    const verificationStatus = normalizePaymentStatus(payment);
    if (payment.type === "APPLICANT" && verificationStatus === PAYMENT_STATUS.CONFIRMED) {
      confirmedAmount += normalizedAmount;
    }
    if (payment.type === "APPLICANT" && verificationStatus === PAYMENT_STATUS.PENDING_JUNIOR) {
      awaitingJuniorAmount += normalizedAmount;
    }
    if (payment.type === "APPLICANT" && verificationStatus === PAYMENT_STATUS.PENDING_SENIOR) {
      awaitingSeniorAmount += normalizedAmount;
    }

    history.push({
      id: doc.id,
      ...payment,
      amount: normalizedAmount,
      verificationStatus,
      paymentMode: normalizedPaymentMode || payment.paymentMode || "",
      paidDate: normalizeDate(payment.paidDate || payment.createdAt),
      createdAt: normalizeDate(payment.createdAt),
      juniorAcknowledgedAt: normalizeDate(payment.juniorAcknowledgedAt),
      seniorConfirmedAt: normalizeDate(payment.seniorConfirmedAt)
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
        createdBy: applicant.createdBy || "",
        paidBy: "Initial Payment",
        paidTo: "SUPER_USER",
        paidDate: normalizeDate(applicant.createdAt || applicant.updatedAt || new Date()),
        createdAt: normalizeDate(applicant.createdAt || applicant.updatedAt || new Date()),
        isLegacyMapped: true
      });
      applicantPaid = roundCurrency(applicantPaid + legacyBalance);
      confirmedAmount = roundCurrency(confirmedAmount + legacyBalance);
    }
  }

  const paymentUserIds = history.flatMap((payment) => [
    payment.createdBy,
    payment.paidBy,
    payment.juniorAcknowledgedBy,
    payment.seniorConfirmedBy
  ]);
  const userNames = await resolveUserDisplayNames(paymentUserIds);
  history.forEach((payment) => {
    const existingEnteredByName =
      payment.enteredByName && payment.enteredByName !== payment.createdBy && payment.enteredByName !== payment.paidBy
        ? payment.enteredByName
        : "";
    payment.enteredByName =
      userNames.get(payment.createdBy) ||
      userNames.get(payment.paidBy) ||
      existingEnteredByName ||
      (payment.paidBy === "AGENCY" ? applicant.agencyName || "" : "") ||
      "Unknown User";
    payment.juniorAcknowledgedByName =
      userNames.get(payment.juniorAcknowledgedBy) ||
      payment.juniorAcknowledgedByName ||
      "";
    payment.seniorConfirmedByName =
      userNames.get(payment.seniorConfirmedBy) ||
      payment.seniorConfirmedByName ||
      "";
  });

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
      confirmedAmount: roundCurrency(confirmedAmount),
      awaitingJuniorAmount: roundCurrency(awaitingJuniorAmount),
      awaitingSeniorAmount: roundCurrency(awaitingSeniorAmount),
      hasPendingAcknowledgement: awaitingJuniorAmount > 0,
      hasPendingConfirmation: awaitingSeniorAmount > 0,
      paymentCompleted: applicantTotal > 0 && roundCurrency(confirmedAmount) >= applicantTotal,
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

async function updatePaymentVerification(req, expectedStatus, nextStatus, fields) {
  const { applicantId, paymentId } = req.params;
  const applicantRef = db.collection("applicants").doc(applicantId);
  const paymentRef = applicantRef.collection("payments").doc(paymentId);
  let applicantData = {};

  await db.runTransaction(async (transaction) => {
    const [applicantSnap, paymentSnap] = await Promise.all([
      transaction.get(applicantRef),
      transaction.get(paymentRef)
    ]);
    if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);
    applicantData = applicantSnap.data() || {};
    if (!paymentSnap.exists) throw new AppError("Payment not found", 404);
    const payment = paymentSnap.data() || {};
    if (payment.type !== "APPLICANT") throw new AppError("Only applicant payments can be reviewed", 400);
    if (normalizePaymentStatus(payment) !== expectedStatus) {
      throw new AppError("Payment is not in the required review stage", 409);
    }
    transaction.update(paymentRef, {
      verificationStatus: nextStatus,
      ...fields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await refreshApplicantSummaries(applicantId);
  await recordNotificationAction({
    actionKey: nextStatus === PAYMENT_STATUS.CONFIRMED ? "PAYMENT_CONFIRMED" : "PAYMENT_ACKNOWLEDGED",
    applicantId,
    applicant: applicantData,
    user: req.user,
    actorName: fields.seniorConfirmedByName || fields.juniorAcknowledgedByName || ""
  });
  return { message: nextStatus === PAYMENT_STATUS.CONFIRMED ? "Payment confirmed" : "Payment acknowledged" };
}

async function acknowledgePaymentUseCase(req) {
  if (req.user?.role !== "JUNIOR_ACCOUNTANT") {
    throw new AppError("Only Junior Accountant can acknowledge payment", 403);
  }
  const names = await resolveUserDisplayNames([req.user.uid]);
  return updatePaymentVerification(req, PAYMENT_STATUS.PENDING_JUNIOR, PAYMENT_STATUS.PENDING_SENIOR, {
    juniorAcknowledged: true,
    juniorAcknowledgedBy: req.user.uid,
    juniorAcknowledgedByName: names.get(req.user.uid) || "Junior Accountant",
    juniorAcknowledgedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function confirmPaymentUseCase(req) {
  if (req.user?.role !== "SENIOR_ACCOUNTANT") {
    throw new AppError("Only Senior Accountant can confirm payment", 403);
  }
  const names = await resolveUserDisplayNames([req.user.uid]);
  return updatePaymentVerification(req, PAYMENT_STATUS.PENDING_SENIOR, PAYMENT_STATUS.CONFIRMED, {
    seniorConfirmed: true,
    seniorConfirmedBy: req.user.uid,
    seniorConfirmedByName: names.get(req.user.uid) || "Senior Accountant",
    seniorConfirmedAt: admin.firestore.FieldValue.serverTimestamp()
  });
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
  acknowledgePaymentUseCase,
  addPaymentUseCase,
  buildPaymentSummaryResponse,
  confirmPaymentUseCase,
  getPaymentSummaryUseCase
};

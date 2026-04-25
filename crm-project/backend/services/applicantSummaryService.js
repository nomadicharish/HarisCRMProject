const { admin, db } = require("../config/firebase");
const { normalizeCompanyDocuments } = require("../utils/normalizers");

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

async function getCompanyRequiredDocTypes(companyId) {
  if (!companyId) return [];
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) return [];
  return normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded)
    .filter((item) => item.required)
    .map((item) => item.id)
    .filter(Boolean);
}

async function buildPaymentSummary(applicantId, applicantData = {}) {
  const paymentsSnap = await db.collection("applicants").doc(applicantId).collection("payments").get();

  let applicantPaid = 0;
  let employerPaid = 0;
  let applicantInstallments = 0;

  paymentsSnap.forEach((paymentDoc) => {
    const payment = paymentDoc.data() || {};
    const amount = roundCurrency(payment.amount);
    if (payment.type === "APPLICANT") {
      applicantPaid += amount;
      applicantInstallments += 1;
    }
    if (payment.type === "EMPLOYER") {
      employerPaid += amount;
    }
  });

  const legacyPaid = roundCurrency(applicantData.amountPaid ?? applicantData.paidAmount ?? 0);
  applicantPaid = Math.max(roundCurrency(applicantPaid), legacyPaid);

  const totalApplicant = roundCurrency(
    applicantData.totalApplicantPayment ?? applicantData.totalAmount ?? applicantData.totalPayment ?? 0
  );
  const totalEmployer = roundCurrency(applicantData.totalEmployerPayment ?? 0);

  return {
    applicant: {
      total: totalApplicant,
      paid: roundCurrency(applicantPaid),
      pending: Math.max(0, roundCurrency(totalApplicant - applicantPaid)),
      installmentCount: applicantInstallments,
      remainingInstallments: Math.max(0, 4 - applicantInstallments)
    },
    employer: {
      total: totalEmployer,
      paid: roundCurrency(employerPaid),
      pending: Math.max(0, roundCurrency(totalEmployer - employerPaid))
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function getLatestDocStatus(applicantId, docType) {
  const latestSnap = await db
    .collection("applicants")
    .doc(applicantId)
    .collection("documents")
    .doc(docType)
    .collection("versions")
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();

  if (latestSnap.empty) return "";
  return String(latestSnap.docs[0].data()?.status || "").toUpperCase();
}

async function buildDocSummary(applicantId, applicantData = {}) {
  const requiredDocTypes = await getCompanyRequiredDocTypes(applicantData.companyId);
  if (!requiredDocTypes.length) {
    return {
      totalCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      deferredCount: 0,
      uploadedCount: 0,
      allRequiredApproved: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
  }

  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  let deferredCount = 0;
  let uploadedCount = 0;

  for (const docType of requiredDocTypes) {
    const status = await getLatestDocStatus(applicantId, docType);
    if (!status) continue;
    uploadedCount += 1;
    if (status === "APPROVED") approvedCount += 1;
    if (status === "PENDING") pendingCount += 1;
    if (status === "REJECTED") rejectedCount += 1;
    if (status === "DEFERRED") deferredCount += 1;
  }

  return {
    totalCount: requiredDocTypes.length,
    approvedCount,
    pendingCount,
    rejectedCount,
    deferredCount,
    uploadedCount,
    allRequiredApproved: requiredDocTypes.length > 0 && approvedCount === requiredDocTypes.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

function buildApprovalFlags(applicantData = {}, docSummary = {}) {
  const hasPendingEmbassyInterviewApproval =
    String(applicantData?.embassyInterview?.status || "").toUpperCase() === "PENDING" ||
    (Boolean(applicantData?.embassyInterview?.dateTime) && !Boolean(applicantData?.embassyInterview?.approved));
  const hasPendingVisaCollectionApproval =
    String(applicantData?.visaCollection?.status || "").toUpperCase() === "PENDING";
  const hasPendingContractApproval =
    String(applicantData?.contract?.status || "").toUpperCase() === "PENDING";
  const hasPendingApplicantApproval =
    String(applicantData?.approvalStatus || "").toLowerCase() !== "approved";
  const hasPendingAppointmentApproval = Boolean(applicantData?.hasPendingAppointmentApproval);

  return {
    hasPendingDocumentApproval: Number(docSummary.pendingCount || 0) > 0,
    hasRejectedDocument: Number(docSummary.rejectedCount || 0) > 0,
    hasPendingEmbassyInterviewApproval,
    hasPendingVisaCollectionApproval,
    hasPendingContractApproval,
    hasPendingApplicantApproval,
    hasPendingAppointmentApproval,
    hasPendingPipelineApproval:
      hasPendingApplicantApproval ||
      hasPendingContractApproval ||
      hasPendingVisaCollectionApproval ||
      hasPendingEmbassyInterviewApproval ||
      hasPendingAppointmentApproval,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function refreshApplicantSummaries(applicantId, applicantData = null) {
  const applicantRef = db.collection("applicants").doc(applicantId);
  let resolvedApplicant = applicantData;

  if (!resolvedApplicant) {
    const applicantSnap = await applicantRef.get();
    if (!applicantSnap.exists) return null;
    resolvedApplicant = applicantSnap.data() || {};
  }

  const [paymentSummary, docSummary] = await Promise.all([
    buildPaymentSummary(applicantId, resolvedApplicant),
    buildDocSummary(applicantId, resolvedApplicant)
  ]);
  const approvalFlags = buildApprovalFlags(resolvedApplicant, docSummary);

  await applicantRef.set(
    {
      paymentSummary,
      docSummary,
      documentSummary: docSummary,
      approvalFlags,
      hasPendingAppointmentApproval: approvalFlags.hasPendingAppointmentApproval,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { paymentSummary, docSummary, approvalFlags };
}

module.exports = {
  refreshApplicantSummaries
};

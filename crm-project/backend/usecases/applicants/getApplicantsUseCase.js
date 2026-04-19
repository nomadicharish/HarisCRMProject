const { db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const {
  APPLICANT_LIST_SELECT_FIELDS,
  getApplicantBannerStatusText,
  getApplicantStageLabel,
  getAuthenticatedUserFromReq,
  getTodayEurToInrRate,
  normalizeTextForSearch,
  parseBooleanQuery,
  parseProjectionFields,
  projectApplicantFields,
  roundCurrency,
  toNumber
} = require("../../services/applicantDomainService");

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sortByCreatedAtDesc(items = []) {
  return [...items].sort((a, b) => {
    const aDate = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const bDate = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return bDate - aDate;
  });
}

async function resolveRoleScopedApplicantDocs({ userRole, userId, agencyId }) {
  let docs = [];
  let query = db.collection("applicants").select(...APPLICANT_LIST_SELECT_FIELDS);

  if (userRole === "AGENCY") {
    const primaryAgencyId = agencyId || userId;
    const primarySnap = await query.where("agencyId", "==", primaryAgencyId).get();

    if (agencyId && agencyId !== userId) {
      const legacySnap = await query.where("agencyId", "==", userId).get();
      const byId = new Map();
      primarySnap.docs.forEach((doc) => byId.set(doc.id, doc));
      legacySnap.docs.forEach((doc) => byId.set(doc.id, doc));
      docs = Array.from(byId.values());
    } else {
      docs = primarySnap.docs;
    }
  } else if (userRole === "EMPLOYER") {
    const userDoc = await db.collection("users").doc(userId).get();
    const employerId = userDoc.exists ? userDoc.data()?.employerId : null;
    if (!employerId) throw new AppError("Employer profile not linked", 400);

    const employerDoc = await db.collection("employers").doc(employerId).get();
    const companyId = employerDoc.exists ? employerDoc.data()?.companyId : null;
    if (!companyId) throw new AppError("Employer company not linked", 400);

    query = query.where("companyId", "==", companyId);
    docs = (await query.get()).docs;
  } else if (["SUPER_USER", "ACCOUNTANT"].includes(userRole)) {
    docs = (await query.get()).docs;
  } else {
    throw new AppError("Unauthorized", 403);
  }

  return docs;
}

async function resolveReferenceMaps(docs = []) {
  const companyIds = new Set();
  const countryIds = new Set();
  const agencyIds = new Set();

  docs.forEach((doc) => {
    const data = doc.data();
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

  return {
    agencyIdToName,
    companyIdToName,
    companyIdToPayment,
    countryIdToName
  };
}

function mapApplicant({
  doc,
  userRole,
  liteMode,
  eurToInrRate,
  companyIdToName,
  countryIdToName,
  agencyIdToName,
  companyIdToPayment
}) {
  const data = doc.data();
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
    String(data?.embassyInterview?.status || "").toUpperCase() === "PENDING" ||
    (Boolean(data?.embassyInterview?.dateTime) && !Boolean(data?.embassyInterview?.approved));

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
  const hasPendingVisaCollectionApproval = String(data?.visaCollection?.status || "").toUpperCase() === "PENDING";
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
      id: doc.id,
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
    id: doc.id,
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
}

function applyApplicantFilters(items, { searchQuery, countryFilters, companyFilters, agencyFilters, typeFilters }) {
  let applicants = [...items];
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
    applicants = applicants.filter((applicant) =>
      typeFilters.some((type) => {
        if (type === "attention_required") return Boolean(applicant.attentionRequired);
        return applicant.workflowStatus === type;
      })
    );
  }
  return applicants;
}

function paginateApplicants(applicants, { paginated, page, limit, requestedFieldSet }) {
  if (!paginated) {
    return requestedFieldSet ? applicants.map((item) => projectApplicantFields(item, requestedFieldSet)) : applicants;
  }

  const total = applicants.length;
  const safeLimit = Math.max(1, Math.min(100, limit));
  const safePage = Math.max(1, page);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const currentPage = Math.min(safePage, totalPages);
  const startIndex = (currentPage - 1) * safeLimit;
  const pagedItems = applicants.slice(startIndex, startIndex + safeLimit);
  const items = requestedFieldSet ? pagedItems.map((item) => projectApplicantFields(item, requestedFieldSet)) : pagedItems;

  return {
    items,
    pagination: {
      page: currentPage,
      limit: safeLimit,
      total,
      totalPages
    }
  };
}

async function getApplicantsUseCase(req) {
  const { userRole, userId } = getAuthenticatedUserFromReq(req);
  const agencyId = req.user?.agencyId || null;
  const liteMode = parseBooleanQuery(req.query?.lite, false);
  const paginated = parseBooleanQuery(req.query?.paginated, true);
  const page = Number(req.query?.page || 1);
  const limit = Number(req.query?.limit || 25);
  const searchQuery = String(req.query?.q || "").trim().toLowerCase();
  const requestedFieldSet = parseProjectionFields(req.query?.fields);
  const countryFilters = parseList(req.query?.country);
  const companyFilters = parseList(req.query?.company);
  const agencyFilters = parseList(req.query?.agency);
  const typeFilters = parseList(req.query?.type);

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const docs = await resolveRoleScopedApplicantDocs({ userRole, userId, agencyId });
  const { agencyIdToName, companyIdToName, companyIdToPayment, countryIdToName } = await resolveReferenceMaps(docs);
  const eurToInrRate = await getTodayEurToInrRate();

  const mapped = docs.map((doc) =>
    mapApplicant({
      doc,
      userRole,
      liteMode,
      eurToInrRate,
      companyIdToName,
      countryIdToName,
      agencyIdToName,
      companyIdToPayment
    })
  );

  const sorted = sortByCreatedAtDesc(mapped);
  const filtered = applyApplicantFilters(sorted, {
    searchQuery,
    countryFilters,
    companyFilters,
    agencyFilters,
    typeFilters
  });

  return paginateApplicants(filtered, {
    paginated,
    page,
    limit,
    requestedFieldSet
  });
}

module.exports = {
  getApplicantsUseCase
};

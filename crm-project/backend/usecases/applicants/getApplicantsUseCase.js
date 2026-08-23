const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const {
  APPLICANT_LIST_SELECT_FIELDS,
  getApplicantBannerStatusText,
  getApplicantStageLabel,
  getAuthenticatedUserFromReq,
  normalizeTextForSearch,
  parseBooleanQuery,
  parseProjectionFields,
  projectApplicantFields,
  resolveApplicantPaymentStage,
  resolveApplicantPaymentSnapshot,
  resolveWorkflowFilterKey,
  roundCurrency
} = require("../../services/applicantDomainService");
const { isAccountantRole, isSuperUserLikeRole } = require("../../utils/roles");
const { normalizeCompanyJobPositions } = require("../../utils/normalizers");

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "object" && value._seconds) return new Date(value._seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinRange(date, fromDate, toDate) {
  if (!date) return false;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

function decodeCursor(value = "") {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!parsed.id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: String(parsed.id) };
  } catch {
    return null;
  }
}

function encodeCursor(doc) {
  const value = doc?.data()?.createdAt;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value || 0);
  if (!doc?.id || Number.isNaN(date.getTime())) return null;
  return Buffer.from(JSON.stringify({ createdAt: date.toISOString(), id: doc.id })).toString("base64url");
}

function getLastOneMonthRange() {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setMonth(from.getMonth() - 1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function hasResidencePermit(applicant) {
  const permit = applicant?.residencePermit || {};
  return Boolean(permit.trpUrl || permit.fileUrl || permit.frontUrl || permit.backUrl || permit.frontFileUrl || permit.backFileUrl);
}

function hasArrivalTicketDetails(applicant) {
  return Boolean(
    applicant?.visaTravel?.date ||
    applicant?.visaTravel?.time ||
    applicant?.visaTravel?.dateTime ||
    applicant?.visaTravel?.fileUrl
  );
}

function hasDocumentDispatch(applicant) {
  if (applicant?.documentDispatch?.hasDispatch === true) return true;
  if (Number(applicant?.dispatchSummary?.count || 0) > 0) return true;
  return Number(applicant?.stage || 1) >= 4;
}

function isPaymentInRange(payment, fromDate, toDate) {
  const candidateDates = [
    toDateValue(payment?.createdAt),
    toDateValue(payment?.paidDate)
  ].filter(Boolean);
  return candidateDates.some((date) => isWithinRange(date, fromDate, toDate));
}

function toDateValue(value) {
  return toDate(value);
}

async function resolvePaymentApplicantIdsByDate({ applicantDocs, fromDate, toDate }) {
  const ids = new Set();
  await Promise.all(applicantDocs.map(async (applicantDoc) => {
    const paymentsSnapshot = await applicantDoc.ref.collection("payments").get();
    paymentsSnapshot.docs.forEach((paymentDoc) => {
      const payment = paymentDoc.data() || {};
      if (payment.type !== "APPLICANT") return;
      if (!isPaymentInRange(payment, fromDate, toDate)) return;
      ids.add(applicantDoc.id);
    });
  }));
  return [...ids];
}

function matchesDashboardFilter(applicant, filter, fromDate, toDate) {
  const now = new Date();
  const stage = Number(applicant?.stage || 1);
  const appointmentDate = firstDate(applicant?.embassyAppointment?.dateTime, applicant?.embassyAppointment?.date, applicant?.embassyAppointment?.createdAt);
  const interviewDate = firstDate(applicant?.embassyInterview?.dateTime, applicant?.embassyInterview?.date, applicant?.embassyInterview?.createdAt);
  const visaCollectionDate = firstDate(applicant?.visaCollection?.dateTime, applicant?.visaCollection?.date, applicant?.visaCollection?.createdAt);
  const arrivalDate = firstDate(applicant?.visaTravel?.dateTime, applicant?.visaTravel?.date, applicant?.visaTravel?.createdAt);
  const arrivedDate = firstDate(applicant?.completedAt, applicant?.stageUpdatedAt, applicant?.visaTravel?.dateTime, applicant?.visaTravel?.date, applicant?.visaTravel?.createdAt);
  const paymentStage = resolveApplicantPaymentStage(applicant, applicant?.payment);

  switch (filter) {
    case "arriving":
      return stage < 13 && isWithinRange(arrivalDate, fromDate, toDate);
    case "arrived_last_month": {
      const range = getLastOneMonthRange();
      return stage >= 13 && isWithinRange(arrivedDate, range.from, range.to);
    }
    case "visa_collection":
      return stage < 12 && isWithinRange(visaCollectionDate, fromDate, toDate);
    case "embassy_interview":
      return stage <= 9 && isWithinRange(interviewDate, fromDate, toDate);
    case "embassy_appointment":
      return stage <= 7 && isWithinRange(appointmentDate, fromDate, toDate);
    case "pending_payment":
      return paymentStage.pending > 0;
    case "payment_received":
      return true;
    case "payment_after_approval":
      return paymentStage.key === "after_approval" && paymentStage.pending > 0;
    case "payment_after_embassy_appointment":
      return paymentStage.key === "after_embassy_appointment" && paymentStage.pending > 0;
    case "payment_after_embassy_interview":
      return paymentStage.key === "after_embassy_interview" && paymentStage.pending > 0;
    case "payment_after_visa_collection":
      return paymentStage.key === "after_visa_collection" && paymentStage.pending > 0;
    case "payment_after_trc":
      return paymentStage.key === "after_trc" && paymentStage.pending > 0;
    case "trp_pending":
      return Boolean(stage === 11 && visaCollectionDate && visaCollectionDate < now && !hasResidencePermit(applicant));
    case "interview_biometric_pending":
      return Boolean(stage === 9 && interviewDate && interviewDate < now && !applicant?.interviewBiometric?.fileUrl);
    case "appointment_biometric_pending":
      return Boolean(stage === 7 && appointmentDate && appointmentDate < now && !applicant?.biometricSlip?.fileUrl);
    case "arrival_ticket_pending":
      return Boolean(stage === 12 && visaCollectionDate && visaCollectionDate < now && !hasArrivalTicketDetails(applicant));
    case "document_dispatch_pending":
      return Boolean(
        stage >= 2 &&
        stage < 7 &&
        String(applicant?.approvalStatus || "").toLowerCase() === "approved" &&
        !hasDocumentDispatch(applicant)
      );
    default:
      return true;
  }
}

function firstDate(...values) {
  for (const value of values) {
    const date = toDate(value);
    if (date) return date;
  }
  return null;
}

function sortByCreatedAtDesc(items = []) {
  return [...items].sort((a, b) => {
    const aDate = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const bDate = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return bDate - aDate;
  });
}

function hasMultipleMultiValueFilters(...filters) {
  return filters.filter((items) => items.length > 1).length > 1;
}

function canUseFirestorePaginatedPath({
  paginated,
  searchQuery,
  typeFilters,
  countryFilters,
  companyFilters,
  agencyFilters,
  userRole,
  userId,
  agencyId
}) {
  if (!paginated) return false;
  // The sidebar's detailed stage values are derived from nested workflow data
  // at read time. They are not stored as queryable Firestore fields, so its
  // exact counts require the compatibility mapper until those fields are
  // materialized and backfilled. Returning only the three aggregate workflow
  // counts here makes every detailed stage appear as zero.
  if (userRole === "EMPLOYER" || isSuperUserLikeRole(userRole) || userRole === "SENIOR_ACCOUNTANT") return false;
  // Dashboard filters use this internal marker to force the in-memory matcher,
  // because their rules depend on dates and nested workflow data.
  if (searchQuery || typeFilters.length > 1 || typeFilters.includes("dashboard") || typeFilters.some((type) => type.startsWith("stage_"))) return false;
  if (agencyId && agencyId !== userId && userRole === "AGENCY") return false;
  if (hasMultipleMultiValueFilters(countryFilters, companyFilters, agencyFilters)) return false;
  return [countryFilters, companyFilters, agencyFilters].every((items) => items.length <= 10);
}

function applyListFilter(query, field, values) {
  if (!values.length) return query;
  if (values.length === 1) return query.where(field, "==", values[0]);
  return query.where(field, "in", values);
}

function isMissingFirestoreIndexError(error) {
  const message = String(error?.message || "");
  return error?.code === 9 && message.includes("requires an index");
}

async function countQueryResults(query) {
  if (typeof query.count !== "function") return null;
  const aggregateSnap = await query.count().get();
  return Number(aggregateSnap.data()?.count || 0);
}

async function resolveEmployerCompanyIds(userId, linkedEmployerId = null) {
  let employerId = linkedEmployerId;
  if (!employerId) {
    const userDoc = await db.collection("users").doc(userId).get();
    employerId = userDoc.exists ? userDoc.data()?.employerId : null;
  }
  if (!employerId) throw new AppError("Employer profile not linked", 400);

  const employerDoc = await db.collection("employers").doc(employerId).get();
  const data = employerDoc.exists ? employerDoc.data() || {} : {};
  const companyIds = Array.isArray(data.companyIds) && data.companyIds.length
    ? data.companyIds
    : data.companyId
      ? [data.companyId]
      : [];
  if (!companyIds.length) throw new AppError("Employer company not linked", 400);
  return companyIds.map((value) => String(value || "").trim()).filter(Boolean);
}

function isApprovedApplicantForEmployer(doc) {
  const data = doc.data() || {};
  const status = String(data.approvalStatus || "").toLowerCase();
  return status === "approved";
}

function isApplicantApprovalReviewerRole(role) {
  return isSuperUserLikeRole(role) || role === "ADMIN";
}

async function buildRoleScopedApplicantQuery({ userRole, userId, agencyId, employerId }) {
  let query = db.collection("applicants").select(...APPLICANT_LIST_SELECT_FIELDS);

  if (userRole === "AGENCY") {
    return query.where("agencyId", "==", agencyId || userId);
  }

  if (userRole === "EMPLOYER") {
    const companyIds = await resolveEmployerCompanyIds(userId, employerId);
    query = companyIds.length === 1
      ? query.where("companyId", "==", companyIds[0])
      : query.where("companyId", "in", companyIds.slice(0, 10));
    return query.where("approvalStatus", "==", "approved");
  }

  if (isApplicantApprovalReviewerRole(userRole)) {
    return query;
  }

  if (isAccountantRole(userRole)) return query.where("approvalStatus", "==", "approved");

  throw new AppError("Unauthorized", 403);
}

function applyApplicantTypeFilter(query, typeFilters = []) {
  const type = typeFilters[0];
  if (!type) return query;
  if (type === "attention_required") return query.where("attentionRequired", "==", true);
  if (["in_progress", "completed"].includes(type)) return query.where("workflowStatus", "==", type);
  return query;
}

async function getApplicantTypeCounts({ userRole, userId, agencyId, employerId, countryFilters, companyFilters, agencyFilters }) {
  try {
    let baseQuery = await buildRoleScopedApplicantQuery({ userRole, userId, agencyId, employerId });
    baseQuery = applyListFilter(baseQuery, "countryId", countryFilters);
    baseQuery = applyListFilter(baseQuery, "companyId", companyFilters);
    baseQuery = applyListFilter(baseQuery, "agencyId", agencyFilters);
    const [inProgress, attentionRequired, completed] = await Promise.all([
      countQueryResults(baseQuery.where("workflowStatus", "==", "in_progress")),
      countQueryResults(baseQuery.where("attentionRequired", "==", true)),
      countQueryResults(baseQuery.where("workflowStatus", "==", "completed"))
    ]);
    return { in_progress: inProgress, attention_required: attentionRequired, completed };
  } catch (error) {
    // A missing composite index should not prevent the applicant list from loading.
    if (isMissingFirestoreIndexError(error)) return null;
    throw error;
  }
}

async function resolveRoleScopedApplicantDocs({ userRole, userId, agencyId, employerId }) {
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
    const companyIds = await resolveEmployerCompanyIds(userId, employerId);
    query = companyIds.length === 1
      ? query.where("companyId", "==", companyIds[0])
      : query.where("companyId", "in", companyIds.slice(0, 10));
    docs = (await query.get()).docs.filter(isApprovedApplicantForEmployer);
  } else if (isApplicantApprovalReviewerRole(userRole)) {
    docs = (await query.get()).docs;
  } else if (isAccountantRole(userRole)) {
    docs = (await query.where("approvalStatus", "==", "approved").get()).docs;
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
    if (data?.companyId && (!data?.companyName || !data?.jobPositionName)) companyIds.add(data.companyId);
    if (data?.countryId && !data?.countryName) countryIds.add(data.countryId);
    if (data?.agencyId && !data?.agencyName) agencyIds.add(data.agencyId);
  });

  const companyIdToName = {};
  const companyIdToJobPositionName = {};
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
    const company = doc.exists ? doc.data() || {} : {};
    companyIdToName[doc.id] = company.name || "";
    const positions = normalizeCompanyJobPositions(company.jobPositions, company.documentsNeeded);
    const legacyPositions = Array.isArray(company.jobSpecifications) ? company.jobSpecifications : [];
    companyIdToJobPositionName[doc.id] = Object.fromEntries(
      [...positions, ...legacyPositions]
        .map((position) => [
          String(position?.id || "").trim(),
          String(position?.title || position?.name || position?.label || "").trim()
        ])
        .filter(([id, name]) => id && name)
    );
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
    companyIdToJobPositionName,
    countryIdToName
  };
}

function mapApplicant({
  doc,
  userRole,
  liteMode,
  companyIdToName,
  companyIdToJobPositionName,
  countryIdToName,
  agencyIdToName
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

  const docSummary = data?.docSummary || data?.documentSummary || {};
  const approvalFlags = data?.approvalFlags || {};

  const payment = resolveApplicantPaymentSnapshot(data);

  const approvedRequired = Number(docSummary.approvedCount || 0) > 0 && Number(docSummary.pendingCount || 0) === 0;
  const rejectedRequired = Number(docSummary.rejectedCount || 0) > 0;
  const pendingRequired = Number(docSummary.pendingCount || 0) > 0;
  const uploadedRequired = Number(docSummary.totalCount || 0) > 0;
  const hasPendingDocumentApproval = pendingRequired;
  const hasRejectedDocument = rejectedRequired;
  const hasDocumentUploadPending = Number(docSummary.uploadedCount || 0) < Number(docSummary.totalCount || 0);
  const hasDocuments = uploadedRequired;

  const hasPendingAppointmentApproval =
    Boolean(approvalFlags?.hasPendingAppointmentApproval) || Boolean(data?.hasPendingAppointmentApproval);
  const hasPendingEmbassyAppointmentApproval =
    hasPendingAppointmentApproval ||
    String(data?.embassyAppointment?.status || "").toUpperCase() === "PENDING";
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
  const isCandidateApprovalPending =
    Number(data?.stage || 1) === 1 && String(data?.approvalStatus || "").toLowerCase() !== "approved";

  const attentionRequired =
    isSuperUserLikeRole(userRole)
      ? hasPendingDocumentApproval || hasPendingPipelineApproval || hasPendingEmbassyInterviewApproval
      : userRole === "AGENCY"
      ? !isCandidateApprovalPending && (hasRejectedDocument || hasDocumentUploadPending)
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
  const hasResidencePermit = Boolean(
    data?.residencePermit?.trpUrl ||
    data?.residencePermit?.frontUrl ||
    data?.residencePermit?.backUrl ||
    data?.residencePermit?.frontFileUrl ||
    data?.residencePermit?.backFileUrl ||
    data?.residencePermit?.fileUrl
  );
  const hasRejectedSignedContractDocuments =
    String(data?.signedContract?.status || "").toUpperCase() === "REJECTED" ||
    Number(data?.signedContract?.rejectedDocumentCount || 0) > 0;
  const hasCompletedDocumentStage = Number(data?.stage || 1) >= 3 && approvedRequired;
  const stageLabel = getApplicantStageLabel(data?.stage, data?.approvalStatus);
  const computedStatusText = getApplicantBannerStatusText(data, {
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
    hasPendingEmbassyAppointmentApproval,
    hasPendingEmbassyInterviewApproval,
    hasPendingVisaCollectionApproval,
    hasEmbassyAppointment,
    hasRejectedSignedContractDocuments
  });
  const applicantBannerStatus = String(computedStatusText || data?.applicantBannerStatus || "");
  const statusText = applicantBannerStatus;
  const workflowFilterKey = resolveWorkflowFilterKey(statusText);

  const workflowStatus =
    Number(data?.stage || 1) >= 13
      ? "completed"
      : attentionRequired
      ? "attention_required"
      : "in_progress";

  if (liteMode) {
    return {
      id: doc.id,
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(" ").trim(),
      email: data?.email || data?.personalDetails?.email || "",
      stage: Number(data?.stage || 1),
      approvalStatus: data?.approvalStatus || "pending",
      companyId: data?.companyId || "",
      countryId: data?.countryId || "",
      agencyId: data?.agencyId || "",
      companyName: data?.companyName || (data?.companyId ? companyIdToName[data.companyId] : ""),
      jobPositionName:
        data?.jobPositionName ||
        (data?.companyId ? companyIdToJobPositionName[data.companyId]?.[data.jobPositionId] : "") ||
        "",
      countryName: data?.countryName || (data?.countryId ? countryIdToName[data.countryId] : ""),
      agencyName: data?.agencyName || (data?.agencyId ? agencyIdToName[data.agencyId] : ""),
      attentionRequired,
      workflowStatus,
      stageLabel,
      applicantBannerStatus,
      statusText,
      workflowFilterKey,
      arrivalDate: data?.visaTravel?.date || data?.visaTravel?.dateTime || "",
      visaTravel: data?.visaTravel
        ? {
            date: data.visaTravel.date || "",
            dateTime: data.visaTravel.dateTime || "",
            time: data.visaTravel.time || "",
            arrivalBusDate: data.visaTravel.arrivalBusDate || "",
            arrivalBusTime: data.visaTravel.arrivalBusTime || ""
          }
        : null,
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
    companyName: data?.companyName || (data?.companyId ? companyIdToName[data.companyId] : ""),
    jobPositionName:
      data?.jobPositionName ||
      (data?.companyId ? companyIdToJobPositionName[data.companyId]?.[data.jobPositionId] : "") ||
      "",
    countryName: data?.countryName || (data?.countryId ? countryIdToName[data.countryId] : ""),
    agencyName: data?.agencyName || (data?.agencyId ? agencyIdToName[data.agencyId] : ""),
    attentionRequired,
    workflowStatus,
    stageLabel,
    applicantBannerStatus,
    statusText,
    workflowFilterKey,
    payment
  };
}

async function getApplicantsFirestorePage({
  userRole,
  userId,
  agencyId,
  employerId,
  liteMode,
  page,
  cursor,
  limit,
  requestedFieldSet,
  countryFilters,
  companyFilters,
  agencyFilters,
  typeFilters
}) {
  let query = await buildRoleScopedApplicantQuery({ userRole, userId, agencyId, employerId });
  query = applyListFilter(query, "countryId", countryFilters);
  query = applyListFilter(query, "companyId", companyFilters);
  query = applyListFilter(query, "agencyId", agencyFilters);
  query = applyApplicantTypeFilter(query, typeFilters);
  query = query.orderBy("createdAt", "desc").orderBy(admin.firestore.FieldPath.documentId(), "desc");

  const safeLimit = Math.max(1, Math.min(100, limit));
  const safePage = Math.max(1, page);
  const countQuery = query;
  const total = await countQueryResults(countQuery);
  const decodedCursor = decodeCursor(cursor);
  if (decodedCursor) query = query.startAfter(decodedCursor.createdAt, decodedCursor.id);
  else if (safePage > 1) query = query.offset((safePage - 1) * safeLimit);
  const snap = await query.limit(safeLimit + 1).get();
  const hasMore = snap.docs.length > safeLimit;
  const docs = snap.docs.slice(0, safeLimit);
  const { agencyIdToName, companyIdToName, companyIdToJobPositionName, countryIdToName } = await resolveReferenceMaps(docs);
  const typeCounts = await getApplicantTypeCounts({
    userRole,
    userId,
    agencyId,
    employerId,
    countryFilters,
    companyFilters,
    agencyFilters
  });
  const mapped = docs.map((doc) =>
    mapApplicant({
      doc,
      userRole,
      liteMode,
      companyIdToName,
      companyIdToJobPositionName,
      countryIdToName,
      agencyIdToName
    })
  );
  const items = requestedFieldSet ? mapped.map((item) => projectApplicantFields(item, requestedFieldSet)) : mapped;
  const offset = (safePage - 1) * safeLimit;
  const resolvedTotal = total ?? offset + items.length;
  const totalPages = Math.max(1, Math.ceil(resolvedTotal / safeLimit));

  return {
    items,
    pagination: {
      page: Math.min(safePage, totalPages),
      limit: safeLimit,
      total: resolvedTotal,
      totalPages,
      hasMore,
      nextCursor: hasMore && docs.length ? encodeCursor(docs[docs.length - 1]) : null
    },
    typeCounts
  };
}

function applyApplicantFilters(items, { searchQuery, countryFilters, companyFilters, agencyFilters, typeFilters, dashboardFilter, fromDate, toDate, notificationApplicantIds, dashboardApplicantIds }) {
  let applicants = [...items];
  if (notificationApplicantIds.length) {
    const allowedIds = new Set(notificationApplicantIds);
    applicants = applicants.filter((applicant) => allowedIds.has(applicant.id));
  }
  if (dashboardApplicantIds) {
    const allowedIds = new Set(dashboardApplicantIds);
    applicants = applicants.filter((applicant) => allowedIds.has(applicant.id));
  }
  if (searchQuery) {
    applicants = applicants.filter((applicant) =>
      normalizeTextForSearch(
        applicant.fullName ||
        `${applicant.firstName || ""} ${applicant.lastName || ""}` ||
        applicant.email ||
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
        if (type.startsWith("stage_")) return applicant.workflowFilterKey === type;
        if (type === "attention_required") return Boolean(applicant.attentionRequired);
        return applicant.workflowStatus === type;
      })
    );
  }
  if (dashboardFilter) {
    applicants = applicants.filter((applicant) => matchesDashboardFilter(applicant, dashboardFilter, fromDate, toDate));
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
  let { userRole, userId } = getAuthenticatedUserFromReq(req);
  const agencyId = req.user?.agencyId || null;
  const employerId = req.user?.employerId || null;
  const liteMode = parseBooleanQuery(req.query?.lite, false);
  const paginated = parseBooleanQuery(req.query?.paginated, true);
  const page = Number(req.query?.page || 1);
  const cursor = String(req.query?.cursor || "").trim();
  const limit = Number(req.query?.limit || 25);
  const searchQuery = String(req.query?.q || "").trim().toLowerCase();
  const requestedFieldSet = parseProjectionFields(req.query?.fields);
  const countryFilters = parseList(req.query?.country);
  const companyFilters = parseList(req.query?.company);
  const agencyFilters = parseList(req.query?.agency);
  const typeFilters = parseList(req.query?.type);
  const notificationApplicantIds = parseList(req.query?.notificationApplicants);
  const dashboardFilter = String(req.query?.dashboardFilter || "").trim();
  const fromDate = parseDateBoundary(req.query?.fromDate, false);
  const toDate = parseDateBoundary(req.query?.toDate, true);
  const effectiveLiteMode = dashboardFilter ? false : liteMode;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }
  const canUseFirestorePage = canUseFirestorePaginatedPath({
    paginated,
    searchQuery,
    typeFilters: dashboardFilter || fromDate || toDate || notificationApplicantIds.length ? ["dashboard"] : typeFilters,
    countryFilters,
    companyFilters,
    agencyFilters,
    userRole,
    userId,
    agencyId
  });

  if (canUseFirestorePage) {
    try {
      return await getApplicantsFirestorePage({
        userRole,
        userId,
        agencyId,
        employerId,
        liteMode,
        page,
        cursor,
        limit,
        requestedFieldSet,
        countryFilters,
        companyFilters,
        agencyFilters,
        typeFilters
      });
    } catch (error) {
      if (!isMissingFirestoreIndexError(error)) {
        throw error;
      }
    }
  }

  const docs = await resolveRoleScopedApplicantDocs({ userRole, userId, agencyId, employerId });
  const dashboardApplicantIds = dashboardFilter === "payment_received"
    ? await resolvePaymentApplicantIdsByDate({ applicantDocs: docs, fromDate, toDate })
    : null;
  const { agencyIdToName, companyIdToName, companyIdToJobPositionName, countryIdToName } = await resolveReferenceMaps(docs);
  const mapped = docs.map((doc) =>
    mapApplicant({
      doc,
      userRole,
      liteMode: effectiveLiteMode,
      companyIdToName,
      companyIdToJobPositionName,
      countryIdToName,
      agencyIdToName
    })
  );

  const sorted = sortByCreatedAtDesc(mapped);
  const filtered = applyApplicantFilters(sorted, {
    searchQuery,
    countryFilters,
    companyFilters,
    agencyFilters,
    typeFilters,
    dashboardFilter,
    fromDate,
    toDate,
    notificationApplicantIds,
    dashboardApplicantIds
  });

  const paged = paginateApplicants(filtered, {
    paginated,
    page,
    limit,
    requestedFieldSet
  });
  if (!paginated) return paged;
  const stageCounts = mapped.reduce((counts, applicant) => {
    const key = applicant.workflowFilterKey;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return { ...paged, stageCounts };
}

module.exports = {
  getApplicantsUseCase
};

const { db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { resolveApplicantPaymentSnapshot, resolveApplicantPaymentStage } = require("./applicantDomainService");
const { isSuperUserLikeRole } = require("../utils/roles");

function toTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "object" && value._seconds) return new Date(value._seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinRange(date, fromDate, toDateValue) {
  if (!date) return false;
  if (fromDate && date < fromDate) return false;
  if (toDateValue && date > toDateValue) return false;
  return true;
}

function getDateRange(fromDate = "", toDateValue = "") {
  const from = toTimestamp(fromDate);
  const to = toTimestamp(toDateValue);
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
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

function resolveWorkflowDate(...values) {
  for (const value of values) {
    const date = toDate(value);
    if (date) return date;
  }
  return null;
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
  const normalized = companyIds.map((value) => String(value || "").trim()).filter(Boolean);
  if (!normalized.length) throw new AppError("Employer company not linked", 400);
  return normalized;
}

function createMetric(key, label, filter, tone = "blue") {
  return { key, label, filter, tone, count: 0 };
}

function createPaymentStage(key, label, percentage, filter, tone) {
  return {
    key,
    label,
    percentage,
    filter,
    tone,
    count: 0,
    pendingByCurrency: { INR: 0, EUR: 0, USD: 0 }
  };
}

function emptyCurrencyTotals() {
  return { INR: 0, EUR: 0, USD: 0 };
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(emptyCurrencyTotals(), currency) ? currency : "INR";
}

function isPaymentInRange(payment, from, to) {
  const candidateDates = [
    toDate(payment?.createdAt),
    toDate(payment?.paidDate)
  ].filter(Boolean);
  return candidateDates.some((date) => isWithinRange(date, from, to));
}

async function buildAccountantPaymentDashboard({ applicantDocs, from, to }) {
  const paymentRows = [];
  const applicantById = new Map();
  const missingAgencyIds = new Set();

  applicantDocs.forEach((doc) => {
    const data = doc.exists ? doc.data() || {} : {};
    applicantById.set(doc.id, data);
    if (data.agencyId && !data.agencyName) missingAgencyIds.add(data.agencyId);
  });

  await Promise.all(applicantDocs.map(async (applicantDoc) => {
    const paymentsSnapshot = await applicantDoc.ref.collection("payments").get();
    paymentsSnapshot.docs.forEach((paymentDoc) => {
      const payment = paymentDoc.data() || {};
      if (payment.type !== "APPLICANT") return;
      if (!isPaymentInRange(payment, from, to)) return;
      paymentRows.push({
        applicantId: applicantDoc.id,
        payment
      });
    });
  }));

  const agencyNameById = new Map();
  if (missingAgencyIds.size) {
    const agencyDocs = await db.getAll(...[...missingAgencyIds].map((id) => db.collection("agencies").doc(id)));
    agencyDocs.forEach((doc) => {
      agencyNameById.set(doc.id, doc.exists ? doc.data()?.name || "" : "");
    });
  }

  const totalByCurrency = emptyCurrencyTotals();
  const agencyRows = new Map();
  const applicantIds = new Set();

  paymentRows.forEach(({ applicantId, payment }) => {
    const applicant = applicantById.get(applicantId) || {};
    const currency = normalizeCurrency(payment.currency || applicant.paymentCurrency || applicant.currency);
    const amount = Number(payment.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;

    applicantIds.add(applicantId);
    totalByCurrency[currency] += amount;

    const agencyId = applicant.agencyId || "unknown";
    if (!agencyRows.has(agencyId)) {
      agencyRows.set(agencyId, {
        agencyId,
        agencyName: applicant.agencyName || agencyNameById.get(agencyId) || "Unknown Agent",
        receivedByCurrency: emptyCurrencyTotals()
      });
    }
    agencyRows.get(agencyId).receivedByCurrency[currency] += amount;
  });

  return {
    totalByCurrency,
    applicantCount: applicantIds.size,
    paymentCount: paymentRows.length,
    applicantIds: [...applicantIds],
    agencies: [...agencyRows.values()].sort((a, b) => {
      const left = a.receivedByCurrency || {};
      const right = b.receivedByCurrency || {};
      return (
        Number(right.INR || 0) - Number(left.INR || 0) ||
        Number(right.EUR || 0) - Number(left.EUR || 0) ||
        Number(right.USD || 0) - Number(left.USD || 0) ||
        String(a.agencyName || "").localeCompare(String(b.agencyName || ""))
      );
    })
  };
}

async function buildAgencyPaymentRows({ role, userId, agencyId, docs }) {
  const agencyIds = new Set();
  docs.forEach((doc) => {
    const data = doc.data() || {};
    if (data.agencyId) agencyIds.add(data.agencyId);
  });

  let agencyDocs = [];
  if (isSuperUserLikeRole(role)) {
    agencyDocs = (await db.collection("agencies").get()).docs;
  } else if (role === "AGENCY") {
    const currentAgencyId = agencyId || userId;
    if (currentAgencyId) {
      const agencyDoc = await db.collection("agencies").doc(currentAgencyId).get();
      agencyDocs = agencyDoc.exists ? [agencyDoc] : [];
    }
  }

  agencyDocs.forEach((doc) => agencyIds.add(doc.id));

  const agencyNameById = new Map();
  agencyDocs.forEach((doc) => {
    agencyNameById.set(doc.id, doc.data()?.name || "");
  });

  const missingAgencyIds = [...agencyIds].filter((id) => id && !agencyNameById.has(id));
  if (missingAgencyIds.length) {
    const missingDocs = await db.getAll(...missingAgencyIds.map((id) => db.collection("agencies").doc(id)));
    missingDocs.forEach((doc) => {
      agencyNameById.set(doc.id, doc.exists ? doc.data()?.name || "" : "");
    });
  }

  const rows = new Map();
  [...agencyIds].forEach((id) => {
    if (!id) return;
    rows.set(id, {
      agencyId: id,
      agencyName: agencyNameById.get(id) || "Unknown Agency",
      pendingByCurrency: { INR: 0, EUR: 0, USD: 0 }
    });
  });

  return { rows, agencyNameById };
}

async function getDashboard({ user, query }) {
  const role = user.role;
  const userId = user.uid;
  const { companyId = "", agencyId = "", fromDate = "", toDate = "" } = query;

  let firestoreQuery = db.collection("applicants");
  let filterApprovedForEmployer = false;

  if (role === "AGENCY") {
    if (!user.agencyId) {
      throw new AppError("Agency scope unavailable", 403);
    }
    firestoreQuery = firestoreQuery.where("agencyId", "==", user.agencyId);
  } else if (role === "EMPLOYER") {
    const linkedCompanyIds = await resolveEmployerCompanyIds(userId, user.employerId || null);
    firestoreQuery = linkedCompanyIds.length === 1
      ? firestoreQuery.where("companyId", "==", linkedCompanyIds[0])
      : firestoreQuery.where("companyId", "in", linkedCompanyIds.slice(0, 10));
    filterApprovedForEmployer = true;
  }

  if (companyId) {
    firestoreQuery = firestoreQuery.where("companyId", "==", companyId);
  }

  if (agencyId && isSuperUserLikeRole(role)) {
    firestoreQuery = firestoreQuery.where("agencyId", "==", agencyId);
  }

  const normalizedFromDate = toTimestamp(fromDate);
  const normalizedToDate = toTimestamp(toDate);

  if (fromDate && !normalizedFromDate) {
    throw new AppError("Invalid fromDate", 400);
  }

  if (toDate && !normalizedToDate) {
    throw new AppError("Invalid toDate", 400);
  }

  const snapshot = await firestoreQuery.get();
  let scopedDocs = snapshot.docs;

  if (role === "AGENCY" && user.agencyId !== userId) {
    let legacyAgencyQuery = db.collection("applicants").where("agencyId", "==", userId);
    if (companyId) {
      legacyAgencyQuery = legacyAgencyQuery.where("companyId", "==", companyId);
    }
    const legacyAgencySnapshot = await legacyAgencyQuery.get();
    const docsById = new Map(scopedDocs.map((doc) => [doc.id, doc]));
    legacyAgencySnapshot.docs.forEach((doc) => docsById.set(doc.id, doc));
    scopedDocs = Array.from(docsById.values());
  }

  const { from, to } = getDateRange(fromDate, toDate);
  const now = new Date();
  const canSeeUploadPendingCards = role !== "EMPLOYER";
  const canSeeWorkflowPendingCards = role === "AGENCY" || isSuperUserLikeRole(role);
  const shouldBuildPaymentData = role !== "EMPLOYER";
  const isAccountant = role === "JUNIOR_ACCOUNTANT" || role === "SENIOR_ACCOUNTANT";

  const home = {
    dateRange: {
      fromDate: fromDate || "",
      toDate: toDate || ""
    },
    upcoming: {
      arriving: createMetric("arriving", "Applicants Arriving", "arriving", "blue"),
      visaCollection: createMetric("visaCollection", "Visa Collection", "visa_collection", "green"),
      embassyInterview: createMetric("embassyInterview", "Embassy Interviews", "embassy_interview", "purple"),
      embassyAppointment: createMetric("embassyAppointment", "Embassy Appointments", "embassy_appointment", "orange")
    },
    overdue: {},
    payments: {
      applicantsWithPendingPayment: 0,
      pendingByCurrency: {
        INR: 0,
        EUR: 0,
        USD: 0
      },
      stages: {
        afterApproval: createPaymentStage("afterApproval", "After Approval", 20, "payment_after_approval", "red"),
        afterEmbassyAppointment: createPaymentStage("afterEmbassyAppointment", "After Embassy Appointment", 60, "payment_after_embassy_appointment", "orange"),
        afterEmbassyInterview: createPaymentStage("afterEmbassyInterview", "After Embassy Interview", 60, "payment_after_embassy_interview", "purple"),
        afterVisaCollection: createPaymentStage("afterVisaCollection", "After Visa Collection", 100, "payment_after_visa_collection", "blue"),
        afterTrc: createPaymentStage("afterTrc", "After TRC Added", 100, "payment_after_trc", "green")
      }
    }
  };

  if (canSeeUploadPendingCards) {
    home.overdue.trpPending = createMetric("trpPending", "TRC Upload Pending", "trp_pending", "blue");
    home.overdue.interviewBiometricPending = createMetric("interviewBiometricPending", "Biometric Upload Pending", "interview_biometric_pending", "blue");
    home.overdue.appointmentBiometricPending = createMetric("appointmentBiometricPending", "Biometric Upload Pending", "appointment_biometric_pending", "blue");
  }

  if (canSeeWorkflowPendingCards) {
    home.overdue.arrivalTicketPending = createMetric("arrivalTicketPending", "Arrival Ticket Upload Pending", "arrival_ticket_pending", "orange");
    home.overdue.documentDispatchPending = createMetric("documentDispatchPending", "Document Dispatch Pending", "document_dispatch_pending", "purple");
  }

  const summary = {
    totalApplicants: 0,
    completed: 0,
    ongoing: 0,
    stageCounts: {},
    alerts: {
      pendingDocs: 0,
      pendingApproval: 0
    },
    payments: {
      totalCollected: 0,
      totalPending: 0
    },
    home
  };

  if (isAccountant) {
    summary.home.accountantPayments = await buildAccountantPaymentDashboard({ applicantDocs: scopedDocs, from, to });
    return summary;
  }

  const docs = filterApprovedForEmployer
    ? scopedDocs.filter((doc) => {
        const data = doc.data() || {};
        const status = String(data.approvalStatus || "").toLowerCase();
        return status === "approved";
      })
    : scopedDocs;
  const agencyPaymentRows = shouldBuildPaymentData
    ? (await buildAgencyPaymentRows({
        role,
        userId,
        agencyId: user.agencyId || "",
        docs
      })).rows
    : new Map();

  for (const doc of docs) {
    const data = doc.data() || {};
    const payment = shouldBuildPaymentData ? resolveApplicantPaymentSnapshot(data) : { paid: 0, pending: 0 };
    const paymentStage = shouldBuildPaymentData ? resolveApplicantPaymentStage(data, payment) : { pending: 0, key: "" };
    const stage = Number(data.stage || 1);
    const appointmentDate = resolveWorkflowDate(data?.embassyAppointment?.dateTime, data?.embassyAppointment?.date, data?.embassyAppointment?.createdAt);
    const interviewDate = resolveWorkflowDate(data?.embassyInterview?.dateTime, data?.embassyInterview?.date, data?.embassyInterview?.createdAt);
    const visaCollectionDate = resolveWorkflowDate(data?.visaCollection?.dateTime, data?.visaCollection?.date, data?.visaCollection?.createdAt);
    const arrivalDate = resolveWorkflowDate(data?.visaTravel?.dateTime, data?.visaTravel?.date, data?.visaTravel?.createdAt);

    summary.totalApplicants += 1;
    summary.stageCounts[stage] = (summary.stageCounts[stage] || 0) + 1;

    if (stage === 2) summary.alerts.pendingDocs += 1;
    if ([4, 5, 7, 9].includes(stage)) summary.alerts.pendingApproval += 1;
    if (stage >= 13) summary.completed += 1;
    else summary.ongoing += 1;

    summary.payments.totalCollected += payment.paid;
    summary.payments.totalPending += payment.pending;

    if (stage < 13 && isWithinRange(arrivalDate, from, to)) summary.home.upcoming.arriving.count += 1;
    if (stage < 12 && isWithinRange(visaCollectionDate, from, to)) summary.home.upcoming.visaCollection.count += 1;
    if (stage < 9 && isWithinRange(interviewDate, from, to)) summary.home.upcoming.embassyInterview.count += 1;
    if (stage < 7 && isWithinRange(appointmentDate, from, to)) summary.home.upcoming.embassyAppointment.count += 1;

    if (canSeeUploadPendingCards && stage === 11 && visaCollectionDate && visaCollectionDate < now && !hasResidencePermit(data)) {
      summary.home.overdue.trpPending.count += 1;
    }
    if (canSeeUploadPendingCards && stage === 9 && interviewDate && interviewDate < now && !data?.interviewBiometric?.fileUrl) {
      summary.home.overdue.interviewBiometricPending.count += 1;
    }
    if (canSeeUploadPendingCards && stage === 7 && appointmentDate && appointmentDate < now && !data?.biometricSlip?.fileUrl) {
      summary.home.overdue.appointmentBiometricPending.count += 1;
    }
    if (canSeeWorkflowPendingCards && stage === 12 && visaCollectionDate && visaCollectionDate < now && !hasArrivalTicketDetails(data)) {
      summary.home.overdue.arrivalTicketPending.count += 1;
    }
    if (
      canSeeWorkflowPendingCards &&
      stage >= 2 &&
      stage < 7 &&
      String(data.approvalStatus || "").toLowerCase() === "approved" &&
      !hasDocumentDispatch(data)
    ) {
      summary.home.overdue.documentDispatchPending.count += 1;
    }
    if (paymentStage.pending > 0 && paymentStage.key) {
      summary.home.payments.applicantsWithPendingPayment += 1;
      if (Object.prototype.hasOwnProperty.call(summary.home.payments.pendingByCurrency, payment.currency)) {
        summary.home.payments.pendingByCurrency[payment.currency] += paymentStage.pending;
      }
      const agencyRow = agencyPaymentRows.get(data.agencyId || "");
      if (agencyRow && Object.prototype.hasOwnProperty.call(agencyRow.pendingByCurrency, payment.currency)) {
        agencyRow.pendingByCurrency[payment.currency] += paymentStage.pending;
      }
      const stageKeyMap = {
        after_approval: "afterApproval",
        after_embassy_appointment: "afterEmbassyAppointment",
        after_embassy_interview: "afterEmbassyInterview",
        after_visa_collection: "afterVisaCollection",
        after_trc: "afterTrc"
      };
      const metric = summary.home.payments.stages[stageKeyMap[paymentStage.key]];
      if (metric) {
        metric.count += 1;
        if (Object.prototype.hasOwnProperty.call(metric.pendingByCurrency, payment.currency)) {
          metric.pendingByCurrency[payment.currency] += paymentStage.pending;
        }
      }
    }

  }

  summary.home.payments.agencies = [...agencyPaymentRows.values()]
    .sort((a, b) => {
      const left = a.pendingByCurrency || {};
      const right = b.pendingByCurrency || {};
      return (
        Number(right.INR || 0) - Number(left.INR || 0) ||
        Number(right.EUR || 0) - Number(left.EUR || 0) ||
        Number(right.USD || 0) - Number(left.USD || 0) ||
        String(a.agencyName || "").localeCompare(String(b.agencyName || ""))
      );
    });

  return summary;
}

module.exports = { getDashboard };

const { db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");

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

function resolveWorkflowDate(...values) {
  for (const value of values) {
    const date = toDate(value);
    if (date) return date;
  }
  return null;
}

async function resolvePayment(applicant, applicantId) {
  const summary = applicant?.paymentSummary?.applicant || {};
  const total = Number(summary.total ?? applicant?.totalApplicantPayment ?? applicant?.totalAmount ?? applicant?.totalPayment ?? 0);
  const hasStoredPaid =
    summary.paid !== undefined ||
    applicant?.amountPaid !== undefined ||
    applicant?.paidAmount !== undefined;
  let paid = Number(summary.paid ?? applicant?.amountPaid ?? applicant?.paidAmount ?? 0);
  if (!hasStoredPaid && applicantId) {
    const paymentsSnap = await db.collection("applicants").doc(applicantId).collection("payments").get();
    paymentsSnap.forEach((paymentDoc) => {
      const payment = paymentDoc.data() || {};
      if (payment.type === "APPLICANT") paid += Number(payment.amount || 0);
    });
  }
  const pending = Math.max(0, total - paid);
  const currency = String(summary.currency || applicant?.paymentCurrency || applicant?.currency || "INR").toUpperCase();
  return { total, paid, pending, currency };
}

function createMetric(key, label, filter, tone = "blue") {
  return { key, label, filter, tone, count: 0 };
}

async function getDashboard({ user, query }) {
  const role = user.role;
  const userId = user.uid;
  const { companyId = "", agencyId = "", fromDate = "", toDate = "" } = query;

  let firestoreQuery = db.collection("applicants");

  if (role === "AGENCY") {
    if (!user.agencyId) {
      throw new AppError("Agency scope unavailable", 403);
    }
    firestoreQuery = firestoreQuery.where("agencyId", "==", user.agencyId);
  } else if (role === "EMPLOYER") {
    firestoreQuery = firestoreQuery.where("employerIds", "array-contains", userId);
  }

  if (companyId) {
    firestoreQuery = firestoreQuery.where("companyId", "==", companyId);
  }

  if (agencyId && role === "SUPER_USER") {
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
  const { from, to } = getDateRange(fromDate, toDate);
  const now = new Date();

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
    overdue: {
      trpPending: createMetric("trpPending", "TRP Upload Pending", "trp_pending", "blue"),
      interviewBiometricPending: createMetric("interviewBiometricPending", "Biometric Upload Pending", "interview_biometric_pending", "blue"),
      appointmentBiometricPending: createMetric("appointmentBiometricPending", "Biometric Upload Pending", "appointment_biometric_pending", "blue")
    },
    payments: {
      applicantsWithPendingPayment: 0,
      pendingByCurrency: {
        INR: 0,
        EUR: 0,
        USD: 0
      }
    }
  };

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

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const payment = await resolvePayment(data, doc.id);
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

    if (isWithinRange(arrivalDate, from, to)) summary.home.upcoming.arriving.count += 1;
    if (isWithinRange(visaCollectionDate, from, to)) summary.home.upcoming.visaCollection.count += 1;
    if (isWithinRange(interviewDate, from, to)) summary.home.upcoming.embassyInterview.count += 1;
    if (isWithinRange(appointmentDate, from, to)) summary.home.upcoming.embassyAppointment.count += 1;

    if (visaCollectionDate && visaCollectionDate < now && !hasResidencePermit(data)) {
      summary.home.overdue.trpPending.count += 1;
    }
    if (interviewDate && interviewDate < now && !data?.interviewBiometric?.fileUrl) {
      summary.home.overdue.interviewBiometricPending.count += 1;
    }
    if (appointmentDate && appointmentDate < now && !data?.biometricSlip?.fileUrl) {
      summary.home.overdue.appointmentBiometricPending.count += 1;
    }
    if (payment.pending > 0) {
      summary.home.payments.applicantsWithPendingPayment += 1;
      if (Object.prototype.hasOwnProperty.call(summary.home.payments.pendingByCurrency, payment.currency)) {
        summary.home.payments.pendingByCurrency[payment.currency] += payment.pending;
      }
    }

  }

  return summary;
}

module.exports = { getDashboard };

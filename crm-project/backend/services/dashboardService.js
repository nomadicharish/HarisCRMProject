const { db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");

function toTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

  if (normalizedFromDate) {
    firestoreQuery = firestoreQuery.where("createdAt", ">=", normalizedFromDate);
  }

  if (normalizedToDate) {
    firestoreQuery = firestoreQuery.where("createdAt", "<=", normalizedToDate);
  }

  const snapshot = await firestoreQuery.get();

  return snapshot.docs.reduce((summary, doc) => {
    const data = doc.data() || {};
    const totalPayment = Number(data.totalPayment || 0);
    const stage = Number(data.stage || 1);
    const payments = Array.isArray(data.payments) ? data.payments : [];
    const paid = payments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);

    summary.totalApplicants += 1;
    summary.stageCounts[stage] = (summary.stageCounts[stage] || 0) + 1;

    if (stage === 2) summary.alerts.pendingDocs += 1;
    if ([4, 5, 7, 9].includes(stage)) summary.alerts.pendingApproval += 1;
    if (stage >= 12) summary.completed += 1;
    else summary.ongoing += 1;

    summary.payments.totalCollected += paid;
    summary.payments.totalPending += totalPayment - paid;

    return summary;
  }, {
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
    }
  });
}

module.exports = { getDashboard };

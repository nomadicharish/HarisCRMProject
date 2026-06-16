const { db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { readEncryptedUserEmail } = require("./accountService");
const { sendEmail } = require("./emailService");
const { decryptText } = require("../utils/crypto");
const { ADMIN_ROLE, SUPER_USER_ROLE } = require("../utils/roles");

const DAILY_NOTIFICATION_COLLECTION = "dailyNotificationEvents";
const DAILY_RUN_COLLECTION = "dailyNotificationRuns";
const DEFAULT_TIME_ZONE = process.env.DAILY_EMAIL_TIMEZONE || "Asia/Kolkata";
const DEFAULT_SEND_HOUR = Number(process.env.DAILY_EMAIL_SEND_HOUR || 8);

const EMPLOYER_ACTIONS = {
  CONTRACT_ISSUED: "Contract issued",
  EMBASSY_APPOINTMENT_INITIATED: "Embassy appointment initiated",
  EMBASSY_INTERVIEW_INITIATED: "Embassy interview initiated",
  VISA_COLLECTION_INITIATED: "Visa collection initiated"
};

const ADMIN_ACTIONS = {
  CONTRACT_APPROVED: "Contract approved",
  EMBASSY_APPOINTMENT_APPROVED: "Embassy appointment approved",
  EMBASSY_INTERVIEW_APPROVED: "Embassy interview approved",
  VISA_COLLECTION_APPROVED: "Visa collection approved"
};

const AGENCY_ACTIONS = {
  APPLICANT_ADDED: "Applicants added",
  DOCUMENT_UPLOADED: "Documents uploaded",
  DOCUMENT_DISPATCHED: "Documents dispatched",
  SIGNED_CONTRACT_UPLOADED: "Signed contract uploaded",
  EMBASSY_APPOINTMENT_COMPLETED: "Embassy appointment completed",
  EMBASSY_INTERVIEW_COMPLETED: "Embassy interview completed",
  VISA_COLLECTION_COMPLETED: "Visa collection completed",
  ARRIVAL_DETAILS_ADDED: "Arrival details added"
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getDateKey(date = new Date(), offsetDays = 0, timeZone = DEFAULT_TIME_ZONE) {
  const shifted = new Date(date.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(shifted);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getHourInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value || 0);
}

function getApplicantDisplayName(applicant = {}) {
  return (
    applicant.fullName ||
    [applicant?.personalDetails?.firstName || applicant.firstName, applicant?.personalDetails?.lastName || applicant.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Applicant"
  );
}

async function getUserName(uid = "") {
  if (!uid) return "";
  const doc = await db.collection("users").doc(uid).get();
  return doc.exists ? doc.data()?.name || "" : "";
}

async function getAgency(agencyId = "") {
  if (!agencyId) return null;
  const doc = await db.collection("agencies").doc(agencyId).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  const email = data.emailEncrypted ? await decryptText(data.emailEncrypted) : data.email || "";
  return {
    id: doc.id,
    name: data.name || "",
    email
  };
}

async function getEmployerName(user = {}) {
  if (user?.employerId) {
    const employerDoc = await db.collection("employers").doc(user.employerId).get();
    if (employerDoc.exists && employerDoc.data()?.name) return employerDoc.data().name;
  }
  return getUserName(user?.uid);
}

async function getAdminRecipientEmails() {
  const [superUsers, admins] = await Promise.all([
    db.collection("users").where("role", "==", SUPER_USER_ROLE).get(),
    db.collection("users").where("role", "==", ADMIN_ROLE).get()
  ]);
  const recipients = new Set();
  await Promise.all([...superUsers.docs, ...admins.docs].map(async (doc) => {
    const email = await readEncryptedUserEmail(doc.data());
    if (email) recipients.add(email);
  }));
  return Array.from(recipients);
}

async function addDailyEvent(payload = {}) {
  const now = new Date();
  await db.collection(DAILY_NOTIFICATION_COLLECTION).add({
    ...payload,
    dateKey: payload.dateKey || getDateKey(now),
    createdAt: now,
    emailedAt: null
  });
}

async function safeAddDailyEvent(payload = {}) {
  try {
    await addDailyEvent(payload);
  } catch (error) {
    logger.error("Daily notification event logging failed", {
      type: payload?.type || "",
      applicantId: payload?.applicantId || "",
      message: error?.message,
      stack: error?.stack
    });
  }
}

async function recordEmployerWorkflowInitiated({ applicantId, applicant = {}, user = {}, actionKey }) {
  if (user?.role !== "EMPLOYER") return;
  await safeAddDailyEvent({
    type: "EMPLOYER_WORKFLOW_INITIATED",
    actionKey,
    actionLabel: EMPLOYER_ACTIONS[actionKey] || actionKey,
    applicantId,
    applicantName: getApplicantDisplayName(applicant),
    actorId: user.uid || "",
    actorRole: user.role || "",
    actorName: await getEmployerName(user),
    agencyId: applicant.agencyId || "",
    companyId: applicant.companyId || ""
  });
}

async function recordAdminApproval({ applicantId, applicant = {}, user = {}, actionKey }) {
  await safeAddDailyEvent({
    type: "ADMIN_APPROVAL",
    actionKey,
    actionLabel: ADMIN_ACTIONS[actionKey] || actionKey,
    applicantId,
    applicantName: getApplicantDisplayName(applicant),
    actorId: user.uid || "",
    actorRole: user.role || "",
    actorName: await getUserName(user.uid),
    agencyId: applicant.agencyId || "",
    companyId: applicant.companyId || ""
  });
}

async function recordAgencyTask({ applicantId, applicant = {}, user = {}, actionKey }) {
  if (user?.role !== "AGENCY") return;
  const agencyId = user.agencyId || applicant.agencyId || "";
  const agency = await getAgency(agencyId);
  await safeAddDailyEvent({
    type: "AGENCY_DAILY_TASK",
    actionKey,
    actionLabel: AGENCY_ACTIONS[actionKey] || actionKey,
    applicantId,
    applicantName: getApplicantDisplayName(applicant),
    actorId: user.uid || "",
    actorRole: user.role || "",
    agencyId,
    agencyName: agency?.name || applicant.agencyName || "",
    companyId: applicant.companyId || ""
  });
}

function buildRowsHtml(rows = []) {
  return `
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
      <thead><tr>${rows[0].map((cell) => `<th align="left">${escapeHtml(cell)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function buildRowsText(rows = []) {
  return rows.map((row) => row.join(" | ")).join("\n");
}

async function getEvents(dateKey, type) {
  const snap = await db
    .collection(DAILY_NOTIFICATION_COLLECTION)
    .where("dateKey", "==", dateKey)
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((event) => event.type === type);
}

async function sendEmployerWorkflowSummary(dateKey) {
  const events = await getEvents(dateKey, "EMPLOYER_WORKFLOW_INITIATED");
  if (!events.length) return { skipped: true, reason: "no_events" };

  const recipients = await getAdminRecipientEmails();
  const rows = [
    ["Applicant", "Action", "Employer"],
    ...events.map((event) => [
      event.applicantName || "Applicant",
      event.actionLabel || event.actionKey || "-",
      event.actorName || "Employer"
    ])
  ];

  return sendEmail({
    to: recipients,
    subject: `Employer workflow actions - ${dateKey}`,
    text: [`Total applicants: ${new Set(events.map((event) => event.applicantId)).size}`, "", buildRowsText(rows)].join("\n"),
    html: `<p>Total applicants: <strong>${new Set(events.map((event) => event.applicantId)).size}</strong></p>${buildRowsHtml(rows)}`
  });
}

async function sendAdminApprovalAgencySummaries(dateKey) {
  const events = await getEvents(dateKey, "ADMIN_APPROVAL");
  if (!events.length) return { skipped: true, reason: "no_events" };

  const byAgency = new Map();
  events.forEach((event) => {
    if (!event.agencyId) return;
    byAgency.set(event.agencyId, [...(byAgency.get(event.agencyId) || []), event]);
  });

  const results = [];
  for (const [agencyId, agencyEvents] of byAgency.entries()) {
    const agency = await getAgency(agencyId);
    if (!agency?.email) continue;
    const rows = [
      ["Applicant", "Action", "Approved by"],
      ...agencyEvents.map((event) => [
        event.applicantName || "Applicant",
        event.actionLabel || event.actionKey || "-",
        event.actorName || event.actorRole || "Admin"
      ])
    ];
    results.push(await sendEmail({
      to: agency.email,
      subject: `Admin approvals for your applicants - ${dateKey}`,
      text: [`Total applicants: ${new Set(agencyEvents.map((event) => event.applicantId)).size}`, "", buildRowsText(rows)].join("\n"),
      html: `<p>Total applicants: <strong>${new Set(agencyEvents.map((event) => event.applicantId)).size}</strong></p>${buildRowsHtml(rows)}`
    }));
  }

  return { sent: results.length };
}

async function sendAgencyDailyTaskSummary(dateKey) {
  const events = await getEvents(dateKey, "AGENCY_DAILY_TASK");
  if (!events.length) return { skipped: true, reason: "no_events" };

  const recipients = await getAdminRecipientEmails();
  const grouped = new Map();
  events.forEach((event) => {
    const agencyName = event.agencyName || event.agencyId || "Agency";
    const key = `${agencyName}__${event.actionKey || ""}`;
    const current = grouped.get(key) || {
      agencyName,
      actionLabel: event.actionLabel || event.actionKey || "-",
      applicantIds: new Set()
    };
    current.applicantIds.add(event.applicantId || `${event.actorId}_${event.createdAt?.seconds || Date.now()}`);
    grouped.set(key, current);
  });

  const rows = [
    ["Agency", "Task", "Applicant count"],
    ...Array.from(grouped.values())
      .sort((a, b) => a.agencyName.localeCompare(b.agencyName) || a.actionLabel.localeCompare(b.actionLabel))
      .map((item) => [item.agencyName, item.actionLabel, String(item.applicantIds.size)])
  ];

  return sendEmail({
    to: recipients,
    subject: `Agency daily task summary - ${dateKey}`,
    text: buildRowsText(rows),
    html: buildRowsHtml(rows)
  });
}

async function runDailyNotificationSummaries(dateKey = getDateKey(new Date(), -1)) {
  const runRef = db.collection(DAILY_RUN_COLLECTION).doc(dateKey);
  const runDoc = await runRef.get();
  if (runDoc.exists && runDoc.data()?.completedAt) {
    return { skipped: true, reason: "already_completed", dateKey };
  }

  await runRef.set({ startedAt: new Date(), dateKey }, { merge: true });
  const [employerWorkflow, adminApprovals, agencyTasks] = await Promise.all([
    sendEmployerWorkflowSummary(dateKey),
    sendAdminApprovalAgencySummaries(dateKey),
    sendAgencyDailyTaskSummary(dateKey)
  ]);
  await runRef.set({
    completedAt: new Date(),
    employerWorkflow,
    adminApprovals,
    agencyTasks
  }, { merge: true });

  return { dateKey, employerWorkflow, adminApprovals, agencyTasks };
}

function startDailyNotificationScheduler() {
  if (String(process.env.DISABLE_DAILY_EMAIL_SCHEDULER || "").toLowerCase() === "true") return;

  async function tick() {
    try {
      if (getHourInTimeZone(new Date()) < DEFAULT_SEND_HOUR) return;
      await runDailyNotificationSummaries(getDateKey(new Date(), -1));
    } catch (error) {
      logger.error("Daily notification scheduler failed", {
        message: error?.message,
        stack: error?.stack
      });
    }
  }

  setTimeout(tick, 30_000).unref?.();
  const timer = setInterval(tick, 15 * 60 * 1000);
  timer.unref?.();
}

module.exports = {
  recordAdminApproval,
  recordAgencyTask,
  recordEmployerWorkflowInitiated,
  runDailyNotificationSummaries,
  startDailyNotificationScheduler
};

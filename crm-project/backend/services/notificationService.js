const { db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { readEncryptedUserEmail } = require("./accountService");
const { sendEmail } = require("./emailService");
const { decryptText } = require("../utils/crypto");
const { JUNIOR_ACCOUNTANT_ROLE, SENIOR_ACCOUNTANT_ROLE, SUPER_USER_ROLE } = require("../utils/roles");

const DAILY_NOTIFICATION_COLLECTION = "dailyNotificationEvents";
const DAILY_RUN_COLLECTION = "dailyNotificationRuns";
const APP_NOTIFICATION_COLLECTION = "notificationEvents";
const NOTIFICATION_READ_COLLECTION = "notificationReadStates";
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

const ACTION_META = {
  APPLICANT_ADDED: { title: "Applicant Created", tone: "blue", icon: "document", verb: "created applicant" },
  APPLICANT_APPROVED: { title: "Applicant Approved", tone: "cyan", icon: "shield", verb: "approved applicant" },
  DOCUMENT_UPLOADED: { title: "Document Uploaded", tone: "pink", icon: "document", verb: "uploaded document" },
  DOCUMENT_APPROVED: { title: "Document Approved", tone: "green", icon: "document", verb: "approved document" },
  DOCUMENT_REJECTED: { title: "Document Rejected", tone: "pink", icon: "document", verb: "rejected document" },
  DOCUMENT_DISPATCHED: { title: "Dispatch Details Added", tone: "orange", icon: "calendar", verb: "added dispatch details" },
  CONTRACT_ISSUED: { title: "Contract Issued", tone: "blue", icon: "document", verb: "issued contract" },
  CONTRACT_APPROVED: { title: "Contract Approved", tone: "green", icon: "shield", verb: "approved contract" },
  SIGNED_CONTRACT_UPLOADED: { title: "Signed Contract Uploaded", tone: "purple", icon: "document", verb: "uploaded signed contract" },
  SIGNED_CONTRACT_REJECTED: { title: "Signed Contract Rejected", tone: "pink", icon: "document", verb: "rejected signed contract" },
  TRAVEL_DETAILS_ADDED: { title: "Travel Details Added", tone: "blue", icon: "calendar", verb: "added travel details" },
  VISA_COLLECTION_TRAVEL_ADDED: { title: "Visa Collection Travel Added", tone: "blue", icon: "calendar", verb: "added visa collection travel details" },
  PAYMENT_ADDED: { title: "Payment Added", tone: "blue", icon: "wallet", verb: "added payment details" },
  PAYMENT_ACKNOWLEDGED: { title: "Payment Acknowledged", tone: "blue", icon: "wallet", verb: "acknowledged payment" },
  PAYMENT_CONFIRMED: { title: "Payment Confirmation", tone: "green", icon: "wallet", verb: "confirmed payment" },
  BIOMETRIC_SLIP_UPLOADED: { title: "Biometric Slip Uploaded", tone: "purple", icon: "fingerprint", verb: "uploaded biometric slip" },
  BIOMETRIC_UPDATED: { title: "Biometric Updated", tone: "green", icon: "fingerprint", verb: "updated biometric" },
  EMBASSY_APPOINTMENT_INITIATED: { title: "Embassy Appointment Added", tone: "orange", icon: "calendar", verb: "added embassy appointment" },
  EMBASSY_APPOINTMENT_APPROVED: { title: "Embassy Appointment Approved", tone: "orange", icon: "calendar", verb: "approved embassy appointment" },
  EMBASSY_APPOINTMENT_COMPLETED: { title: "Biometric Slip Uploaded", tone: "purple", icon: "fingerprint", verb: "uploaded biometric slip" },
  EMBASSY_INTERVIEW_INITIATED: { title: "Embassy Interview Scheduled", tone: "purple", icon: "building", verb: "scheduled embassy interview" },
  EMBASSY_INTERVIEW_APPROVED: { title: "Embassy Interview Approved", tone: "purple", icon: "building", verb: "approved embassy interview" },
  EMBASSY_INTERVIEW_COMPLETED: { title: "Biometric Updated", tone: "green", icon: "fingerprint", verb: "updated biometric" },
  VISA_COLLECTION_INITIATED: { title: "Visa Collection Added", tone: "green", icon: "document", verb: "added visa collection" },
  VISA_COLLECTION_APPROVED: { title: "Visa Collection Approved", tone: "green", icon: "document", verb: "approved visa collection" },
  VISA_COLLECTION_COMPLETED: { title: "Visa Collection Travel Added", tone: "blue", icon: "calendar", verb: "added visa collection travel" },
  ARRIVAL_DETAILS_ADDED: { title: "Arrival Details Added", tone: "blue", icon: "send", verb: "added arrival details" },
  PROCESS_COMPLETED: { title: "Candidate Arrival Completed", tone: "green", icon: "send", verb: "marked candidate arrival and completion" },
  COMPANY_ASSIGNED: { title: "New Company Added", tone: "blue", icon: "building", verb: "added company" },
  TRC_ADDED: { title: "TRC Added", tone: "green", icon: "document", verb: "added TRC" }
};

const EMPLOYER_VISIBLE_AGENCY_ACTIONS = new Set([
  "DOCUMENT_DISPATCHED",
  "SIGNED_CONTRACT_UPLOADED",
  "TRAVEL_DETAILS_ADDED",
  "VISA_COLLECTION_TRAVEL_ADDED",
  "ARRIVAL_DETAILS_ADDED",
  "EMBASSY_APPOINTMENT_COMPLETED",
  "EMBASSY_INTERVIEW_COMPLETED",
  "VISA_COLLECTION_COMPLETED"
]);

const AGENCY_VISIBLE_ADMIN_ACTIONS = new Set([
  "APPLICANT_ADDED",
  "APPLICANT_APPROVED",
  "DOCUMENT_APPROVED",
  "DOCUMENT_REJECTED",
  "CONTRACT_APPROVED",
  "SIGNED_CONTRACT_REJECTED",
  "EMBASSY_APPOINTMENT_APPROVED",
  "EMBASSY_INTERVIEW_APPROVED",
  "VISA_COLLECTION_APPROVED",
  "PROCESS_COMPLETED"
]);

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

async function resolveActorName(user = {}, fallback = "") {
  return user?.name || user?.displayName || (user?.uid ? await getUserName(user.uid) : "") || fallback || "";
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
  const superUsers = await db.collection("users").where("role", "==", SUPER_USER_ROLE).get();
  const recipients = new Set();
  await Promise.all(superUsers.docs.map(async (doc) => {
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
    await addAppNotificationEvent(payload);
  } catch (error) {
    logger.error("Daily notification event logging failed", {
      type: payload?.type || "",
      applicantId: payload?.applicantId || "",
      message: error?.message,
      stack: error?.stack
    });
  }
}

function normalizeTimestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "object" && value._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function actorLabel(payload = {}) {
  if (payload.actorName) return payload.actorName;
  if (payload.agencyName) return payload.agencyName;
  if (payload.actorRole === "SUPER_USER") return "Super User";
  if (payload.actorRole === "EMPLOYER") return "Employer";
  if (payload.actorRole === "AGENCY") return "Agency";
  if (payload.actorRole === "JUNIOR_ACCOUNTANT") return "Junior Accountant";
  if (payload.actorRole === "SENIOR_ACCOUNTANT") return "Senior Accountant";
  return "User";
}

async function addAppNotificationEvent(payload = {}) {
  const actionKey = payload.actionKey || "";
  if (!actionKey) return;
  const meta = ACTION_META[actionKey] || { title: payload.actionLabel || actionKey, tone: "blue", icon: "document", verb: payload.actionLabel || "updated" };
  const now = new Date();
  await db.collection(APP_NOTIFICATION_COLLECTION).add({
    actionKey,
    actionLabel: payload.actionLabel || meta.title,
    title: meta.title,
    tone: meta.tone,
    icon: meta.icon,
    verb: meta.verb,
    applicantId: payload.applicantId || "",
    applicantIds: Array.isArray(payload.applicantIds) ? payload.applicantIds.filter(Boolean) : [],
    applicantName: payload.applicantName || "",
    actorId: payload.actorId || "",
    actorRole: payload.actorRole || "",
    actorName: actorLabel(payload),
    agencyId: payload.agencyId || "",
    agencyName: payload.agencyName || "",
    companyId: payload.companyId || "",
    employerId: payload.employerId || "",
    recipientRoles: Array.isArray(payload.recipientRoles) ? payload.recipientRoles.filter(Boolean) : [],
    recipientAgencyId: payload.recipientAgencyId || "",
    recipientCompanyId: payload.recipientCompanyId || "",
    recipientEmployerId: payload.recipientEmployerId || "",
    companyName: payload.companyName || "",
    createdAt: now
  });
}

async function recordCompanyAssignmentNotification({
  companyId = "",
  companyName = "",
  actor = {},
  recipientRole = "",
  recipientAgencyId = "",
  recipientEmployerId = ""
} = {}) {
  if (!companyId || !recipientRole) return;
  await safeAddDailyEvent({
    type: "APP_NOTIFICATION",
    actionKey: "COMPANY_ASSIGNED",
    actionLabel: ACTION_META.COMPANY_ASSIGNED.title,
    actorId: actor.uid || "",
    actorRole: actor.role || "SUPER_USER",
    actorName: actor.name || actor.displayName || "Super User",
    companyId,
    companyName,
    recipientRoles: [recipientRole],
    recipientAgencyId,
    recipientCompanyId: companyId,
    recipientEmployerId
  });
}

function defaultRecipientRoles({ actionKey, applicant = {}, user = {} } = {}) {
  if (actionKey === "PAYMENT_ADDED") return [SUPER_USER_ROLE, JUNIOR_ACCOUNTANT_ROLE, SENIOR_ACCOUNTANT_ROLE];
  if (actionKey === "PAYMENT_ACKNOWLEDGED" || actionKey === "PAYMENT_CONFIRMED") return [SUPER_USER_ROLE, SENIOR_ACCOUNTANT_ROLE];
  if (user?.role === "EMPLOYER") return [SUPER_USER_ROLE];
  if (user?.role === "AGENCY") {
    return [
      SUPER_USER_ROLE,
      ...(EMPLOYER_VISIBLE_AGENCY_ACTIONS.has(actionKey) ? ["EMPLOYER"] : [])
    ];
  }
  if (user?.role === SUPER_USER_ROLE) {
    return [
      ...(AGENCY_VISIBLE_ADMIN_ACTIONS.has(actionKey) ? ["AGENCY"] : []),
      ...(actionKey === "PROCESS_COMPLETED" ? ["EMPLOYER"] : [])
    ];
  }
  if (actionKey === "APPLICANT_ADDED" && applicant?.approvalStatus === "approved") return ["EMPLOYER"];
  return [SUPER_USER_ROLE];
}

async function recordNotificationAction({
  actionKey,
  applicantId,
  applicant = {},
  user = {},
  actorName = "",
  agencyName = "",
  employerId: employerIdOverride,
  recipientRoles,
  recipientAgencyId,
  recipientCompanyId,
  recipientEmployerId
} = {}) {
  const resolvedActorName = await resolveActorName(user, actorName);
  const resolvedRecipientRoles = Array.isArray(recipientRoles) && recipientRoles.length
    ? recipientRoles
    : defaultRecipientRoles({ actionKey, applicant, user });
  await safeAddDailyEvent({
    type: "APP_NOTIFICATION",
    actionKey,
    actionLabel: ACTION_META[actionKey]?.title || actionKey,
    applicantId,
    applicantName: getApplicantDisplayName(applicant),
    actorId: user.uid || "",
    actorRole: user.role || "",
    actorName: resolvedActorName,
    agencyId: user.role === "AGENCY" ? user.agencyId || applicant.agencyId || "" : applicant.agencyId || "",
    agencyName,
    companyId: applicant.companyId || "",
    employerId: typeof employerIdOverride !== "undefined" ? employerIdOverride : (user.employerId || applicant.employerId || ""),
    recipientRoles: resolvedRecipientRoles,
    recipientAgencyId: recipientAgencyId || applicant.agencyId || "",
    recipientCompanyId: recipientCompanyId || applicant.companyId || "",
    recipientEmployerId: typeof recipientEmployerId !== "undefined"
      ? recipientEmployerId
      : (typeof employerIdOverride !== "undefined" ? employerIdOverride : (user.employerId || applicant.employerId || ""))
  });
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
    companyId: applicant.companyId || "",
    recipientRoles: [SUPER_USER_ROLE],
    recipientAgencyId: applicant.agencyId || "",
    recipientCompanyId: applicant.companyId || "",
    recipientEmployerId: applicant.employerId || ""
  });
}

async function recordBulkContractUpload({ applicants = [], user = {}, companyId = "" } = {}) {
  const applicantIds = applicants.map((applicant) => applicant.id).filter(Boolean);
  if (!applicantIds.length) return;
  const actorName = user?.role === "EMPLOYER"
    ? await getEmployerName(user)
    : await resolveActorName(user, "Super User");
  const firstApplicant = applicants[0] || {};
  await safeAddDailyEvent({
    type: "APP_NOTIFICATION",
    actionKey: "CONTRACT_ISSUED",
    actionLabel: ACTION_META.CONTRACT_ISSUED.title,
    applicantIds,
    applicantId: applicantIds[0] || "",
    applicantName: getApplicantDisplayName(firstApplicant),
    actorId: user.uid || "",
    actorRole: user.role || "",
    actorName,
    agencyId: firstApplicant.agencyId || "",
    companyId: companyId || firstApplicant.companyId || "",
    employerId: user.employerId || firstApplicant.employerId || "",
    recipientRoles: user.role === "EMPLOYER" ? [SUPER_USER_ROLE] : ["EMPLOYER"],
    recipientAgencyId: firstApplicant.agencyId || "",
    recipientCompanyId: companyId || firstApplicant.companyId || "",
    recipientEmployerId: user.role === "EMPLOYER" ? "" : firstApplicant.employerId || ""
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
    companyId: applicant.companyId || "",
    employerId: applicant.employerId || "",
    recipientRoles: ["AGENCY"],
    recipientAgencyId: applicant.agencyId || "",
    recipientCompanyId: applicant.companyId || "",
    recipientEmployerId: applicant.employerId || ""
  });
}

async function recordAgencyTask({ applicantId, applicant = {}, user = {}, actionKey }) {
  if (user?.role !== "AGENCY") return;
  const agencyId = user.agencyId || applicant.agencyId || "";
  const agency = await getAgency(agencyId);
  const normalizedActionKey = actionKey === "DOCUMENT_DISPATCHED"
    ? "DOCUMENT_DISPATCHED"
    : actionKey === "SIGNED_CONTRACT_UPLOADED"
      ? "SIGNED_CONTRACT_UPLOADED"
      : actionKey === "DOCUMENT_UPLOADED"
        ? "DOCUMENT_UPLOADED"
        : actionKey;
  await safeAddDailyEvent({
    type: "AGENCY_DAILY_TASK",
    actionKey: normalizedActionKey,
    actionLabel: AGENCY_ACTIONS[actionKey] || ACTION_META[normalizedActionKey]?.title || actionKey,
    applicantId,
    applicantName: getApplicantDisplayName(applicant),
    actorId: user.uid || "",
    actorRole: user.role || "",
    actorName: await resolveActorName(user, agency?.name || applicant.agencyName || ""),
    agencyId,
    agencyName: agency?.name || applicant.agencyName || "",
    companyId: applicant.companyId || "",
    employerId: applicant.employerId || "",
    recipientRoles: defaultRecipientRoles({ actionKey: normalizedActionKey, applicant, user }),
    recipientAgencyId: agencyId,
    recipientCompanyId: applicant.companyId || "",
    recipientEmployerId: applicant.employerId || ""
  });
}

async function getEmployerCompanyIds(employerId = "") {
  if (!employerId) return [];
  const employerDoc = await db.collection("employers").doc(employerId).get();
  if (!employerDoc.exists) return [];
  const employer = employerDoc.data() || {};
  return Array.isArray(employer.companyIds) && employer.companyIds.length
    ? employer.companyIds
    : employer.companyId
      ? [employer.companyId]
      : [];
}

async function isEmployerTaggedToCompany(employerId = "", companyId = "") {
  if (!employerId || !companyId) return false;
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) return false;
  const company = companyDoc.data() || {};
  return Array.isArray(company.employerIds) && company.employerIds.includes(employerId);
}

async function getScopedEventsForUser(user = {}) {
  const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const snap = await db
    .collection(APP_NOTIFICATION_COLLECTION)
    .where("createdAt", ">=", since)
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();
  let events = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const hasExplicitRecipients = (event) => Array.isArray(event.recipientRoles) && event.recipientRoles.length > 0;
  const isExplicitRecipient = async (event) => {
    if (!hasExplicitRecipients(event)) return null;
    if (!event.recipientRoles.includes(user.role)) return false;
    if (user.role === "AGENCY") {
      const agencyId = user.agencyId || user.uid || "";
      return !event.recipientAgencyId || event.recipientAgencyId === agencyId || event.agencyId === agencyId;
    }
    if (user.role === "EMPLOYER") {
      const companyIds = await getEmployerCompanyIds(user.employerId);
      const isTaggedToCompany = await isEmployerTaggedToCompany(user.employerId, event.recipientCompanyId || event.companyId || "");
      return (
        !event.recipientEmployerId && !event.recipientCompanyId
      ) || event.recipientEmployerId === user.employerId || companyIds.includes(event.recipientCompanyId || "") || isTaggedToCompany;
    }
    return true;
  };

  const explicitChecks = await Promise.all(events.map((event) => isExplicitRecipient(event)));
  events = events.filter((event, index) => explicitChecks[index] === true || explicitChecks[index] === null);
  if (user.role === "AGENCY") {
    const agencyId = user.agencyId || user.uid || "";
    events = events.filter((event) => event.agencyId === agencyId || event.recipientAgencyId === agencyId);
    // Agents shouldn't receive notifications about their own document uploads; only admins should
    events = events.filter((event) => !(event.actionKey === "DOCUMENT_UPLOADED"));
  } else if (user.role === "EMPLOYER") {
    const companyIds = await getEmployerCompanyIds(user.employerId);
    const employerChecks = await Promise.all(events.map(async (event) => (
      companyIds.includes(event.companyId || "") ||
      event.employerId === user.employerId ||
      await isEmployerTaggedToCompany(user.employerId, event.companyId || event.recipientCompanyId || "")
    )));
    events = events.filter((event, index) => employerChecks[index]);
  }
  return events;
}

function buildNotificationMessage(group) {
  const actor = group.actorName || "User";
  const verb = group.verb || "updated";
  const count = group.count || group.applicantIds?.size || 0;
  if (group.actionKey === "COMPANY_ASSIGNED") {
    return `New company added: ${group.companyName || group.companyId || "Company"}.`;
  }
  // For creation verbs prefer "{Actor} created {n} applicants." phrasing
  if (/created applicant/i.test(verb) || /applicants added/i.test(group.title || "")) {
    return `${actor} created ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  }
  if (group.actionKey === "CONTRACT_ISSUED") return `${actor} added contract for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "APPLICANT_APPROVED") return `${actor} approved ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "DOCUMENT_APPROVED") return `${actor} approved document of ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "DOCUMENT_REJECTED") return `${actor} rejected document of ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "EMBASSY_APPOINTMENT_COMPLETED") return `${actor} uploaded biometric of embassy appointment for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "EMBASSY_INTERVIEW_COMPLETED") return `${actor} uploaded biometric of embassy interview for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "PROCESS_COMPLETED") return `${actor} marked candidate arrival and completion for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  return `${actor} ${verb} for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
}

function aggregateNotificationEvents(events = [], lastReadAtMs = 0) {
  const groups = new Map();
  events.forEach((event) => {
    const key = [event.actionKey, event.actorId || event.actorName || "", event.agencyId || "", event.companyId || ""].join("__");
    const createdAtMs = normalizeTimestampMs(event.createdAt);
    const current = groups.get(key) || {
      id: key,
      actionKey: event.actionKey || "",
      title: event.title || event.actionLabel || event.actionKey || "Notification",
      tone: event.tone || "blue",
      icon: event.icon || "document",
      verb: event.verb || "updated",
      actorName: event.actorName || "User",
      agencyId: event.agencyId || "",
      companyId: event.companyId || "",
      companyName: event.companyName || "",
      applicantIds: new Set(),
      unreadApplicantIds: new Set(),
      latestAt: createdAtMs,
      unread: false
    };
    const eventApplicantIds = Array.isArray(event.applicantIds) && event.applicantIds.length
      ? event.applicantIds
      : event.applicantId
        ? [event.applicantId]
        : [];
    eventApplicantIds.forEach((applicantId) => {
      current.applicantIds.add(applicantId);
      if (createdAtMs > lastReadAtMs) current.unreadApplicantIds.add(applicantId);
    });
    current.latestAt = Math.max(current.latestAt, createdAtMs);
    current.unread = current.unread || createdAtMs > lastReadAtMs;
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .sort((a, b) => b.latestAt - a.latestAt)
    .map((group) => {
      const applicantIds = Array.from(group.unread ? group.unreadApplicantIds : group.applicantIds);
      const { unreadApplicantIds, ...serializableGroup } = group;
      const item = {
        ...serializableGroup,
        applicantIds,
        count: applicantIds.length,
        latestAt: group.latestAt
      };
      return {
        ...item,
        message: buildNotificationMessage(item)
      };
    });
}

async function getNotificationReadState(userId = "") {
  if (!userId) return { lastReadAtMs: 0 };
  const doc = await db.collection(NOTIFICATION_READ_COLLECTION).doc(userId).get();
  return { lastReadAtMs: normalizeTimestampMs(doc.exists ? doc.data()?.lastReadAt : null) };
}

async function listNotificationsForUser(user = {}, { limit = 10, page = 1 } = {}) {
  const [{ lastReadAtMs }, events] = await Promise.all([
    getNotificationReadState(user.uid),
    getScopedEventsForUser(user)
  ]);
  const groups = aggregateNotificationEvents(events, lastReadAtMs);
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const offset = (safePage - 1) * safeLimit;
  return {
    items: groups.slice(offset, offset + safeLimit),
    unreadCount: groups.filter((item) => item.unread).length,
    total: groups.length,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(groups.length / safeLimit))
  };
}

async function markNotificationsRead(user = {}) {
  await db.collection(NOTIFICATION_READ_COLLECTION).doc(user.uid).set({
    userId: user.uid,
    lastReadAt: new Date(),
    updatedAt: new Date()
  }, { merge: true });
  return { message: "Notifications marked as read" };
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
  listNotificationsForUser,
  markNotificationsRead,
  recordAdminApproval,
  recordAgencyTask,
  recordCompanyAssignmentNotification,
  recordEmployerWorkflowInitiated,
  recordBulkContractUpload,
  recordNotificationAction,
  getUserName,
  runDailyNotificationSummaries,
  startDailyNotificationScheduler
};

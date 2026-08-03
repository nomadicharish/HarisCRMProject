const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { readEncryptedUserEmail } = require("./accountService");
const { sendEmail } = require("./emailService");
const { decryptText } = require("../utils/crypto");
const { JUNIOR_ACCOUNTANT_ROLE, SENIOR_ACCOUNTANT_ROLE, SUPER_USER_ROLE } = require("../utils/roles");

const DAILY_NOTIFICATION_COLLECTION = "dailyNotificationEvents";
const DAILY_RUN_COLLECTION = "dailyNotificationRuns";
const APP_NOTIFICATION_COLLECTION = "notificationEvents";
// Notification events are short lived once read. Keep the same bounded window
// for the badge and list so an obsolete workflow event can never be counted by
// the badge but omitted from the notification UI.
const NOTIFICATION_SCAN_LIMIT = 400;
const DEFAULT_TIME_ZONE = process.env.DAILY_EMAIL_TIMEZONE || "Asia/Kolkata";
const DEFAULT_SEND_HOUR = Number(process.env.DAILY_EMAIL_SEND_HOUR || 8);
// Recipient and employer records change infrequently. Caching these short-lived
// lookups prevents every notification from re-reading the same documents.
const RECIPIENT_LOOKUP_CACHE_TTL_MS = Number(process.env.NOTIFICATION_RECIPIENT_CACHE_TTL_MS || 60_000);
const recipientRoleCache = new Map();
const employerCache = new Map();
// Daily status emails are intentionally disabled. Notifications remain
// available in the application; transactional emails are unaffected.
const DAILY_STATUS_EMAILS_ENABLED = false;

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
  DOCUMENT_UPLOADED: { title: "Document Uploaded", tone: "pink", icon: "document", verb: "added documents" },
  DOCUMENT_APPROVED: { title: "Document Approved", tone: "green", icon: "document", verb: "approved document" },
  DOCUMENT_REJECTED: { title: "Document Rejected", tone: "pink", icon: "document", verb: "rejected document" },
  DOCUMENT_DISPATCHED: { title: "Dispatch Details Added", tone: "orange", icon: "calendar", verb: "added dispatch details" },
  CONTRACT_ISSUED: { title: "Contract Issued", tone: "blue", icon: "document", verb: "issued contract" },
  CONTRACT_APPROVED: { title: "Contract Approved", tone: "green", icon: "shield", verb: "approved contract" },
  SIGNED_CONTRACT_UPLOADED: { title: "Signed Contract Uploaded", tone: "purple", icon: "document", verb: "uploaded signed contract" },
  SIGNED_CONTRACT_REJECTED: { title: "Signed Contract Rejected", tone: "pink", icon: "document", verb: "rejected signed contract" },
  TRAVEL_DETAILS_ADDED: { title: "Travel Details Added", tone: "blue", icon: "calendar", verb: "added travel details" },
  TRAVEL_DETAILS_UPDATED: { title: "Travel Details Updated", tone: "blue", icon: "calendar", verb: "updated travel details" },
  VISA_COLLECTION_TRAVEL_ADDED: { title: "Visa Collection Travel Added", tone: "blue", icon: "calendar", verb: "added visa collection travel details" },
  VISA_COLLECTION_TRAVEL_UPDATED: { title: "Visa Collection Travel Updated", tone: "blue", icon: "calendar", verb: "updated visa collection travel details" },
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
  ARRIVAL_DETAILS_UPDATED: { title: "Arrival Details Updated", tone: "blue", icon: "send", verb: "updated arrival details" },
  PROCESS_COMPLETED: { title: "Candidate Arrival Completed", tone: "green", icon: "send", verb: "marked candidate arrival and completion" },
  COMPANY_ASSIGNED: { title: "New Company Added", tone: "blue", icon: "building", verb: "added company" },
  TRC_ADDED: { title: "TRC Added", tone: "green", icon: "document", verb: "added TRC" },
  TRC_UPDATED: { title: "TRC Updated", tone: "green", icon: "document", verb: "updated TRC" }
};

const EMPLOYER_VISIBLE_AGENCY_ACTIONS = new Set([
  "DOCUMENT_DISPATCHED",
  "SIGNED_CONTRACT_UPLOADED",
  "TRAVEL_DETAILS_ADDED",
  "TRAVEL_DETAILS_UPDATED",
  "VISA_COLLECTION_TRAVEL_ADDED",
  "VISA_COLLECTION_TRAVEL_UPDATED",
  "ARRIVAL_DETAILS_ADDED",
  "ARRIVAL_DETAILS_UPDATED",
  "EMBASSY_APPOINTMENT_COMPLETED",
  "EMBASSY_INTERVIEW_COMPLETED",
  "VISA_COLLECTION_COMPLETED"
]);

const AGENCY_VISIBLE_ADMIN_ACTIONS = new Set([
  "APPLICANT_ADDED",
  "APPLICANT_APPROVED",
  "DOCUMENT_APPROVED",
  "DOCUMENT_REJECTED",
  "CONTRACT_ISSUED",
  "EMBASSY_APPOINTMENT_INITIATED",
  "EMBASSY_INTERVIEW_INITIATED",
  "VISA_COLLECTION_INITIATED",
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
    // Daily status email delivery is disabled. Avoid an unused write for every
    // in-app notification; notificationEvents remains the UI source of truth.
    if (DAILY_STATUS_EMAILS_ENABLED) await addDailyEvent(payload);
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

function getUnreadNotificationGroupId({ actionKey = "", actorId = "", userId = "" } = {}) {
  return Buffer.from(`${actionKey}:${actorId}:${userId}`).toString("base64url");
}

async function getApplicantStages(applicantIds = []) {
  if (!applicantIds.length) return {};
  const applicantDocs = await db.getAll(
    ...applicantIds.map((applicantId) => db.collection("applicants").doc(applicantId))
  );
  return applicantDocs.reduce((stages, applicantDoc) => {
    if (applicantDoc.exists) stages[applicantDoc.id] = Number(applicantDoc.data()?.stage || 1);
    return stages;
  }, {});
}

function getProvidedApplicantStages(payload = {}) {
  const stages = { ...(payload.applicantStages || {}) };
  return stages;
}

async function addAppNotificationEvent(payload = {}, { sourceEventId = "" } = {}) {
  const actionKey = payload.actionKey || "";
  if (!actionKey) return;
  const meta = ACTION_META[actionKey] || { title: payload.actionLabel || actionKey, tone: "blue", icon: "document", verb: payload.actionLabel || "updated" };
  const now = new Date();
  const createdAt = payload.createdAt || now;
  const applicantIds = [...new Set([
    ...(Array.isArray(payload.applicantIds) ? payload.applicantIds : []),
    payload.applicantId || ""
  ].filter(Boolean))];
  // Capture the current workflow stage when the notification is written. The
  // list endpoint uses this to remove an applicant from an old stage group as
  // soon as they progress.
  // Bulk handlers can supply an exact stage map from their selected records.
  // Other workflows retain the current-document lookup so stage filtering stays
  // correct when that workflow changes the applicant stage.
  const applicantStages = getProvidedApplicantStages(payload);
  const missingApplicantIds = applicantIds.filter((id) => !applicantStages[id]);
  if (missingApplicantIds.length) {
    Object.assign(applicantStages, await getApplicantStages(missingApplicantIds));
  }
  const event = {
    actionKey,
    actionLabel: payload.actionLabel || meta.title,
    title: meta.title,
    tone: meta.tone,
    icon: meta.icon,
    verb: meta.verb,
    applicantId: payload.applicantId || "",
    applicantIds,
    applicantStages,
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
    createdAt,
    read: false
  };

  // Fan notifications out once at write time. This makes every subsequent read
  // a cheap, indexed query for the signed-in user instead of a scan of all events.
  const roles = [...new Set(event.recipientRoles)];
  if (!roles.length) return;
  const roleRecipients = await Promise.all(roles.map(getActiveRecipientsForRole));
  const recipientCandidates = new Map();
  roleRecipients.flat().forEach(({ id, data: recipient }) => {
    if (id === event.actorId) return;
    if (recipient.role === "AGENCY") {
      const agencyId = recipient.agencyId || id;
      if (event.recipientAgencyId && event.recipientAgencyId !== agencyId) return;
    }
    recipientCandidates.set(id, recipient);
  });

  const employerIds = [...new Set([...recipientCandidates.values()]
    .filter((recipient) => recipient.role === "EMPLOYER" && recipient.employerId)
    .map((recipient) => recipient.employerId))];
  const employerData = await Promise.all(employerIds.map(async (id) => [id, await getEmployerCached(id)]));
  const employers = new Map(employerData.filter(([, employer]) => employer));
  const recipients = new Map([...recipientCandidates].filter(([, recipient]) => {
    if (recipient.role !== "EMPLOYER") return true;
    if (event.recipientEmployerId) return recipient.employerId === event.recipientEmployerId;
    const companyId = event.recipientCompanyId || event.companyId || "";
    if (!companyId) return true;
    const employer = employers.get(recipient.employerId) || {};
    const companyIds = Array.isArray(employer.companyIds) ? employer.companyIds : [employer.companyId].filter(Boolean);
    return companyIds.includes(companyId);
  }));

  const recipientEntries = [...recipients.entries()];
  for (let offset = 0; offset < recipientEntries.length; offset += 249) {
    const batch = db.batch();
    const chunk = recipientEntries.slice(offset, offset + 249);
    const shouldGroupUnread = !sourceEventId && Boolean(event.actionKey && event.actorId);
    const deterministicRefs = (sourceEventId || shouldGroupUnread)
      ? chunk.map(([userId]) => db.collection(APP_NOTIFICATION_COLLECTION).doc(
        sourceEventId
          ? `${sourceEventId}_${userId}`
          : `unread_${getUnreadNotificationGroupId({ actionKey: event.actionKey, actorId: event.actorId, userId })}`
      ))
      : [];
    const existingDocs = deterministicRefs.length ? await db.getAll(...deterministicRefs) : [];
    const existingById = new Map(existingDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc]));
    let hasWrites = false;
    chunk.forEach(([userId]) => {
      const eventRef = sourceEventId
        ? db.collection(APP_NOTIFICATION_COLLECTION).doc(`${sourceEventId}_${userId}`)
        : shouldGroupUnread
          ? db.collection(APP_NOTIFICATION_COLLECTION).doc(
            `unread_${getUnreadNotificationGroupId({ actionKey: event.actionKey, actorId: event.actorId, userId })}`
          )
        : db.collection(APP_NOTIFICATION_COLLECTION).doc();
      const existing = existingById.get(eventRef.id);
      if (sourceEventId && existing) return;

      if (shouldGroupUnread && existing) {
        const wasRead = existing.data()?.read === true;
        const update = {
          ...event,
          userId,
          createdAt: now,
          read: false,
          applicantStages: {
            ...(existing.data()?.applicantStages || {}),
            ...event.applicantStages
          }
        };
        if (event.applicantIds.length) {
          update.applicantIds = admin.firestore.FieldValue.arrayUnion(...event.applicantIds);
        }
        batch.set(eventRef, update, { merge: true });
        if (wasRead) {
          batch.set(db.collection("users").doc(userId), {
            notificationUnreadCount: admin.firestore.FieldValue.increment(1),
            notificationUpdatedAt: now
          }, { merge: true });
        }
        hasWrites = true;
        return;
      }

      batch.set(eventRef, { ...event, userId });
      batch.set(db.collection("users").doc(userId), {
        notificationUnreadCount: admin.firestore.FieldValue.increment(1),
        notificationUpdatedAt: now
      }, { merge: true });
      hasWrites = true;
    });
    if (hasWrites) await batch.commit();
  }
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
      ...(["CONTRACT_ISSUED", "PROCESS_COMPLETED", "EMBASSY_APPOINTMENT_INITIATED", "EMBASSY_INTERVIEW_INITIATED", "VISA_COLLECTION_INITIATED"].includes(actionKey) ? ["EMPLOYER"] : [])
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
  const notifyAllCompanyEmployers = user?.role === SUPER_USER_ROLE && actionKey === "CONTRACT_ISSUED";
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
      : notifyAllCompanyEmployers
        ? ""
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
    applicantStages: Object.fromEntries(
      applicants
        .filter((applicant) => applicant?.id)
        .map((applicant) => [applicant.id, Number(applicant.stage || 1)])
    ),
    actorId: user.uid || "",
    actorRole: user.role || "",
    actorName,
    agencyId: firstApplicant.agencyId || "",
    companyId: companyId || firstApplicant.companyId || "",
    employerId: user.employerId || firstApplicant.employerId || "",
    recipientRoles: user.role === "EMPLOYER" ? [SUPER_USER_ROLE] : ["AGENCY", "EMPLOYER"],
    recipientAgencyId: firstApplicant.agencyId || "",
    recipientCompanyId: companyId || firstApplicant.companyId || "",
    recipientEmployerId: ""
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

async function recordAgencyTask({ applicantId, applicant = {}, user = {}, actionKey, isUpdate = false }) {
  if (user?.role !== "AGENCY") return;
  const updateActionKeys = {
    TRAVEL_DETAILS_ADDED: "TRAVEL_DETAILS_UPDATED",
    VISA_COLLECTION_TRAVEL_ADDED: "VISA_COLLECTION_TRAVEL_UPDATED",
    ARRIVAL_DETAILS_ADDED: "ARRIVAL_DETAILS_UPDATED",
    TRC_ADDED: "TRC_UPDATED"
  };
  const resolvedActionKey = isUpdate ? updateActionKeys[actionKey] || actionKey : actionKey;
  const agencyId = user.agencyId || applicant.agencyId || "";
  const agency = await getAgency(agencyId);
  const normalizedActionKey = resolvedActionKey === "DOCUMENT_DISPATCHED"
    ? "DOCUMENT_DISPATCHED"
    : resolvedActionKey === "SIGNED_CONTRACT_UPLOADED"
      ? "SIGNED_CONTRACT_UPLOADED"
      : resolvedActionKey === "DOCUMENT_UPLOADED"
        ? "DOCUMENT_UPLOADED"
        : resolvedActionKey;
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

function buildNotificationMessage(group = {}, { recipientRole = "" } = {}) {
  const actor = group.actorName || "User";
  const verb = group.verb || "updated";
  const count = Number(group.count || group.applicantIds?.length || group.applicantIds?.size || 0);
  const hideActorName = recipientRole === "EMPLOYER";
  if (group.actionKey === "COMPANY_ASSIGNED") {
    return `New company added: ${group.companyName || group.companyId || "Company"}.`;
  }
  // For creation verbs prefer "{Actor} created {n} applicants." phrasing
  if (/created applicant/i.test(verb) || /applicants added/i.test(group.title || "")) {
    return hideActorName
      ? `Created ${count} ${count === 1 ? "applicant" : "applicants"}.`
      : `${actor} created ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  }
  if (group.actionKey === "CONTRACT_ISSUED") return hideActorName
    ? `Added contract for ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} added contract for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "APPLICANT_APPROVED") return hideActorName
    ? `Approved ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} approved ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "DOCUMENT_APPROVED") return hideActorName
    ? `Approved document of ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} approved document of ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "DOCUMENT_REJECTED") return hideActorName
    ? `Rejected document of ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} rejected document of ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "EMBASSY_APPOINTMENT_COMPLETED") return hideActorName
    ? `Uploaded biometric of embassy appointment for ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} uploaded biometric of embassy appointment for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "EMBASSY_INTERVIEW_COMPLETED") return hideActorName
    ? `Uploaded biometric of embassy interview for ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} uploaded biometric of embassy interview for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  if (group.actionKey === "PROCESS_COMPLETED") return hideActorName
    ? `Marked candidate arrival and completion for ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} marked candidate arrival and completion for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
  return hideActorName
    ? `${verb} for ${count} ${count === 1 ? "applicant" : "applicants"}.`
    : `${actor} ${verb} for ${count} ${count === 1 ? "applicant" : "applicants"}.`;
}

function groupNotificationItems(items = [], recipientRole = "") {
  const grouped = new Map();

  items.forEach((item) => {
    // A bulk dispatch creates one event per applicant. Combine unread dispatch
    // events from the same agent so the recipient gets one actionable item.
    if (!item.actorId || !item.applicantIds.length) {
      grouped.set(`single:${item.id}`, item);
      return;
    }

    const key = `action:${item.actionKey}:${item.actorId}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...item, applicantIds: [...item.applicantIds] });
      return;
    }

    current.applicantIds = [...new Set([...current.applicantIds, ...item.applicantIds])];
    current.applicantStages = {
      ...(current.applicantStages || {}),
      ...(item.applicantStages || {})
    };
    current.count = current.applicantIds.length;
    current.unread = current.unread || item.unread;
    if (item.latestAt > current.latestAt) {
      current.latestAt = item.latestAt;
      current.createdAt = item.createdAt;
    }
  });

  return [...grouped.values()]
    .map((item) => ({ ...item, count: item.applicantIds.length, message: buildNotificationMessage(item, { recipientRole }) }))
    .sort((left, right) => right.latestAt - left.latestAt);
}

async function filterInactiveDocumentNotificationApplicants(items = [], user = {}) {
  const applicantNotificationItems = items.filter((item) => item.applicantIds?.length);
  if (!applicantNotificationItems.length) return items;

  const applicantIds = [...new Set(applicantNotificationItems.flatMap((item) => item.applicantIds))];
  const applicantDocs = [];
  for (let offset = 0; offset < applicantIds.length; offset += 500) {
    const refs = applicantIds.slice(offset, offset + 500).map((id) => db.collection("applicants").doc(id));
    applicantDocs.push(...(refs.length ? await db.getAll(...refs) : []));
  }
  const applicantsById = new Map(
    applicantDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() || {}])
  );

  return items.reduce((filteredItems, item) => {
    if (!item.applicantIds?.length) {
      filteredItems.push(item);
      return filteredItems;
    }

    const actionableApplicantIds = item.applicantIds.filter((applicantId) => {
      const applicant = applicantsById.get(applicantId);
      if (!applicant) return false;

      const recordedStage = Number(item.applicantStages?.[applicantId]);
      // A notification belongs to the stage at which it was created. Once an
      // applicant advances, exclude them from that old notification group and
      // recalculate its count from the remaining applicants.
      if (recordedStage > 0 && Number(applicant.stage || 1) !== recordedStage) return false;

      // Completed applicants are relevant only to the completion notification itself.
      if (item.actionKey !== "PROCESS_COMPLETED" && Number(applicant.stage || 1) >= 13) return false;

      if (!["DOCUMENT_UPLOADED", "DOCUMENT_APPROVED", "DOCUMENT_REJECTED", "CONTRACT_ISSUED"].includes(item.actionKey)) {
        return true;
      }

      if (item.actionKey === "DOCUMENT_UPLOADED" || item.actionKey === "DOCUMENT_APPROVED") {
        // Once dispatch or a later workflow stage begins, document approval is no longer actionable.
        return Number(applicant.stage || 1) < 4;
      }

      if (item.actionKey === "CONTRACT_ISSUED") {
        const signedDocuments = Array.isArray(applicant?.signedContract?.documents)
          ? applicant.signedContract.documents
          : [];
        const hasSignedContract = Boolean(applicant?.signedContract?.fileUrl || signedDocuments.some((document) => document?.fileUrl));
        if (user.role === "AGENCY") return Number(applicant.stage || 1) <= 5 && !hasSignedContract;
        return (
          Number(applicant.stage || 1) <= 5 &&
          String(applicant?.contract?.status || "").toUpperCase() !== "APPROVED" &&
          !hasSignedContract
        );
      }

      const documentSummary = applicant.docSummary || applicant.documentSummary || {};
      // A later successful re-upload and approval clears this count, making the old rejection irrelevant.
      return Number(applicant.stage || 1) < 4 && Number(documentSummary.rejectedCount || 0) > 0;
    });

    if (!actionableApplicantIds.length) return filteredItems;

    const nextItem = {
      ...item,
      applicantIds: actionableApplicantIds,
      count: actionableApplicantIds.length
    };
    filteredItems.push({ ...nextItem, message: buildNotificationMessage(nextItem, { recipientRole: user.role }) });
    return filteredItems;
  }, []);
}

async function getNotificationSummary(userId = "") {
  const doc = await db.collection("users").doc(userId).get();
  return { unreadCount: Math.max(0, Number(doc.data()?.notificationUnreadCount || 0)) };
}

function mapNotificationDocument(doc) {
  const event = { id: doc.id, ...doc.data(), unread: doc.data()?.read !== true };
  const applicantIds = Array.isArray(event.applicantIds) && event.applicantIds.length
    ? event.applicantIds
    : event.applicantId ? [event.applicantId] : [];
  return {
    ...event,
    applicantIds,
    count: applicantIds.length,
    latestAt: normalizeTimestampMs(event.createdAt)
  };
}

async function getActionableUnreadNotificationCount(user = {}) {
  const snapshot = await db.collection(APP_NOTIFICATION_COLLECTION)
    .where("userId", "==", user.uid)
    .where("read", "==", false)
    .limit(NOTIFICATION_SCAN_LIMIT)
    .get();
  const items = await filterInactiveDocumentNotificationApplicants(
    groupNotificationItems(snapshot.docs.map(mapNotificationDocument), user.role),
    user
  );
  return items.filter((item) => item.unread).length;
}

async function listNotificationsForUser(user = {}, { limit = 20, cursor = "" } = {}) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit || 20)));
  let query = db.collection(APP_NOTIFICATION_COLLECTION)
    .where("userId", "==", user.uid)
    .orderBy("createdAt", "desc")
    // Fetch the same window used by the unread-count calculation before
    // filtering obsolete workflow events. Limiting the raw query to the five
    // newest documents could otherwise leave the bell empty while its badge
    // still represented older, actionable notifications.
    .limit(NOTIFICATION_SCAN_LIMIT);
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (!Number.isNaN(cursorDate.getTime())) query = query.startAfter(cursorDate);
  }
  const snapshot = await query.get();
  const rawItems = snapshot.docs.map(mapNotificationDocument);
  const actionableItems = await filterInactiveDocumentNotificationApplicants(
    groupNotificationItems(rawItems, user.role),
    user
  );
  const hasMore = actionableItems.length > safeLimit;
  const items = actionableItems.slice(0, safeLimit);
  return {
    items,
    unreadCount: await getActionableUnreadNotificationCount(user),
    limit: safeLimit,
    hasMore,
    nextCursor: hasMore && items.length ? items[items.length - 1].createdAt.toDate().toISOString() : null
  };
}

async function getUnreadNotificationCount(user = {}) {
  return { unreadCount: await getActionableUnreadNotificationCount(user) };
}

async function markNotificationRead(user = {}, notificationId = "") {
  if (!notificationId) return getUnreadNotificationCount(user);
  const notificationRef = db.collection(APP_NOTIFICATION_COLLECTION).doc(notificationId);
  const notification = await notificationRef.get();
  if (notification.exists && notification.data()?.userId === user.uid && notification.data()?.read !== true) {
    const batch = db.batch();
    batch.update(notificationRef, { read: true, readAt: new Date() });
    batch.set(db.collection("users").doc(user.uid), {
      notificationUnreadCount: admin.firestore.FieldValue.increment(-1),
      notificationUpdatedAt: new Date()
    }, { merge: true });
    await batch.commit();
  }
  return getUnreadNotificationCount(user);
}

async function markNotificationsRead(user = {}) {
  while (true) {
    const snapshot = await db.collection(APP_NOTIFICATION_COLLECTION)
      .where("userId", "==", user.uid).where("read", "==", false).limit(400).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.update(doc.ref, { read: true, readAt: new Date() }));
    await batch.commit();
  }
  await db.collection("users").doc(user.uid).set({
    notificationUnreadCount: 0,
    notificationUpdatedAt: new Date()
  }, { merge: true });
  return { message: "Notifications marked as read" };
}

async function deleteOldReadNotifications() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let deleted = 0;
  while (true) {
    const snapshot = await db.collection(APP_NOTIFICATION_COLLECTION)
      .where("read", "==", true).where("createdAt", "<", cutoff).limit(400).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
  }
  return { deleted };
}

function getCachedValue(cache, key) {
  const cached = cache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedValue(cache, key, value) {
  cache.set(key, { value, expiresAt: Date.now() + Math.max(1_000, RECIPIENT_LOOKUP_CACHE_TTL_MS) });
  return value;
}

async function getActiveRecipientsForRole(role) {
  const cached = getCachedValue(recipientRoleCache, role);
  if (cached) return cached;
  const snapshot = await db.collection("users").where("role", "==", role).where("active", "==", true).get();
  return setCachedValue(recipientRoleCache, role, snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} })));
}

async function getEmployerCached(id) {
  const cached = getCachedValue(employerCache, id);
  if (cached) return cached;
  const doc = await db.collection("employers").doc(id).get();
  return setCachedValue(employerCache, id, doc.exists ? doc.data() || {} : null);
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

async function runDailyNotificationSummaries(dateKey = getDateKey(new Date(), -1)) {
  if (!DAILY_STATUS_EMAILS_ENABLED) {
    return { skipped: true, reason: "daily_status_emails_disabled", dateKey };
  }

  const runRef = db.collection(DAILY_RUN_COLLECTION).doc(dateKey);
  const runDoc = await runRef.get();
  if (runDoc.exists && runDoc.data()?.completedAt) {
    return { skipped: true, reason: "already_completed", dateKey };
  }

  await runRef.set({ startedAt: new Date(), dateKey }, { merge: true });
  const [employerWorkflow, adminApprovals] = await Promise.all([
    sendEmployerWorkflowSummary(dateKey),
    sendAdminApprovalAgencySummaries(dateKey)
  ]);
  await runRef.set({
    completedAt: new Date(),
    employerWorkflow,
    adminApprovals
  }, { merge: true });

  return { dateKey, employerWorkflow, adminApprovals };
}

function startDailyNotificationScheduler() {
  let lastCleanupDateKey = "";

  async function tick() {
    try {
      const today = getDateKey();
      if (lastCleanupDateKey !== today) {
        await deleteOldReadNotifications();
        lastCleanupDateKey = today;
      }
      if (!DAILY_STATUS_EMAILS_ENABLED) return;
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
  addAppNotificationEvent,
  deleteOldReadNotifications,
  getUnreadNotificationCount,
  listNotificationsForUser,
  markNotificationRead,
  markNotificationsRead,
  recordAdminApproval,
  recordAgencyTask,
  recordCompanyAssignmentNotification,
  recordEmployerWorkflowInitiated,
  recordBulkContractUpload,
  recordNotificationAction,
  getUserName,
  buildNotificationMessage,
  runDailyNotificationSummaries,
  startDailyNotificationScheduler
};

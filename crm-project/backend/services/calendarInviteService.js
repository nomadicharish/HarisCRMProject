const { db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { readEncryptedUserEmail } = require("./accountService");
const { sendEmail } = require("./emailService");
const { decryptText } = require("../utils/crypto");
const { SUPER_USER_ROLE } = require("../utils/roles");

const DEFAULT_DURATION_MINUTES = Number(process.env.CALENDAR_EVENT_DURATION_MINUTES || 60);
const DEFAULT_TIMEZONE_OFFSET_MINUTES = Number(process.env.CALENDAR_TIMEZONE_OFFSET_MINUTES || 330);
const PRODUCT_ID = "-//Talent Acquisition CRM//Calendar Invite//EN";

const EVENT_CONFIG = {
  embassyAppointment: {
    title: "Embassy Appointment",
    field: "embassyAppointment",
    dateKeys: ["dateTime", "date"],
    timeKeys: ["time", "appointmentTime"]
  },
  embassyInterview: {
    title: "Embassy Interview",
    field: "embassyInterview",
    dateKeys: ["dateTime", "date"],
    timeKeys: ["time"]
  },
  visaCollection: {
    title: "Visa Collection",
    field: "visaCollection",
    dateKeys: ["dateTime", "date"],
    timeKeys: ["time"]
  },
  applicantArrival: {
    title: "Applicant Arrival",
    field: "visaTravel",
    dateKeys: ["dateTime", "date"],
    timeKeys: ["time"]
  }
};

function escapeIcs(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function parseLocalDateTime(dateValue = "", timeValue = "") {
  if (!dateValue) return null;
  const dateText = String(dateValue || "");
  const [datePart, timePartFromDate = ""] = dateText.split("T");
  const resolvedTime = String(timeValue || timePartFromDate || "09:00").slice(0, 5);
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = resolvedTime.split(":").map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - DEFAULT_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMillis);
}

function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function resolveWorkflowDateTime(workflow = {}, config = {}) {
  const dateValue = config.dateKeys.map((key) => workflow?.[key]).find(Boolean);
  const timeValue = config.timeKeys.map((key) => workflow?.[key]).find(Boolean);
  return parseLocalDateTime(dateValue, timeValue);
}

async function getAdminEmails() {
  const superUsers = await db.collection("users").where("role", "==", SUPER_USER_ROLE).get();

  const recipients = new Set();
  await Promise.all(superUsers.docs.map(async (doc) => {
    const email = await readEncryptedUserEmail(doc.data());
    if (email) recipients.add(email);
  }));
  return recipients;
}

async function addAgencyRecipients(recipients, applicant = {}) {
  const agencyId = applicant.agencyId || "";
  if (!agencyId) return;

  const agencyDoc = await db.collection("agencies").doc(agencyId).get();
  if (agencyDoc.exists) {
    const data = agencyDoc.data() || {};
    const email = data.emailEncrypted ? await decryptText(data.emailEncrypted) : data.email || "";
    if (email) recipients.add(email);
  }

  const agencyUserSnap = await db.collection("users").where("role", "==", "AGENCY").where("agencyId", "==", agencyId).get();
  await Promise.all(agencyUserSnap.docs.map(async (doc) => {
    const email = await readEncryptedUserEmail(doc.data());
    if (email) recipients.add(email);
  }));
}

async function addEmployerRecipients(recipients, applicant = {}) {
  const companyDoc = applicant.companyId ? await db.collection("companies").doc(applicant.companyId).get() : null;
  const employerIds = companyDoc?.exists && Array.isArray(companyDoc.data()?.employerIds)
    ? companyDoc.data().employerIds
    : [];

  const employerDocs = employerIds.length
    ? await db.getAll(...employerIds.map((id) => db.collection("employers").doc(id)))
    : [];
  await Promise.all(employerDocs.map(async (doc) => {
    if (!doc.exists) return;
    const data = doc.data() || {};
    const email = data.emailEncrypted ? await decryptText(data.emailEncrypted) : data.email || "";
    if (email) recipients.add(email);
  }));

  for (let index = 0; index < employerIds.length; index += 10) {
    const chunk = employerIds.slice(index, index + 10);
    if (!chunk.length) continue;
    const employerUserSnap = await db.collection("users").where("role", "==", "EMPLOYER").where("employerId", "in", chunk).get();
    await Promise.all(employerUserSnap.docs.map(async (doc) => {
      const email = await readEncryptedUserEmail(doc.data());
      if (email) recipients.add(email);
    }));
  }
}

async function getCalendarRecipients({ applicant = {}, includeAgency = false, includeEmployers = false } = {}) {
  const recipients = await getAdminEmails();
  if (includeAgency) await addAgencyRecipients(recipients, applicant);
  if (includeEmployers) await addEmployerRecipients(recipients, applicant);
  return Array.from(recipients);
}

function buildIcsContent({ uid, sequence, title, description, startDate, endDate, recipients }) {
  const now = formatIcsDate(new Date());
  const attendeeLines = recipients
    .map((email) => `ATTENDEE;CN=${escapeIcs(email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${email}`)
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `ORGANIZER;CN=Talent Acquisition CRM:mailto:${process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@example.com"}`,
    attendeeLines,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
}

async function sendCalendarInvite({ applicantRef, applicantId, applicant, eventType, workflow, includeAgency = false, includeEmployers = false }) {
  const config = EVENT_CONFIG[eventType];
  if (!config) return { skipped: true, reason: "unknown_event_type" };

  const startDate = resolveWorkflowDateTime(workflow, config);
  if (!startDate) return { skipped: true, reason: "missing_date_time" };
  const endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
  const recipients = await getCalendarRecipients({ applicant, includeAgency, includeEmployers });
  if (!recipients.length) return { skipped: true, reason: "no_recipients" };

  const applicantName = getApplicantDisplayName(applicant);
  const title = `${config.title} - ${applicantName}`;
  const description = [
    `Applicant: ${applicantName}`,
    applicant.companyName ? `Company: ${applicant.companyName}` : "",
    applicant.countryName ? `Country: ${applicant.countryName}` : "",
    "Created by Talent Acquisition CRM"
  ].filter(Boolean).join("\n");

  const docSnap = await applicantRef.get();
  const calendarEvents = docSnap.exists ? docSnap.data()?.googleCalendarEvents || {} : {};
  const previous = calendarEvents[eventType] || {};
  const uid = previous.uid || `${eventType}-${applicantId}@talent-acquisition-crm`;
  const sequence = Number(previous.sequence || 0) + 1;
  const icsContent = buildIcsContent({ uid, sequence, title, description, startDate, endDate, recipients });

  const result = await sendEmail({
    to: recipients,
    subject: title,
    text: `${title}\n\n${description}`,
    html: `<p><strong>${escapeHtml(title)}</strong></p>${description.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join("")}`,
    icalEvent: {
      filename: `${eventType}.ics`,
      method: "REQUEST",
      content: icsContent
    }
  });

  await applicantRef.set(
    {
      googleCalendarEvents: {
        [eventType]: {
          uid,
          sequence,
          startAt: startDate,
          endAt: endDate,
          title,
          recipients,
          updatedAt: new Date()
        }
      }
    },
    { merge: true }
  );

  return result?.skipped ? result : { sent: true, recipients: recipients.length };
}

async function safeSendCalendarInvite(payload = {}) {
  try {
    return await sendCalendarInvite(payload);
  } catch (error) {
    logger.error("Calendar invite failed", {
      applicantId: payload?.applicantId || "",
      eventType: payload?.eventType || "",
      message: error?.message,
      stack: error?.stack
    });
    return { skipped: true, reason: "send_failed" };
  }
}

module.exports = {
  safeSendCalendarInvite,
  sendCalendarInvite
};

const nodemailer = require("nodemailer");
const { admin, db } = require("../config/firebase");
const { logger } = require("../lib/logger");
const { normalizeEmailValue } = require("../utils/normalizers");

let transporterPromise = null;
const SMTP_SEND_ATTEMPTS = Math.max(1, Number(process.env.SMTP_SEND_ATTEMPTS || 2));
const SMTP_RETRY_DELAY_MS = Math.max(0, Number(process.env.SMTP_RETRY_DELAY_MS || 1000));

function isEmailConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || "").trim() &&
    String(process.env.SMTP_USER || "").trim() &&
    String(process.env.SMTP_PASS || "").trim()
  );
}

async function getTransporter() {
  if (!isEmailConfigured()) return null;

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: String(process.env.SMTP_HOST || "").trim(),
        port: Number(String(process.env.SMTP_PORT || 587).trim()),
        secure: String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true",
        connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15_000),
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15_000),
        socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30_000),
        auth: {
          user: String(process.env.SMTP_USER || "").trim(),
          pass: String(process.env.SMTP_PASS || "").trim()
        }
      })
    );
  }

  return transporterPromise;
}

function isTransientSmtpError(error) {
  const code = String(error?.code || "").toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  return ["ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "ESOCKET", "EPIPE"].includes(code)
    || (responseCode >= 400 && responseCode < 500);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRole(role = "") {
  const value = String(role || "USER").trim();
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "User";
}

function buildTemplatedEmail({ text = "", html = "", recipient = {} } = {}) {
  const name = String(recipient.name || "User").trim() || "User";
  const role = formatRole(recipient.role);
  const textGreeting = `Hi ${name},\n${role}, You have an email from Talent Acquisition.`;
  const htmlGreeting = `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(role)}, You have an email from Talent Acquisition.</p>`;
  return {
    text: `${textGreeting}\n\n${String(text || "").trim()}`.trim(),
    html: `${htmlGreeting}${html || `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`}`
  };
}

async function resolveRecipientProfiles(recipients, recipient = null) {
  const profiles = new Map();
  const providedEmail = normalizeEmailValue(recipient?.email);
  if (providedEmail) profiles.set(providedEmail, { name: recipient?.name || "User", role: recipient?.role || "USER" });

  const unresolved = recipients.filter((email) => !profiles.has(normalizeEmailValue(email)));
  for (let index = 0; index < unresolved.length; index += 10) {
    const emails = unresolved.slice(index, index + 10).map(normalizeEmailValue);
    const snapshot = await db.collection("users").where("normalizedEmail", "in", emails).get();
    snapshot.docs.forEach((doc) => {
      const data = doc.data() || {};
      profiles.set(normalizeEmailValue(data.normalizedEmail), { name: data.name || "User", role: data.role || "USER" });
    });
  }

  // Some older users predate normalizedEmail. Resolve those accounts through
  // Firebase Auth and their profile document so their name and role are still
  // correct in every email template.
  const remaining = recipients.filter((email) => !profiles.has(normalizeEmailValue(email)));
  await Promise.all(remaining.map(async (email) => {
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      const profileDoc = await db.collection("users").doc(authUser.uid).get();
      const profile = profileDoc.exists ? profileDoc.data() || {} : {};
      profiles.set(normalizeEmailValue(email), {
        name: profile.name || authUser.displayName || "User",
        role: profile.role || authUser.customClaims?.role || "USER"
      });
    } catch {
      // Non-user recipients can still receive the email with the generic
      // fallback applied by buildTemplatedEmail.
    }
  }));

  return profiles;
}

async function sendMessageWithRetry({ transporter, mailOptions, subject, recipient }) {
  for (let attempt = 1; attempt <= SMTP_SEND_ATTEMPTS; attempt += 1) {
    try {
      const activeTransporter = transporter || await getTransporter();
      return await activeTransporter.sendMail(mailOptions);
    } catch (error) {
      const shouldRetry = attempt < SMTP_SEND_ATTEMPTS && isTransientSmtpError(error);
      if (!shouldRetry) throw error;

      transporterPromise = null;
      logger.warn("Transient SMTP send failure; retrying", {
        subject,
        recipients: [recipient],
        attempt,
        code: error?.code,
        responseCode: error?.responseCode
      });
      await wait(SMTP_RETRY_DELAY_MS);
      transporter = null;
    }
  }
  return null;
}

async function sendEmail({ to = [], subject = "", text = "", html = "", attachments = [], icalEvent = null, recipient = null } = {}) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!recipients.length) return { skipped: true, reason: "no_recipients" };

  if (!await getTransporter()) {
    logger.warn("Email not sent because SMTP is not configured", { subject, recipients });
    return { skipped: true, reason: "smtp_not_configured" };
  }

  const profiles = await resolveRecipientProfiles(recipients, recipient);
  const results = [];
  for (const email of recipients) {
    const content = buildTemplatedEmail({
      text,
      html,
      recipient: profiles.get(normalizeEmailValue(email)) || { name: "User", role: "USER" }
    });
    const result = await sendMessageWithRetry({
      transporter: await getTransporter(),
      subject,
      recipient: email,
      mailOptions: {
        from: String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim(),
        to: email,
        subject,
        ...content,
        attachments,
        ...(icalEvent ? { icalEvent } : {})
      }
    });
    results.push(result);
  }

  const accepted = results.flatMap((result) => result?.accepted || []);
  if (!accepted.length) return { skipped: true, reason: "recipient_rejected" };
  if (results.length === 1) return results[0];
  return { accepted, rejected: results.flatMap((result) => result?.rejected || []), messageId: null };
}

module.exports = {
  buildTemplatedEmail,
  formatRole,
  isEmailConfigured,
  sendEmail
};

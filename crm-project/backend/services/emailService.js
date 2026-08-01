const nodemailer = require("nodemailer");
const { logger } = require("../lib/logger");

let transporterPromise = null;

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
        auth: {
          user: String(process.env.SMTP_USER || "").trim(),
          pass: String(process.env.SMTP_PASS || "").trim()
        }
      })
    );
  }

  return transporterPromise;
}

async function sendEmail({ to = [], subject = "", text = "", html = "", attachments = [], icalEvent = null } = {}) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!recipients.length) return { skipped: true, reason: "no_recipients" };

  const transporter = await getTransporter();
  if (!transporter) {
    logger.warn("Email not sent because SMTP is not configured", { subject, recipients });
    return { skipped: true, reason: "smtp_not_configured" };
  }

  const result = await transporter.sendMail({
    from: String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim(),
    to: recipients.join(","),
    subject,
    text,
    html,
    attachments,
    ...(icalEvent ? { icalEvent } : {})
  });

  // Nodemailer can resolve a send request even when every recipient was rejected.
  // Treat that as a delivery failure so account creation does not report a welcome
  // email as sent when the new user cannot receive it.
  if (Array.isArray(result?.accepted) && result.accepted.length === 0) {
    logger.error("Email was rejected by the SMTP server", {
      subject,
      recipients,
      rejected: result.rejected || []
    });
    return { skipped: true, reason: "recipient_rejected" };
  }

  return result;
}

module.exports = {
  isEmailConfigured,
  sendEmail
};

const nodemailer = require("nodemailer");
const { logger } = require("../lib/logger");

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

async function sendEmail({ to = [], subject = "", text = "", html = "", attachments = [], icalEvent = null } = {}) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!recipients.length) return { skipped: true, reason: "no_recipients" };

  if (!await getTransporter()) {
    logger.warn("Email not sent because SMTP is not configured", { subject, recipients });
    return { skipped: true, reason: "smtp_not_configured" };
  }

  for (let attempt = 1; attempt <= SMTP_SEND_ATTEMPTS; attempt += 1) {
    try {
      const transporter = await getTransporter();
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
    } catch (error) {
      const shouldRetry = attempt < SMTP_SEND_ATTEMPTS && isTransientSmtpError(error);
      if (!shouldRetry) throw error;

      // A Cloud Run instance may retain a stale SMTP socket after it resumes.
      // Recreate the transport before retrying the same message once.
      transporterPromise = null;
      logger.warn("Transient SMTP send failure; retrying", {
        subject,
        recipients,
        attempt,
        code: error?.code,
        responseCode: error?.responseCode
      });
      await wait(SMTP_RETRY_DELAY_MS);
    }
  }
}

module.exports = {
  isEmailConfigured,
  sendEmail
};

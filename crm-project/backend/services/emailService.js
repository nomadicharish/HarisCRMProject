const nodemailer = require("nodemailer");

let transporterPromise = null;

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function getTransporter() {
  if (!isEmailConfigured()) return null;

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      })
    );
  }

  return transporterPromise;
}

async function sendEmail({ to = [], subject = "", text = "", html = "", attachments = [] } = {}) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!recipients.length) return { skipped: true, reason: "no_recipients" };

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn("Email not sent because SMTP is not configured", { subject, recipients });
    return { skipped: true, reason: "smtp_not_configured" };
  }

  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipients.join(","),
    subject,
    text,
    html,
    attachments
  });
}

module.exports = {
  sendEmail
};

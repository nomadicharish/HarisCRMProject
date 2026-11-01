const crypto = require("crypto");
const { db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { readEncryptedUserEmail } = require("./accountService");
const { sendEmail } = require("./emailService");
const { logger } = require("../lib/logger");

const OTP_TTL_MS = Math.max(60_000, Number(process.env.SUPER_USER_OTP_TTL_MS || 5 * 60_000));
const OTP_RESEND_COOLDOWN_MS = Math.max(0, Number(process.env.SUPER_USER_OTP_RESEND_COOLDOWN_MS || 30_000));
const OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.SUPER_USER_OTP_MAX_ATTEMPTS || 5));

function isSuperUserOtpEnabled() {
  const configured = String(process.env.SUPER_USER_OTP_ENABLED || "").trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return String(process.env.FIREBASE_ENVIRONMENT || "qa").trim().toLowerCase() === "qa";
}

function challengeRef(uid) {
  return db.collection("superUserLoginOtps").doc(uid);
}

function hashOtp(code, salt) {
  return crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "your registered email address";
  return `${local.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(4, local.length - 1)))}@${domain}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  }[character]));
}

async function issueOtp({ uid, tokenAuthTime, userProfile }) {
  if (!isSuperUserOtpEnabled() || userProfile.role !== "SUPER_USER") {
    return { otpRequired: false };
  }

  const profileDoc = await db.collection("users").doc(uid).get();
  const profile = profileDoc.exists ? profileDoc.data() || {} : userProfile;
  const email = await readEncryptedUserEmail(profile);
  if (!email) throw new AppError("No registered email address is available for this account", 400);

  const ref = challengeRef(uid);
  const now = Date.now();
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() || {} : {};
  const lastSentAt = Number(existingData.lastSentAtMs || 0);
  if (existingData.tokenAuthTime === tokenAuthTime && now - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
    throw new AppError(`Please wait ${retryAfterSeconds} seconds before requesting another OTP`, 429);
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString("hex");
  const expiresAtMs = now + OTP_TTL_MS;
  const payload = {
    tokenAuthTime,
    codeHash: hashOtp(code, salt),
    salt,
    attempts: 0,
    verified: false,
    expiresAtMs,
    lastSentAtMs: now,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await ref.set(payload);
  try {
    const result = await sendEmail({
      to: email,
      subject: "Your Talent Acquisition login verification code",
      text: `Your login verification code is ${code}. It expires in ${Math.ceil(OTP_TTL_MS / 60_000)} minutes. Do not share this code.`,
      html: `<p>Your Talent Acquisition login verification code is <strong>${escapeHtml(code)}</strong>.</p><p>It expires in ${Math.ceil(OTP_TTL_MS / 60_000)} minutes. Do not share this code.</p>`
    });
    if (result?.skipped) throw new Error(result.reason || "email_not_sent");
  } catch (error) {
    await ref.delete().catch(() => undefined);
    logger.error("Unable to send super-user login OTP", { uid, code: error?.code, message: error?.message });
    throw new AppError("Unable to send the verification code. Please try again later.", 503);
  }

  return {
    otpRequired: true,
    maskedEmail: maskEmail(email),
    expiresAtMs,
    resendAvailableAtMs: now + OTP_RESEND_COOLDOWN_MS
  };
}

async function verifyOtp({ uid, tokenAuthTime, otp }) {
  if (!isSuperUserOtpEnabled()) return { verified: true };

  const ref = challengeRef(uid);
  let failure = null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const challenge = snapshot.exists ? snapshot.data() || {} : null;
    const now = Date.now();
    if (!challenge || challenge.tokenAuthTime !== tokenAuthTime || challenge.verified) {
      failure = new AppError("Verification code is invalid or has expired", 400);
      return;
    }
    if (Number(challenge.expiresAtMs || 0) <= now) {
      transaction.delete(ref);
      failure = new AppError("Verification code has expired. Please sign in again.", 400);
      return;
    }
    if (Number(challenge.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      transaction.delete(ref);
      failure = new AppError("Too many incorrect attempts. Please sign in again.", 429);
      return;
    }

    const expected = Buffer.from(String(challenge.codeHash || ""), "hex");
    const actual = Buffer.from(hashOtp(otp, challenge.salt), "hex");
    const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!valid) {
      transaction.update(ref, { attempts: Number(challenge.attempts || 0) + 1, updatedAt: new Date() });
      failure = new AppError("The verification code is incorrect", 400);
      return;
    }

    transaction.set(db.collection("users").doc(uid), {
      otpVerifiedAuthTime: tokenAuthTime,
      otpVerifiedAt: new Date(),
      updatedAt: new Date()
    }, { merge: true });
    transaction.delete(ref);
  });

  if (failure) throw failure;
  return { verified: true };
}

module.exports = { isSuperUserOtpEnabled, issueOtp, verifyOtp };

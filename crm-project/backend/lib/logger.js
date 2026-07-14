const { maskValue } = require("../utils/outputSanitizer");

const SENSITIVE_KEYS = new Set([
  "authorization",
  "token",
  "password",
  "newPassword",
  "email",
  "contactNumber",
  "emailEncrypted",
  "contactNumberEncrypted",
  "data",
  "iv"
]);

function redactMeta(meta) {
  if (Array.isArray(meta)) {
    return meta.map(redactMeta);
  }

  if (!meta || typeof meta !== "object") {
    return typeof meta === "string" && meta.length > 120 ? `${meta.slice(0, 117)}...` : meta;
  }

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (SENSITIVE_KEYS.has(key)) {
        return [key, maskValue(value)];
      }

      return [key, redactMeta(value)];
    })
  );
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(redactMeta(meta))}` : "";
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${suffix}`;
}

const LOG_LEVELS = { info: 1, warn: 2, error: 3 };
const configuredLevel = String(process.env.LOG_LEVEL || "error").trim().toLowerCase();
const minimumLevel = LOG_LEVELS[configuredLevel] || LOG_LEVELS.error;

function shouldLog(level) {
  return LOG_LEVELS[level] >= minimumLevel;
}

const logger = {
  info(message, meta) {
    if (shouldLog("info")) console.info(formatMessage("info", message, meta));
  },
  warn(message, meta) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, meta));
  },
  error(message, meta) {
    console.error(formatMessage("error", message, meta));
  }
};

module.exports = { logger };

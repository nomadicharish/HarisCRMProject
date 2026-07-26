const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { AppError } = require("../lib/AppError");

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRateLimitEnabled() {
  const explicit = String(process.env.ENABLE_RATE_LIMIT || "").toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;

  return process.env.NODE_ENV === "production";
}

function buildCorsOptions() {
  const configuredOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === "production" && !configuredOrigins.length) {
    throw new Error("CORS_ALLOWED_ORIGINS must be configured in production");
  }
  const allowedOrigins = configuredOrigins.length || process.env.NODE_ENV === "production"
    ? configuredOrigins
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new AppError("Origin not allowed", 403));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    credentials: false,
    maxAge: 600
  };
}

function createGeneralRateLimiter() {
  if (!isRateLimitEnabled()) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    limit: toNumber(process.env.RATE_LIMIT_MAX, 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." }
  });
}

function createAuthRateLimiter() {
  if (!isRateLimitEnabled()) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: toNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    limit: toNumber(process.env.AUTH_RATE_LIMIT_MAX, 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many authentication attempts. Please try again later." }
  });
}

function createHelmetMiddleware() {
  return helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com"],
        frameSrc: ["'self'", "https://*.firebaseapp.com"],
        formAction: ["'self'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  });
}

module.exports = {
  buildCorsOptions,
  createAuthRateLimiter,
  createGeneralRateLimiter,
  createHelmetMiddleware
};

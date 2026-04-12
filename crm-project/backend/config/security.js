const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { AppError } = require("../lib/AppError");

function buildCorsOptions() {
  const allowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." }
  });
}

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many authentication attempts. Please try again later." }
  });
}

function createHelmetMiddleware() {
  return helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
    referrerPolicy: { policy: "no-referrer" }
  });
}

module.exports = {
  buildCorsOptions,
  createAuthRateLimiter,
  createGeneralRateLimiter,
  createHelmetMiddleware
};

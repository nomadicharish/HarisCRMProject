const { ZodError } = require("zod");
const { AppError } = require("../lib/AppError");
const { logger } = require("../lib/logger");

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error(error.message, {
        statusCode: error.statusCode,
        path: req.originalUrl,
        details: error.details
      });
    }

    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details || undefined
    });
  }

  logger.error("Unhandled request error", {
    path: req.originalUrl,
    message: error?.message,
    stack: error?.stack
  });

  return res.status(500).json({ message: "Internal Server Error" });
}

module.exports = { errorHandler };

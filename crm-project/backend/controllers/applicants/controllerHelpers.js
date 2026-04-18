const { AppError } = require("../../lib/AppError");
const { logger } = require("../../lib/logger");

function handleApplicantControllerError(res, context, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message, details: error.details || undefined });
  }

  logger.error(context, {
    message: error?.message,
    stack: error?.stack
  });
  return res.status(500).json({ message: "Internal Server Error" });
}

module.exports = { handleApplicantControllerError };

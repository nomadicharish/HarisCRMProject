const { AppError } = require("../lib/AppError");
const { canAccessApplicant, hasScope } = require("../services/policyService");

function requireAgentScope(scope) {
  return function agentScopeMiddleware(req, res, next) {
    if (!hasScope(req.user, scope)) {
      return next(new AppError("Insufficient agent scope", 403, { scope }));
    }
    return next();
  };
}

function requireApplicantAccess(paramName = "applicantId") {
  return async function applicantAccessMiddleware(req, res, next) {
    const applicantId =
      req.params?.[paramName] ||
      req.body?.[paramName] ||
      req.body?.input?.[paramName] ||
      "";
    if (!applicantId) {
      return next(new AppError("Applicant id is required", 400));
    }

    const allowed = await canAccessApplicant(req.user, applicantId);
    if (!allowed) {
      return next(new AppError("Applicant access denied by policy", 403));
    }

    return next();
  };
}

module.exports = {
  requireAgentScope,
  requireApplicantAccess
};

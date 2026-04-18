const { db } = require("../config/firebase");

const ROLE_DEFAULT_SCOPES = {
  SUPER_USER: ["*"],
  ACCOUNTANT: ["agent.jobs.read", "agent.jobs.enqueue", "agent.actions.read"],
  AGENCY: ["agent.actions.read"],
  EMPLOYER: ["agent.actions.read"]
};

function getEffectiveScopes(user = {}) {
  const explicit = Array.isArray(user.agentScopes) ? user.agentScopes : [];
  if (explicit.length) return explicit;
  return ROLE_DEFAULT_SCOPES[user.role] || [];
}

function hasScope(user, scope) {
  const scopes = getEffectiveScopes(user);
  return scopes.includes("*") || scopes.includes(scope);
}

async function canAccessApplicant(user = {}, applicantId = "") {
  if (!applicantId) return false;
  if (user.role === "SUPER_USER" || user.role === "ACCOUNTANT") return true;

  const applicantDoc = await db.collection("applicants").doc(applicantId).get();
  if (!applicantDoc.exists) return false;
  const applicant = applicantDoc.data() || {};

  if (user.role === "AGENCY") {
    const expectedAgencyId = user.agencyId || user.uid || "";
    return applicant.agencyId === expectedAgencyId || applicant.agencyId === user.uid;
  }

  if (user.role === "EMPLOYER") {
    if (!user.employerId) return false;
    const employerDoc = await db.collection("employers").doc(user.employerId).get();
    const employerCompanyId = employerDoc.exists ? employerDoc.data()?.companyId || "" : "";
    return Boolean(employerCompanyId) && applicant.companyId === employerCompanyId;
  }

  return false;
}

module.exports = {
  canAccessApplicant,
  getEffectiveScopes,
  hasScope
};

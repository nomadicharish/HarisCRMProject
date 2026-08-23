const { db } = require("../config/firebase");

const ROLE_DEFAULT_SCOPES = {
  SUPER_USER: ["*"],
  JUNIOR_ACCOUNTANT: ["agent.actions.read"],
  SENIOR_ACCOUNTANT: ["agent.actions.read"],
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
  if (user.role === "SUPER_USER" || user.role === "JUNIOR_ACCOUNTANT" || user.role === "SENIOR_ACCOUNTANT") return true;

  const applicantDoc = await db.collection("applicants").doc(applicantId).get();
  if (!applicantDoc.exists) return false;
  const applicant = applicantDoc.data() || {};

  if (user.role === "AGENCY") {
    const expectedAgencyId = user.agencyId || user.uid || "";
    return applicant.agencyId === expectedAgencyId || applicant.agencyId === user.uid;
  }

  if (user.role === "EMPLOYER") {
    let employerId = user.employerId || "";
    if (!employerId && user.uid) {
      const userDoc = await db.collection("users").doc(user.uid).get();
      employerId = userDoc.exists ? userDoc.data()?.employerId || "" : "";
    }
    if (!employerId) return false;
    const employerDoc = await db.collection("employers").doc(employerId).get();
    const employer = employerDoc.exists ? employerDoc.data() || {} : {};
    const employerCompanyIds = Array.isArray(employer.companyIds) && employer.companyIds.length
      ? employer.companyIds
      : employer.companyId
        ? [employer.companyId]
        : [];
    return employerCompanyIds.includes(applicant.companyId) &&
      String(applicant.approvalStatus || "").toLowerCase() === "approved";
  }

  return false;
}

module.exports = {
  canAccessApplicant,
  getEffectiveScopes,
  hasScope
};

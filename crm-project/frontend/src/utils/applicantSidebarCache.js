export function getApplicantSidebarCacheKey(applicantId) {
  return `/applicants/${applicantId}/sidebar-profile`;
}

export function buildApplicantSidebarCache({
  applicant,
  pendingAmount = 0,
  countryName = "",
  agencyName = ""
}) {
  if (!applicant) return null;

  return {
    applicant: {
      ...applicant,
      countryName: countryName || applicant.countryName || applicant.country || "",
      agencyName: agencyName || applicant.agencyName || applicant.agency?.name || ""
    },
    pendingAmount: Number(pendingAmount || 0),
    countryName: countryName || applicant.countryName || applicant.country || "",
    agencyName: agencyName || applicant.agencyName || applicant.agency?.name || "",
    updatedAt: Date.now()
  };
}

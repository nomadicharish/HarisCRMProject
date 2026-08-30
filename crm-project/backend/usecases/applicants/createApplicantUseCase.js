const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { recordAgencyTask, recordNotificationAction } = require("../../services/notificationService");
const {
  buildApplicantListDerivedFields,
  getAuthenticatedUserFromReq,
  resolveApplicantReferenceFields,
  normalizePaymentCurrency,
  toNumber
} = require("../../services/applicantDomainService");
const { isSuperUserLikeRole } = require("../../utils/roles");

async function createApplicantUseCase(req) {
  const { userRole, userId } = getAuthenticatedUserFromReq(req);

  let assignedAgencyId = null;
  if (userRole === "AGENCY") {
    assignedAgencyId = req.user?.agencyId || userId;
  } else if (isSuperUserLikeRole(userRole) || userRole === "ADMIN") {
    assignedAgencyId = req.body.agencyId || null;
  } else {
    throw new AppError("Unauthorized", 403);
  }

  if (!assignedAgencyId) {
    throw new AppError("Agency must be assigned", 400);
  }

  const personalDetails = req.body.personalDetails || {};
  const {
    firstName = personalDetails.firstName,
    lastName = personalDetails.lastName,
    email = personalDetails.email,
    dob = personalDetails.dob,
    enrollmentDate = personalDetails.enrollmentDate,
    age = personalDetails.age,
    education = personalDetails.education,
    address = personalDetails.address,
    placeOfBirth = personalDetails.placeOfBirth,
    passportNumber = personalDetails.passportNumber,
    phone = personalDetails.phone,
    whatsappNumber = personalDetails.whatsappNumber || personalDetails.whatsapp,
    countryId,
    companyId,
    jobPositionId,
    jobPositionName,
    totalAmount,
    currency,
    totalApplicantPayment,
    totalEmployerPayment
  } = req.body;

  if (userRole === "AGENCY") {
    const agencyDoc = await db.collection("agencies").doc(assignedAgencyId).get();
    const assignedCompanyIds = Array.isArray(agencyDoc.data()?.assignedCompanyIds)
      ? agencyDoc.data().assignedCompanyIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (!assignedCompanyIds.includes(companyId)) {
      throw new AppError("Agency is not assigned to this company", 403);
    }
  }

  const requestedTotal = toNumber(totalApplicantPayment ?? totalAmount);
  if ((isSuperUserLikeRole(userRole) || userRole === "ADMIN") && requestedTotal <= 0) {
    throw new AppError("Total amount is required", 400);
  }
  const normalizedTotalApplicantPayment = requestedTotal > 0 ? requestedTotal : 0;
  const normalizedTotalEmployerPayment = toNumber(totalEmployerPayment);
  const paymentCurrency = normalizePaymentCurrency(req.body.paymentCurrency || currency);
  const approvalStatus = userRole === "AGENCY" ? "pending" : "approved";

  const referenceFields = await resolveApplicantReferenceFields({
    countryId,
    companyId,
    jobPositionId,
    jobPositionName,
    agencyId: assignedAgencyId
  });

  const applicant = {
    personalDetails: {
      firstName,
      lastName,
      email: email || "",
      dob,
      enrollmentDate: enrollmentDate || "",
      age,
      education: education || "",
      placeOfBirth: placeOfBirth || "",
      passportNumber: passportNumber || "",
      address,
      phone,
      whatsappNumber: whatsappNumber || "",
      whatsapp: whatsappNumber || ""
    },
    firstName,
    lastName,
    email: email || "",
    age,
    education: education || "",
    whatsappNumber: whatsappNumber || "",
    countryId,
    companyId,
    jobPositionId,
    jobPositionName: referenceFields.jobPositionName || jobPositionName || "",
    agencyId: assignedAgencyId,
    ...referenceFields,
    createdBy: userId,
    approvalStatus,
    applicantBannerStatus: approvalStatus === "approved" ? "Document upload pending" : "Candidate created. Pending for Admin approval",
    stage: 1,
    stageStatus: "ongoing",
    totalApplicantPayment: normalizedTotalApplicantPayment,
    totalAmount: normalizedTotalApplicantPayment,
    paymentCurrency,
    currency: paymentCurrency,
    totalEmployerPayment: normalizedTotalEmployerPayment,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  Object.assign(applicant, buildApplicantListDerivedFields(applicant));

  const docRef = await db.collection("applicants").add(applicant);
  const applicantId = docRef.id;

  await refreshApplicantSummaries(applicantId, applicant);
  await recordAgencyTask({
    applicantId,
    applicant,
    user: req.user,
    actionKey: "APPLICANT_ADDED"
  });
  if (req.user?.role !== "AGENCY") {
    // When Super User creates applicant, ensure employer is not notified immediately
    await recordNotificationAction({
      applicantId,
      applicant,
      user: req.user,
      actionKey: "APPLICANT_ADDED",
      employerId: "",
      recipientRoles: ["AGENCY"],
      recipientAgencyId: assignedAgencyId,
      recipientEmployerId: ""
    });
  }

  return {
    message: "Applicant created successfully",
    applicantId
  };
}

module.exports = { createApplicantUseCase };

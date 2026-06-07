const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const {
  buildApplicantListDerivedFields,
  getAuthenticatedUserFromReq,
  resolveApplicantReferenceFields,
  normalizePaymentCurrency,
  toNumber
} = require("../../services/applicantDomainService");

async function createApplicantUseCase(req) {
  const { userRole, userId } = getAuthenticatedUserFromReq(req);

  let assignedAgencyId = null;
  if (userRole === "AGENCY") {
    assignedAgencyId = req.user?.agencyId || userId;
  } else if (userRole === "SUPER_USER") {
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
    age = personalDetails.age,
    education = personalDetails.education,
    address = personalDetails.address,
    placeOfBirth = personalDetails.placeOfBirth,
    passportNumber = personalDetails.passportNumber,
    phone = personalDetails.phone,
    whatsappNumber = personalDetails.whatsappNumber || personalDetails.whatsapp,
    countryId,
    companyId,
    totalAmount,
    amountPaid,
    currency,
    totalApplicantPayment,
    totalEmployerPayment
  } = req.body;

  const requestedTotal = toNumber(totalApplicantPayment ?? totalAmount);
  const normalizedTotalApplicantPayment = requestedTotal > 0 ? requestedTotal : 0;
  const normalizedTotalEmployerPayment = toNumber(totalEmployerPayment);
  const normalizedAmountPaid = toNumber(amountPaid);
  const paymentCurrency = normalizePaymentCurrency(req.body.paymentCurrency || currency);
  const approvalStatus = userRole === "AGENCY" ? "pending" : "approved";

  const referenceFields = await resolveApplicantReferenceFields({
    countryId,
    companyId,
    agencyId: assignedAgencyId
  });

  const applicant = {
    personalDetails: {
      firstName,
      lastName,
      email: email || "",
      dob,
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

  if (userRole === "SUPER_USER" && normalizedAmountPaid > 0) {
    const initialPayment = {
      type: "APPLICANT",
      amount: normalizedAmountPaid,
      currency: paymentCurrency,
      note: "Initial payment",
      paidBy: userRole,
      paidTo: "SUPER_USER",
      paidDate: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection("applicants").doc(applicantId).collection("payments").add(initialPayment);
  }

  await refreshApplicantSummaries(applicantId, {
    ...applicant,
    amountPaid: normalizedAmountPaid
  });

  return {
    message: "Applicant created successfully",
    applicantId
  };
}

module.exports = { createApplicantUseCase };

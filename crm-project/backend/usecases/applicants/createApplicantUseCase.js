const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { getAuthenticatedUserFromReq, toNumber } = require("../../services/applicantDomainService");

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
    address = personalDetails.address,
    phone = personalDetails.phone,
    whatsappNumber = personalDetails.whatsappNumber || personalDetails.whatsapp,
    maritalStatus = personalDetails.maritalStatus,
    countryId,
    companyId,
    totalAmount,
    amountPaid,
    currency,
    totalApplicantPayment,
    totalEmployerPayment
  } = req.body;

  const companySnap = await db.collection("companies").doc(companyId).get();
  const companyPaymentPerApplicant = companySnap.exists
    ? toNumber(companySnap.data()?.companyPaymentPerApplicant)
    : 0;

  const requestedTotal = toNumber(totalApplicantPayment ?? totalAmount);
  const normalizedTotalApplicantPayment = requestedTotal > 0 ? requestedTotal : companyPaymentPerApplicant;
  const normalizedTotalEmployerPayment = toNumber(totalEmployerPayment ?? companyPaymentPerApplicant);
  const normalizedAmountPaid = toNumber(amountPaid);
  const approvalStatus = userRole === "AGENCY" ? "pending" : "approved";

  const applicant = {
    personalDetails: {
      firstName,
      lastName,
      email: email || "",
      dob,
      age,
      address,
      phone,
      whatsappNumber: whatsappNumber || "",
      whatsapp: whatsappNumber || "",
      maritalStatus
    },
    firstName,
    lastName,
    email: email || "",
    age,
    whatsappNumber: whatsappNumber || "",
    countryId,
    companyId,
    agencyId: assignedAgencyId,
    createdBy: userId,
    approvalStatus,
    applicantBannerStatus: approvalStatus === "approved" ? "Document upload pending" : "Candidate created. Pending for Admin approval",
    stage: 1,
    stageStatus: "ongoing",
    totalApplicantPayment: normalizedTotalApplicantPayment,
    totalEmployerPayment: normalizedTotalEmployerPayment,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const docRef = await db.collection("applicants").add(applicant);
  const applicantId = docRef.id;

  if (normalizedAmountPaid > 0) {
    const initialPayment = {
      type: "APPLICANT",
      amount: normalizedAmountPaid,
      currency: currency || "INR",
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

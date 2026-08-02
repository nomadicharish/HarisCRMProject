const { db } = require("../config/firebase");
const { sendApplicantArrivalDetailsEmail } = require("../usecases/applicants/workflowAdditionalUseCases");

async function main() {
  const applicantId = String(process.env.APPLICANT_ID || "").trim();
  if (!applicantId) throw new Error("APPLICANT_ID is required");

  const applicantDoc = await db.collection("applicants").doc(applicantId).get();
  if (!applicantDoc.exists) throw new Error(`Applicant ${applicantId} was not found`);

  const applicant = applicantDoc.data() || {};
  const arrivalDetails = applicant.visaTravel || {};
  if (!arrivalDetails.date && !arrivalDetails.time && !arrivalDetails.flightNumber) {
    throw new Error(`Applicant ${applicantId} has no arrival details to send`);
  }

  const delivery = await sendApplicantArrivalDetailsEmail({
    applicant,
    arrivalDetails,
    isUpdate: Boolean(arrivalDetails.updatedAt || arrivalDetails.createdAt)
  });
  console.log(JSON.stringify({ applicantId, recipientCount: delivery.recipients?.length || 0, delivery: delivery.result || delivery }));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

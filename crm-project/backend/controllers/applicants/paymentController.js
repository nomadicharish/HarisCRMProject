const {
  addPaymentUseCase,
  getPaymentSummaryUseCase
} = require("../../usecases/applicants/paymentUseCases");
const { handleApplicantControllerError } = require("./controllerHelpers");

async function addPayment(req, res) {
  try {
    const payload = await addPaymentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Payment Error", error);
  }
}

async function getPaymentSummary(req, res) {
  try {
    const payload = await getPaymentSummaryUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Payment Summary Error", error);
  }
}

module.exports = {
  addPayment,
  getPaymentSummary
};

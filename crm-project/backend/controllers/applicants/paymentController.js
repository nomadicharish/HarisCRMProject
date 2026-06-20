const {
  acknowledgePaymentUseCase,
  addPaymentUseCase,
  confirmPaymentUseCase,
  getPaymentSummaryUseCase
} = require("../../usecases/applicants/paymentUseCases");
const { getApplicantPaymentsPageUseCase } = require("../../usecases/applicants/profileReadUseCases");
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

async function getApplicantPaymentsPage(req, res) {
  try {
    const payload = await getApplicantPaymentsPageUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Applicant Payments Page Error", error);
  }
}

async function acknowledgePayment(req, res) {
  try {
    const payload = await acknowledgePaymentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Acknowledge Payment Error", error);
  }
}

async function confirmPayment(req, res) {
  try {
    const payload = await confirmPaymentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Confirm Payment Error", error);
  }
}

module.exports = {
  acknowledgePayment,
  addPayment,
  confirmPayment,
  getApplicantPaymentsPage,
  getPaymentSummary
};

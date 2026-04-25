const { createApplicantUseCase } = require("../../usecases/applicants/createApplicantUseCase");
const { getExchangeRateUseCase } = require("../../usecases/applicants/getExchangeRateUseCase");
const {
  approveAndMoveStageUseCase,
  approveApplicantUseCase,
  completeApplicantUseCase,
  updateApplicantUseCase
} = require("../../usecases/applicants/lifecycleUseCases");
const { handleApplicantControllerError } = require("./controllerHelpers");

async function createApplicant(req, res) {
  try {
    const payload = await createApplicantUseCase(req);
    return res.status(201).json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Create Applicant Error", error);
  }
}

module.exports = {
  createApplicant,
  async getExchangeRate(req, res) {
    try {
      const payload = await getExchangeRateUseCase(req);
      return res.json(payload);
    } catch (error) {
      return handleApplicantControllerError(res, "Get Exchange Rate Error", error);
    }
  },
  async approveApplicant(req, res) {
    try {
      const payload = await approveApplicantUseCase(req);
      return res.json(payload);
    } catch (error) {
      return handleApplicantControllerError(res, "Approve Applicant Error", error);
    }
  },
  async approveAndMoveStage(req, res) {
    try {
      const payload = await approveAndMoveStageUseCase(req);
      return res.json(payload);
    } catch (error) {
      return handleApplicantControllerError(res, "Move Stage Error", error);
    }
  },
  async completeApplicant(req, res) {
    try {
      const payload = await completeApplicantUseCase(req);
      return res.json(payload);
    } catch (error) {
      return handleApplicantControllerError(res, "Complete Applicant Error", error);
    }
  },
  async updateApplicant(req, res) {
    try {
      const payload = await updateApplicantUseCase(req);
      return res.json(payload);
    } catch (error) {
      return handleApplicantControllerError(res, "Update Applicant Error", error);
    }
  }
};

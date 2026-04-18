const legacy = require("../applicantController");
const { createApplicantUseCase } = require("../../usecases/applicants/createApplicantUseCase");
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
  approveApplicant: legacy.approveApplicant,
  approveAndMoveStage: legacy.approveAndMoveStage,
  completeApplicant: legacy.completeApplicant,
  updateApplicant: legacy.updateApplicant
};

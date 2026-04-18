const legacy = require("../applicantController");
const { getApplicantsUseCase } = require("../../usecases/applicants/getApplicantsUseCase");
const {
  addAppointmentUseCase,
  approveAndMoveStageUseCase,
  approveAppointmentUseCase
} = require("../../usecases/applicants/workflowStageUseCases");
const {
  addDispatchUseCase,
  addEmbassyInterviewUseCase,
  addInterviewTicketUseCase,
  approveContractUseCase,
  approveEmbassyInterviewUseCase,
  getContractUseCase,
  getDispatchesUseCase,
  getEmbassyInterviewUseCase,
  getInterviewBiometricUseCase,
  getInterviewTicketUseCase,
  uploadContractUseCase,
  uploadInterviewBiometricUseCase
} = require("../../usecases/applicants/workflowExecutionUseCases");
const { handleApplicantControllerError } = require("./controllerHelpers");

async function getApplicants(req, res) {
  try {
    const payload = await getApplicantsUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Applicants Error", error);
  }
}

async function addAppointment(req, res) {
  try {
    const payload = await addAppointmentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Appointment Error", error);
  }
}

async function approveAppointment(req, res) {
  try {
    const payload = await approveAppointmentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Approve Appointment Error", error);
  }
}

async function approveAndMoveStage(req, res) {
  try {
    const payload = await approveAndMoveStageUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Move Stage Error", error);
  }
}

async function addDispatch(req, res) {
  try {
    const payload = await addDispatchUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Dispatch Error", error);
  }
}

async function getDispatches(req, res) {
  try {
    const payload = await getDispatchesUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Dispatches Error", error);
  }
}

async function uploadContract(req, res) {
  try {
    const payload = await uploadContractUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Upload Contract Error", error);
  }
}

async function approveContract(req, res) {
  try {
    const payload = await approveContractUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Approve Contract Error", error);
  }
}

async function getContract(req, res) {
  try {
    const payload = await getContractUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Contract Error", error);
  }
}

async function addEmbassyInterview(req, res) {
  try {
    const payload = await addEmbassyInterviewUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Embassy Interview Error", error);
  }
}

async function approveEmbassyInterview(req, res) {
  try {
    const payload = await approveEmbassyInterviewUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Approve Embassy Interview Error", error);
  }
}

async function getEmbassyInterview(req, res) {
  try {
    const payload = await getEmbassyInterviewUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Embassy Interview Error", error);
  }
}

async function addInterviewTicket(req, res) {
  try {
    const payload = await addInterviewTicketUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Interview Ticket Error", error);
  }
}

async function getInterviewTicket(req, res) {
  try {
    const payload = await getInterviewTicketUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Interview Ticket Error", error);
  }
}

async function uploadInterviewBiometric(req, res) {
  try {
    const payload = await uploadInterviewBiometricUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Upload Interview Biometric Error", error);
  }
}

async function getInterviewBiometric(req, res) {
  try {
    const payload = await getInterviewBiometricUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Interview Biometric Error", error);
  }
}

module.exports = {
  getApplicants,
  getApplicantById: legacy.getApplicantById,
  getApplicantWorkflowBundle: legacy.getApplicantWorkflowBundle,
  addAppointment,
  approveAppointment,
  approveAndMoveStage,
  addDispatch,
  getDispatches,
  uploadContract,
  approveContract,
  getContract,
  addEmbassyAppointment: legacy.addEmbassyAppointment,
  getEmbassyAppointment: legacy.getEmbassyAppointment,
  addTravelDetails: legacy.addTravelDetails,
  getTravelDetails: legacy.getTravelDetails,
  uploadBiometricSlip: legacy.uploadBiometricSlip,
  getBiometricSlip: legacy.getBiometricSlip,
  addEmbassyInterview,
  approveEmbassyInterview,
  getEmbassyInterview,
  addInterviewTicket,
  getInterviewTicket,
  uploadInterviewBiometric,
  getInterviewBiometric,
  addVisaCollection: legacy.addVisaCollection,
  approveVisaCollection: legacy.approveVisaCollection,
  getVisaCollection: legacy.getVisaCollection,
  addVisaTravel: legacy.addVisaTravel,
  getVisaTravel: legacy.getVisaTravel,
  uploadResidencePermit: legacy.uploadResidencePermit,
  getResidencePermit: legacy.getResidencePermit
};

const { getApplicantsUseCase } = require("../../usecases/applicants/getApplicantsUseCase");
const {
  getApplicantByIdUseCase,
  getApplicantDocumentsContextUseCase,
  getApplicantWorkflowBundleUseCase
} = require("../../usecases/applicants/profileReadUseCases");
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
  getInterviewWorkflowUseCase,
  getInterviewBiometricUseCase,
  getInterviewTicketUseCase,
  uploadContractUseCase,
  uploadInterviewBiometricUseCase
} = require("../../usecases/applicants/workflowExecutionUseCases");
const {
  addEmbassyAppointmentUseCase,
  addTravelDetailsUseCase,
  addVisaCollectionUseCase,
  addVisaTravelUseCase,
  approveVisaCollectionUseCase,
  getBiometricSlipUseCase,
  getEmbassyAppointmentUseCase,
  getEmbassyWorkflowUseCase,
  getResidencePermitUseCase,
  getTravelDetailsUseCase,
  getVisaCollectionUseCase,
  getVisaTravelUseCase,
  uploadBiometricSlipUseCase,
  uploadResidencePermitUseCase
} = require("../../usecases/applicants/workflowAdditionalUseCases");
const { handleApplicantControllerError } = require("./controllerHelpers");

async function getApplicants(req, res) {
  try {
    const payload = await getApplicantsUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Applicants Error", error);
  }
}

async function getApplicantById(req, res) {
  try {
    const payload = await getApplicantByIdUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Applicant Error", error);
  }
}

async function getApplicantWorkflowBundle(req, res) {
  try {
    const payload = await getApplicantWorkflowBundleUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Workflow Bundle Error", error);
  }
}

async function getApplicantDocumentsContext(req, res) {
  try {
    const payload = await getApplicantDocumentsContextUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Applicant Documents Context Error", error);
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

async function getInterviewWorkflow(req, res) {
  try {
    const payload = await getInterviewWorkflowUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Interview Workflow Error", error);
  }
}

async function addEmbassyAppointment(req, res) {
  try {
    const payload = await addEmbassyAppointmentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Embassy Appointment Error", error);
  }
}

async function getEmbassyAppointment(req, res) {
  try {
    const payload = await getEmbassyAppointmentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Embassy Appointment Error", error);
  }
}

async function addTravelDetails(req, res) {
  try {
    const payload = await addTravelDetailsUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Travel Details Error", error);
  }
}

async function getTravelDetails(req, res) {
  try {
    const payload = await getTravelDetailsUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Travel Details Error", error);
  }
}

async function uploadBiometricSlip(req, res) {
  try {
    const payload = await uploadBiometricSlipUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Upload Biometric Slip Error", error);
  }
}

async function getBiometricSlip(req, res) {
  try {
    const payload = await getBiometricSlipUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Biometric Slip Error", error);
  }
}

async function getEmbassyWorkflow(req, res) {
  try {
    const payload = await getEmbassyWorkflowUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Embassy Workflow Error", error);
  }
}

async function addVisaCollection(req, res) {
  try {
    const payload = await addVisaCollectionUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Visa Collection Error", error);
  }
}

async function approveVisaCollection(req, res) {
  try {
    const payload = await approveVisaCollectionUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Approve Visa Collection Error", error);
  }
}

async function getVisaCollection(req, res) {
  try {
    const payload = await getVisaCollectionUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Visa Collection Error", error);
  }
}

async function addVisaTravel(req, res) {
  try {
    const payload = await addVisaTravelUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Add Visa Travel Error", error);
  }
}

async function getVisaTravel(req, res) {
  try {
    const payload = await getVisaTravelUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Visa Travel Error", error);
  }
}

async function uploadResidencePermit(req, res) {
  try {
    const payload = await uploadResidencePermitUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Upload Residence Permit Error", error);
  }
}

async function getResidencePermit(req, res) {
  try {
    const payload = await getResidencePermitUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Residence Permit Error", error);
  }
}

module.exports = {
  getApplicants,
  getApplicantById,
  getApplicantDocumentsContext,
  getApplicantWorkflowBundle,
  addAppointment,
  approveAppointment,
  approveAndMoveStage,
  addDispatch,
  getDispatches,
  uploadContract,
  approveContract,
  getContract,
  addEmbassyAppointment,
  getEmbassyAppointment,
  addTravelDetails,
  getTravelDetails,
  uploadBiometricSlip,
  getBiometricSlip,
  getEmbassyWorkflow,
  addEmbassyInterview,
  approveEmbassyInterview,
  getEmbassyInterview,
  addInterviewTicket,
  getInterviewTicket,
  uploadInterviewBiometric,
  getInterviewBiometric,
  getInterviewWorkflow,
  addVisaCollection,
  approveVisaCollection,
  getVisaCollection,
  addVisaTravel,
  getVisaTravel,
  uploadResidencePermit,
  getResidencePermit
};

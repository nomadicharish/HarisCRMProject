const {
  approveDocumentUseCase,
  deferDocumentUseCase,
  getDocumentsUseCase,
  markDocumentSeenUseCase,
  rejectDocumentUseCase,
  uploadDocumentByTypeUseCase,
  uploadDocumentGenericUseCase
} = require("../../usecases/applicants/documentFlowUseCases");
const { handleApplicantControllerError } = require("./controllerHelpers");

async function uploadDocumentByType(req, res) {
  try {
    const payload = await uploadDocumentByTypeUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Upload Document Error", error);
  }
}

async function markDocumentSeen(req, res) {
  try {
    const payload = await markDocumentSeenUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Mark Seen Error", error);
  }
}

async function deferDocument(req, res) {
  try {
    const payload = await deferDocumentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Defer Document Error", error);
  }
}

async function uploadDocument(req, res) {
  try {
    const payload = await uploadDocumentGenericUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Upload Document Error", error);
  }
}

async function getDocuments(req, res) {
  try {
    const payload = await getDocumentsUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Get Documents Error", error);
  }
}

async function rejectDocument(req, res) {
  try {
    const payload = await rejectDocumentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Reject Document Error", error);
  }
}

async function approveDocument(req, res) {
  try {
    const payload = await approveDocumentUseCase(req);
    return res.json(payload);
  } catch (error) {
    return handleApplicantControllerError(res, "Approve Document Error", error);
  }
}

module.exports = {
  uploadDocumentByType,
  uploadDocument,
  getDocuments,
  markDocumentSeen,
  deferDocument,
  rejectDocument,
  approveDocument
};

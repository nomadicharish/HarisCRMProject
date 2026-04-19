const { enqueueJob, getJob, listJobs, registerJobProcessor } = require("../services/jobQueue");
const { executeAgentAction, getCatalog } = require("../services/agentActionService");

registerJobProcessor("AGENT_ACTION", async (payload = {}, context = {}) => {
  return executeAgentAction({
    operation: payload.operation,
    input: payload.input || {},
    actor: {
      uid: context.actorId || "",
      role: context.actorRole || ""
    },
    correlationId: payload.correlationId || ""
  });
});

async function enqueueAgentJob(req, res) {
  const job = await enqueueJob({
    type: req.body.type,
    payload: req.body.payload || {},
    actorId: req.user?.uid || "",
    actorRole: req.user?.role || ""
  });

  return res.status(202).json({
    message: "Agent job queued",
    job
  });
}

async function getAgentJob(req, res) {
  const job = await getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }

  return res.json(job);
}

async function listAgentJobs(req, res) {
  const items = await listJobs({ limit: req.query.limit });
  return res.json(items);
}

async function listActionCatalog(req, res) {
  return res.json(getCatalog());
}

async function executeAction(req, res) {
  const operation = req.body.operation;
  const input = req.body.input || {};
  const isAsync = Boolean(req.body.async);

  if (isAsync) {
    const job = enqueueJob({
      type: "AGENT_ACTION",
      payload: {
        operation,
        input,
        correlationId: req.correlationId || ""
      },
      actorId: req.user?.uid || "",
      actorRole: req.user?.role || ""
    });

    const awaitedJob = await job;

    return res.status(202).json({
      message: "Agent action queued",
      job: awaitedJob
    });
  }

  const result = await executeAgentAction({
    operation,
    input,
    actor: {
      uid: req.user?.uid || "",
      role: req.user?.role || ""
    },
    correlationId: req.correlationId || ""
  });

  return res.json({
    message: "Agent action executed",
    result
  });
}

async function getApplicantAction(req, res) {
  const applicantId = req.params.applicantId;
  const result = await executeAgentAction({
    operation: "APPLICANT_GET",
    input: { applicantId },
    actor: {
      uid: req.user?.uid || "",
      role: req.user?.role || ""
    },
    correlationId: req.correlationId || ""
  });

  return res.json({
    message: "Applicant fetched",
    result
  });
}

async function approveApplicantAction(req, res) {
  const applicantId = req.params.applicantId;
  const result = await executeAgentAction({
    operation: "APPLICANT_APPROVE",
    input: { applicantId },
    actor: {
      uid: req.user?.uid || "",
      role: req.user?.role || ""
    },
    correlationId: req.correlationId || ""
  });

  return res.json({
    message: "Applicant approved",
    result
  });
}

async function setApplicantStageAction(req, res) {
  const applicantId = req.params.applicantId;
  const stage = Number(req.body.stage);
  const result = await executeAgentAction({
    operation: "APPLICANT_SET_STAGE",
    input: { applicantId, stage },
    actor: {
      uid: req.user?.uid || "",
      role: req.user?.role || ""
    },
    correlationId: req.correlationId || ""
  });

  return res.json({
    message: "Applicant stage updated",
    result
  });
}

async function addApplicantNoteAction(req, res) {
  const applicantId = req.params.applicantId;
  const note = String(req.body.note || "");
  const result = await executeAgentAction({
    operation: "APPLICANT_ADD_NOTE",
    input: { applicantId, note },
    actor: {
      uid: req.user?.uid || "",
      role: req.user?.role || ""
    },
    correlationId: req.correlationId || ""
  });

  return res.json({
    message: "Applicant note added",
    result
  });
}

module.exports = {
  addApplicantNoteAction,
  approveApplicantAction,
  executeAction,
  enqueueAgentJob,
  getApplicantAction,
  getAgentJob,
  listActionCatalog,
  listAgentJobs,
  setApplicantStageAction
};

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

module.exports = {
  executeAction,
  enqueueAgentJob,
  getAgentJob,
  listActionCatalog,
  listAgentJobs
};

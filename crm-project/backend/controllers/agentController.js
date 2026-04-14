const { enqueueJob, getJob, listJobs } = require("../services/jobQueue");

async function enqueueAgentJob(req, res) {
  const job = enqueueJob({
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
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }

  return res.json(job);
}

async function listAgentJobs(req, res) {
  const items = listJobs({ limit: req.query.limit });
  return res.json(items);
}

module.exports = {
  enqueueAgentJob,
  getAgentJob,
  listAgentJobs
};

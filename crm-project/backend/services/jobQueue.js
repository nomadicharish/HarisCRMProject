const { logAuditEvent } = require("./auditLogService");

const jobs = new Map();

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function listJobs({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  return Array.from(jobs.values())
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, safeLimit);
}

function enqueueJob({
  type = "AGENT_ACTION",
  payload = {},
  actorId = "",
  actorRole = ""
} = {}) {
  const jobId = generateJobId();
  const now = Date.now();
  const job = {
    id: jobId,
    type,
    status: "QUEUED",
    payload,
    actorId,
    actorRole,
    createdAt: now,
    updatedAt: now,
    result: null,
    error: ""
  };

  jobs.set(jobId, job);

  logAuditEvent({
    actorId,
    actorRole,
    action: "JOB_ENQUEUED",
    entityType: "job",
    entityId: jobId,
    status: "INFO",
    metadata: { type }
  });

  setImmediate(async () => {
    const running = jobs.get(jobId);
    if (!running) return;
    running.status = "RUNNING";
    running.updatedAt = Date.now();

    try {
      // Scaffold behavior: execute no-op placeholder and mark complete.
      running.result = {
        message: "Job scaffold executed",
        processedType: running.type
      };
      running.status = "COMPLETED";
      running.updatedAt = Date.now();

      await logAuditEvent({
        actorId: running.actorId,
        actorRole: running.actorRole,
        action: "JOB_COMPLETED",
        entityType: "job",
        entityId: running.id,
        status: "SUCCESS",
        metadata: { type: running.type }
      });
    } catch (error) {
      running.status = "FAILED";
      running.error = error?.message || "Unknown queue failure";
      running.updatedAt = Date.now();

      await logAuditEvent({
        actorId: running.actorId,
        actorRole: running.actorRole,
        action: "JOB_FAILED",
        entityType: "job",
        entityId: running.id,
        status: "ERROR",
        metadata: { message: running.error }
      });
    }
  });

  return job;
}

module.exports = {
  enqueueJob,
  getJob,
  listJobs
};

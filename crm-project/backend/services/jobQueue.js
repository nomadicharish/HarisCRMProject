const { logAuditEvent } = require("./auditLogService");
const { logger } = require("../lib/logger");

let Queue = null;
let Worker = null;
let QueueEvents = null;
let IORedis = null;
try {
  ({ Queue, Worker, QueueEvents } = require("bullmq"));
  IORedis = require("ioredis");
} catch {
  // Optional dependency when memory provider is used.
}

const provider = String(process.env.JOB_QUEUE_PROVIDER || "memory").toLowerCase();
const queueName = String(process.env.BULLMQ_QUEUE_NAME || "agent-jobs");
const redisUrl = String(process.env.REDIS_URL || "");
const processors = new Map();

const memoryJobs = new Map();
let bullQueue = null;
let bullWorker = null;
let bullEvents = null;
let bullConnection = null;
let bullInitialized = false;

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapMemoryJob(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    payload: job.payload,
    actorId: job.actorId,
    actorRole: job.actorRole,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error || ""
  };
}

async function initBullIfNeeded() {
  if (provider !== "bullmq") return false;
  if (bullInitialized) return Boolean(bullQueue && bullWorker);
  bullInitialized = true;

  if (!Queue || !Worker || !QueueEvents || !IORedis) {
    logger.warn("BullMQ dependencies missing, falling back to memory queue");
    return false;
  }

  if (!redisUrl) {
    logger.warn("REDIS_URL missing for BullMQ provider, falling back to memory queue");
    return false;
  }

  try {
    bullConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null
    });

    bullQueue = new Queue(queueName, { connection: bullConnection });
    bullEvents = new QueueEvents(queueName, { connection: bullConnection });
    bullEvents.on("error", (error) => {
      logger.error("BullMQ queue events error", { message: error?.message });
    });

    bullWorker = new Worker(
      queueName,
      async (job) => {
        const processor = processors.get(String(job.name));
        if (!processor) {
          throw new Error(`No processor registered for job type ${job.name}`);
        }

        return processor(job.data?.payload || {}, {
          actorId: job.data?.actorId || "",
          actorRole: job.data?.actorRole || "",
          jobId: String(job.id || "")
        });
      },
      { connection: bullConnection }
    );

    bullWorker.on("failed", async (job, error) => {
      await logAuditEvent({
        actorId: job?.data?.actorId || "",
        actorRole: job?.data?.actorRole || "",
        action: "JOB_FAILED",
        entityType: "job",
        entityId: String(job?.id || ""),
        status: "ERROR",
        metadata: { message: error?.message || "Unknown queue failure" }
      });
    });

    bullWorker.on("completed", async (job) => {
      await logAuditEvent({
        actorId: job?.data?.actorId || "",
        actorRole: job?.data?.actorRole || "",
        action: "JOB_COMPLETED",
        entityType: "job",
        entityId: String(job?.id || ""),
        status: "SUCCESS",
        metadata: { type: job?.name || "" }
      });
    });

    logger.info("BullMQ provider initialized", { queueName });
    return true;
  } catch (error) {
    logger.warn("Failed to initialize BullMQ, falling back to memory queue", {
      message: error?.message
    });
    bullQueue = null;
    bullWorker = null;
    bullEvents = null;
    return false;
  }
}

async function enqueueMemoryJob({ type = "AGENT_ACTION", payload = {}, actorId = "", actorRole = "" } = {}) {
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

  memoryJobs.set(jobId, job);
  await logAuditEvent({
    actorId,
    actorRole,
    action: "JOB_ENQUEUED",
    entityType: "job",
    entityId: jobId,
    status: "INFO",
    metadata: { type }
  });

  setImmediate(async () => {
    const running = memoryJobs.get(jobId);
    if (!running) return;
    running.status = "RUNNING";
    running.updatedAt = Date.now();

    try {
      const processor = processors.get(running.type);
      if (!processor) {
        throw new Error(`No processor registered for job type ${running.type}`);
      }

      running.result = await processor(running.payload, {
        actorId: running.actorId,
        actorRole: running.actorRole,
        jobId: running.id
      });
      running.status = "COMPLETED";
      running.updatedAt = Date.now();
    } catch (error) {
      running.status = "FAILED";
      running.error = error?.message || "Unknown queue failure";
      running.updatedAt = Date.now();
    }
  });

  return mapMemoryJob(job);
}

async function enqueueBullJob({ type = "AGENT_ACTION", payload = {}, actorId = "", actorRole = "" } = {}) {
  const enabled = await initBullIfNeeded();
  if (!enabled || !bullQueue) {
    return enqueueMemoryJob({ type, payload, actorId, actorRole });
  }

  const job = await bullQueue.add(type, {
    payload,
    actorId,
    actorRole
  });

  await logAuditEvent({
    actorId,
    actorRole,
    action: "JOB_ENQUEUED",
    entityType: "job",
    entityId: String(job.id),
    status: "INFO",
    metadata: { type }
  });

  return {
    id: String(job.id),
    type,
    status: "QUEUED",
    payload,
    actorId,
    actorRole,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
    error: ""
  };
}

async function enqueueJob({ type = "AGENT_ACTION", payload = {}, actorId = "", actorRole = "" } = {}) {
  if (provider === "bullmq") {
    return enqueueBullJob({ type, payload, actorId, actorRole });
  }
  return enqueueMemoryJob({ type, payload, actorId, actorRole });
}

async function getMemoryJob(jobId) {
  const job = memoryJobs.get(jobId);
  return job ? mapMemoryJob(job) : null;
}

function mapBullState(state = "") {
  if (state === "completed") return "COMPLETED";
  if (state === "failed") return "FAILED";
  if (state === "active") return "RUNNING";
  if (state === "waiting" || state === "delayed") return "QUEUED";
  return "UNKNOWN";
}

async function getBullJob(jobId) {
  const enabled = await initBullIfNeeded();
  if (!enabled || !bullQueue) return getMemoryJob(jobId);

  const job = await bullQueue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();

  return {
    id: String(job.id),
    type: String(job.name || ""),
    status: mapBullState(state),
    payload: job.data?.payload || {},
    actorId: job.data?.actorId || "",
    actorRole: job.data?.actorRole || "",
    createdAt: job.timestamp || 0,
    updatedAt: (job.finishedOn || job.processedOn || job.timestamp || 0),
    result: job.returnvalue || null,
    error: job.failedReason || ""
  };
}

async function getJob(jobId) {
  if (provider === "bullmq") {
    return getBullJob(jobId);
  }
  return getMemoryJob(jobId);
}

async function listMemoryJobs({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  return Array.from(memoryJobs.values())
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, safeLimit)
    .map(mapMemoryJob);
}

async function listBullJobs({ limit = 50 } = {}) {
  const enabled = await initBullIfNeeded();
  if (!enabled || !bullQueue) return listMemoryJobs({ limit });

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const jobs = await bullQueue.getJobs(["waiting", "active", "completed", "failed", "delayed"], 0, safeLimit - 1, true);
  const items = await Promise.all(
    jobs.map(async (job) => {
      const state = await job.getState();
      return {
        id: String(job.id),
        type: String(job.name || ""),
        status: mapBullState(state),
        payload: job.data?.payload || {},
        actorId: job.data?.actorId || "",
        actorRole: job.data?.actorRole || "",
        createdAt: job.timestamp || 0,
        updatedAt: (job.finishedOn || job.processedOn || job.timestamp || 0),
        result: job.returnvalue || null,
        error: job.failedReason || ""
      };
    })
  );

  return items.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

async function listJobs({ limit = 50 } = {}) {
  if (provider === "bullmq") {
    return listBullJobs({ limit });
  }
  return listMemoryJobs({ limit });
}

function registerJobProcessor(type, processor) {
  if (!type || typeof processor !== "function") return;
  processors.set(String(type), processor);
}

module.exports = {
  enqueueJob,
  getJob,
  listJobs,
  registerJobProcessor
};

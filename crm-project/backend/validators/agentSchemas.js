const { z } = require("zod");

const optionalTrimmedString = z.string().trim().optional().or(z.literal(""));

const enqueueAgentJobSchema = z.object({
  type: z.string().trim().min(1).max(100).default("AGENT_ACTION"),
  payload: z.record(z.any()).optional().default({}),
  correlationId: optionalTrimmedString
});

const listJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

const jobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1)
});

module.exports = {
  enqueueAgentJobSchema,
  jobIdParamsSchema,
  listJobsQuerySchema
};

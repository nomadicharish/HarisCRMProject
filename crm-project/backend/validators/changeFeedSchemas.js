const { z } = require("zod");

const optionalTrimmedString = z.string().trim().optional().or(z.literal(""));

const listChangeFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  after: z.coerce.number().int().min(0).optional().default(0)
});

const createWebhookSchema = z.object({
  url: z.url("Valid webhook URL is required").transform((value) => value.trim()),
  eventType: optionalTrimmedString.optional().default(""),
  secret: optionalTrimmedString.optional().default("")
});

module.exports = {
  createWebhookSchema,
  listChangeFeedQuerySchema
};

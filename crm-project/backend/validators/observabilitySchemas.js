const { z } = require("zod");

const recentLimitQuerySchema = z.object({
  recentLimit: z.coerce.number().int().min(1).max(200).optional()
});

module.exports = {
  recentLimitQuerySchema
};


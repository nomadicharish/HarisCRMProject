const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const { verifyToken } = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const { validate } = require("../middleware/validate");
const {
  enqueueAgentJobSchema,
  jobIdParamsSchema,
  listJobsQuerySchema
} = require("../validators/agentSchemas");
const agentController = require("../controllers/agentController");

const router = express.Router();

router.use(verifyToken);
router.use(allowRoles("SUPER_USER", "ACCOUNTANT"));

router.post("/jobs", validate(enqueueAgentJobSchema), asyncHandler(agentController.enqueueAgentJob));
router.get("/jobs", validate(listJobsQuerySchema, "query"), asyncHandler(agentController.listAgentJobs));
router.get("/jobs/:jobId", validate(jobIdParamsSchema, "params"), asyncHandler(agentController.getAgentJob));

module.exports = router;

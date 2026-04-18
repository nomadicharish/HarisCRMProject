const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const { verifyToken } = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const { requireAgentScope, requireApplicantAccess } = require("../middleware/agentPolicy");
const { validate } = require("../middleware/validate");
const {
  executeAgentActionSchema,
  enqueueAgentJobSchema,
  jobIdParamsSchema,
  listJobsQuerySchema
} = require("../validators/agentSchemas");
const agentController = require("../controllers/agentController");

const router = express.Router();

router.use(verifyToken);
router.use(allowRoles("SUPER_USER", "ACCOUNTANT"));

router.get("/actions/catalog", requireAgentScope("agent.actions.read"), asyncHandler(agentController.listActionCatalog));
router.post(
  "/actions/execute",
  requireAgentScope("agent.actions.write"),
  validate(executeAgentActionSchema),
  requireApplicantAccess("applicantId"),
  asyncHandler(agentController.executeAction)
);

router.post("/jobs", requireAgentScope("agent.jobs.enqueue"), validate(enqueueAgentJobSchema), asyncHandler(agentController.enqueueAgentJob));
router.get("/jobs", requireAgentScope("agent.jobs.read"), validate(listJobsQuerySchema, "query"), asyncHandler(agentController.listAgentJobs));
router.get("/jobs/:jobId", requireAgentScope("agent.jobs.read"), validate(jobIdParamsSchema, "params"), asyncHandler(agentController.getAgentJob));

module.exports = router;

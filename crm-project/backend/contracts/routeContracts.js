const { applicantsListQuerySchema, createApplicantSchema } = require("../validators/applicantSchemas");
const { listCompaniesQuerySchema, listAgenciesQuerySchema, listEmployersQuerySchema } = require("../validators/entitySchemas");
const { enqueueAgentJobSchema, executeAgentActionSchema, listJobsQuerySchema } = require("../validators/agentSchemas");
const { listChangeFeedQuerySchema, createWebhookSchema } = require("../validators/changeFeedSchemas");

const routeContracts = [
  {
    method: "get",
    path: "/applicants",
    tags: ["Applicants"],
    summary: "List applicants",
    security: true,
    query: applicantsListQuerySchema
  },
  {
    method: "post",
    path: "/applicants/create",
    tags: ["Applicants"],
    summary: "Create applicant",
    security: true,
    body: createApplicantSchema
  },
  {
    method: "get",
    path: "/companies",
    tags: ["Entities"],
    summary: "List companies",
    security: true,
    query: listCompaniesQuerySchema
  },
  {
    method: "get",
    path: "/agencies",
    tags: ["Entities"],
    summary: "List agencies",
    security: true,
    query: listAgenciesQuerySchema
  },
  {
    method: "get",
    path: "/employers",
    tags: ["Entities"],
    summary: "List employers",
    security: true,
    query: listEmployersQuerySchema
  },
  {
    method: "post",
    path: "/agents/jobs",
    tags: ["Agents"],
    summary: "Enqueue async agent job",
    security: true,
    body: enqueueAgentJobSchema
  },
  {
    method: "get",
    path: "/agents/jobs",
    tags: ["Agents"],
    summary: "List agent jobs",
    security: true,
    query: listJobsQuerySchema
  },
  {
    method: "post",
    path: "/agents/actions/execute",
    tags: ["Agents"],
    summary: "Execute explicit agent action",
    security: true,
    body: executeAgentActionSchema
  },
  {
    method: "get",
    path: "/change-feed/events",
    tags: ["ChangeFeed"],
    summary: "List change feed events",
    security: true,
    query: listChangeFeedQuerySchema
  },
  {
    method: "post",
    path: "/change-feed/webhooks",
    tags: ["ChangeFeed"],
    summary: "Register change feed webhook",
    security: true,
    body: createWebhookSchema
  }
];

module.exports = { routeContracts };

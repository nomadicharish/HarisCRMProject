const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const entityController = require("../controllers/entityController");
const { verifyToken } = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const requireRight = require("../middleware/requireRight");
const { validate } = require("../middleware/validate");
const upload = require("../middleware/uploadMiddleware");
const { readCache } = require("../middleware/cacheControl");
const { noStore } = require("../middleware/noStore");
const {
  agencyPayloadSchema,
  companyPayloadSchema,
  countryPayloadSchema,
  documentTemplateBodySchema,
  documentTemplateParamsSchema,
  employerPayloadSchema,
  idParamSchema,
  listAgenciesQuerySchema,
  listCompaniesQuerySchema,
  listEmployersQuerySchema
} = require("../validators/entitySchemas");

const router = express.Router();

router.post("/add-country", verifyToken, allowRoles("SUPER_USER"), validate(countryPayloadSchema), asyncHandler(entityController.addCountry));
router.patch("/countries/:id", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), validate(countryPayloadSchema), asyncHandler(entityController.updateCountry));
router.get("/countries", verifyToken, readCache(60), asyncHandler(entityController.listCountries));

router.post("/add-company", verifyToken, requireRight("ADD_COMPANIES"), validate(companyPayloadSchema), asyncHandler(entityController.addCompany));
router.patch("/companies/:id", verifyToken, requireRight("ADD_COMPANIES"), validate(idParamSchema, "params"), validate(companyPayloadSchema), asyncHandler(entityController.updateCompany));
router.delete("/companies/:id", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), asyncHandler(entityController.deleteCompany));
router.get("/companies", verifyToken, requireRight("VIEW_COMPANIES"), noStore, validate(listCompaniesQuerySchema, "query"), asyncHandler(entityController.listCompanies));
router.post(
  "/companies/:id/document-template",
  verifyToken,
  allowRoles("SUPER_USER"),
  upload.single("file"),
  validate(documentTemplateParamsSchema, "params"),
  validate(documentTemplateBodySchema),
  asyncHandler(entityController.uploadDocumentTemplate)
);

router.post("/add-agency", verifyToken, allowRoles("SUPER_USER"), validate(agencyPayloadSchema), asyncHandler(entityController.addAgency));
router.patch("/agencies/:id", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), validate(agencyPayloadSchema), asyncHandler(entityController.updateAgency));
router.delete("/agencies/:id", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), asyncHandler(entityController.deleteAgency));
router.post("/agencies/:id/reset-password", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), asyncHandler(entityController.resetAgencyPassword));
router.get("/agencies", verifyToken, noStore, validate(listAgenciesQuerySchema, "query"), asyncHandler(entityController.listAgencies));

router.post("/add-employer", verifyToken, allowRoles("SUPER_USER"), validate(employerPayloadSchema), asyncHandler(entityController.addEmployer));
router.patch("/employers/:id", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), validate(employerPayloadSchema), asyncHandler(entityController.updateEmployer));
router.delete("/employers/:id", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), asyncHandler(entityController.deleteEmployer));
router.post("/employers/:id/reset-password", verifyToken, allowRoles("SUPER_USER"), validate(idParamSchema, "params"), asyncHandler(entityController.resetEmployerPassword));
router.get("/employers", verifyToken, noStore, validate(listEmployersQuerySchema, "query"), asyncHandler(entityController.listEmployers));

module.exports = router;

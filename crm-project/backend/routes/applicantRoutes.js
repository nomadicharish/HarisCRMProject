const express = require("express");
const router = express.Router();

const applicantController = require("../controllers/applicants");
const { asyncHandler } = require("../lib/asyncHandler");
const { noStore } = require("../middleware/noStore");
const { readCache } = require("../middleware/cacheControl");
const allowRoles = require("../middleware/roleMiddleware");
const { validate } = require("../middleware/validate");
const { verifyToken } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
  addPaymentSchema,
  applicantsListQuerySchema,
  applicantDocParamsSchema,
  applicantIdParamsSchema,
  appointmentBodySchema,
  appointmentParamsSchema,
  createApplicantSchema,
  dateTimeBodySchema,
  deferDocumentSchema,
  dispatchBodySchema,
  documentVersionParamsSchema,
  embassyAppointmentBodySchema,
  idDocTypeParamsSchema,
  idParamsSchema,
  interviewBodySchema,
  interviewOrStageParamsSchema,
  rejectDocumentSchema,
  residencePermitBodySchema,
  travelBodySchema,
  updateApplicantSchema,
  uploadDocumentBodySchema,
  visaTravelBodySchema
} = require("../validators/applicantSchemas");
const {
  addDispatch,
  getDispatches
} = require("../controllers/applicantController");
const uploadDoc = require("../middleware/upload");

router.use(verifyToken);
router.use(noStore);

// Create Applicant
router.post("/create", validate(createApplicantSchema), asyncHandler(applicantController.createApplicant));

// Approve Applicant
router.patch("/approve/:applicantId", validate(applicantIdParamsSchema, "params"), asyncHandler(applicantController.approveApplicant));

// Move stage
router.patch("/:applicantId/move-stage", validate(applicantIdParamsSchema, "params"), asyncHandler(applicantController.approveAndMoveStage));

// Mark Document as Seen
router.patch("/:applicantId/documents/:docType/seen", validate(applicantDocParamsSchema, "params"), asyncHandler(applicantController.markDocumentSeen));

// Defer Document
router.patch("/:applicantId/documents/:docType/defer", validate(applicantDocParamsSchema, "params"), validate(deferDocumentSchema), asyncHandler(applicantController.deferDocument));

// Add Payment
router.post(
  "/:applicantId/payments",
  validate(applicantIdParamsSchema, "params"),
  validate(addPaymentSchema),
  asyncHandler(applicantController.addPayment)
);

// Get Payment Summary
router.get(
  "/:applicantId/payments/summary",
  validate(applicantIdParamsSchema, "params"),
  asyncHandler(applicantController.getPaymentSummary)
);

// Add appointment
router.post(
  "/:applicantId/appointments/:type",
  validate(appointmentParamsSchema, "params"),
  validate(appointmentBodySchema),
  asyncHandler(applicantController.addAppointment)
);

// Approve appointment
router.patch(
  "/:applicantId/appointments/:type/approve",
  validate(appointmentParamsSchema, "params"),
  asyncHandler(applicantController.approveAppointment)
);

// Get Applicants (List)
router.get("/", readCache(20), validate(applicantsListQuerySchema, "query"), asyncHandler(applicantController.getApplicants));

// Get Applicant by ID
router.get("/:id", readCache(20), validate(idParamsSchema, "params"), asyncHandler(applicantController.getApplicantById));
router.get(
  "/:id/workflow-bundle",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getApplicantWorkflowBundle)
);

// Upload Document
router.post(
  "/:applicantId/documents/:docType/upload",
  upload.single("file"),
  validate(applicantDocParamsSchema, "params"),
  asyncHandler(applicantController.uploadDocumentByType)
);

// Approve and Move Stage (back-compat)
router.patch("/:id/approve-stage", validate(idParamsSchema, "params"), asyncHandler(applicantController.approveAndMoveStage));

// Upload Document (new route)
router.post(
  "/:id/upload-document",
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(uploadDocumentBodySchema),
  asyncHandler(applicantController.uploadDocument)
);

// Get Documents for Applicant
router.get("/:id/documents", readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getDocuments));

// Reject document (Super User)
router.patch(
  "/:id/documents/:docType/:versionId/reject",
  validate(documentVersionParamsSchema, "params"),
  validate(rejectDocumentSchema),
  asyncHandler(applicantController.rejectDocument)
);

// Defer document (Super User)
router.patch("/:id/documents/:docType/defer", validate(idDocTypeParamsSchema, "params"), validate(deferDocumentSchema), asyncHandler(applicantController.deferDocument));

// Approve document (Super User)
router.patch(
  "/:id/documents/:docType/:versionId/approve",
  validate(documentVersionParamsSchema, "params"),
  asyncHandler(applicantController.approveDocument)
);

// Add dispatch
router.post("/:id/dispatch", allowRoles("AGENCY"), validate(idParamsSchema, "params"), validate(dispatchBodySchema), asyncHandler(applicantController.addDispatch));

// Get dispatches
router.get("/:id/dispatch", readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getDispatches));

// Upload Contract
router.post(
  "/:id/contract",
  uploadDoc.single("file"),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.uploadContract)
);

// Approve Contract
router.patch(
  "/:id/contract/approve",
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.approveContract)
);

// Get Contract
router.post(
  "/:id/embassy-appointment",
  uploadDoc.single("file"),
  validate(idParamsSchema, "params"),
  validate(embassyAppointmentBodySchema),
  asyncHandler(applicantController.addEmbassyAppointment)
);

// Get Embassy Appointment
router.get(
  "/:id/embassy-appointment",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getEmbassyAppointment)
);

// Get Contract
router.get("/:id/contract", readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getContract));

// Add Travel Details
router.post(
  "/:id/travel",
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(travelBodySchema),
  asyncHandler(applicantController.addTravelDetails)
);

// Get Travel Details
router.get(
  "/:id/travel",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getTravelDetails)
);

// Upload Biometric Slip
router.post(
  "/:id/biometric",
  upload.single("file"),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.uploadBiometricSlip)
);

// Get Biometric Slip
router.get( 
  "/:id/biometric",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getBiometricSlip)
);

// Add Embassy Interview
router.post("/:id/interview", validate(idParamsSchema, "params"), validate(interviewBodySchema), asyncHandler(applicantController.addEmbassyInterview));

// Get Embassy Interview
router.get("/:id/interview", readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getEmbassyInterview));

// Approve Embassy Interview
router.patch("/:id/interview/approve", validate(idParamsSchema, "params"), asyncHandler(applicantController.approveEmbassyInterview));

// Add Interview Ticket
router.post(
  "/:id/interview-ticket",
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(dateTimeBodySchema),
  asyncHandler(applicantController.addInterviewTicket)
);

// Get Interview Ticket
router.get(
  "/:id/interview-ticket",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getInterviewTicket)
);

// Upload Interview Biometric
router.post(
  "/:id/interview-biometric",
  upload.single("file"),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.uploadInterviewBiometric)
);

// Get Interview Biometric
router.get(
  "/:id/interview-biometric",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getInterviewBiometric)
);

// Add Visa Collection
router.post(
  "/:id/visa-collection",
  validate(idParamsSchema, "params"),
  validate(dateTimeBodySchema),
  asyncHandler(applicantController.addVisaCollection)
);

// Approve Visa Collection
router.patch(
  "/:id/visa-collection/approve",
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.approveVisaCollection)
);

// Get Visa Collection
router.get(
  "/:id/visa-collection",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getVisaCollection)
);

// Add Visa Travel Details
router.post(
  "/:id/visa-travel",
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(visaTravelBodySchema),
  asyncHandler(applicantController.addVisaTravel)
);

// Get Visa Travel Details
router.get(
  "/:id/visa-travel",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getVisaTravel)
);

// Upload Residence Permit
router.post(
  "/:id/residence-permit",
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(residencePermitBodySchema),
  asyncHandler(applicantController.uploadResidencePermit)
);

// Get Residence Permit
router.get(
  "/:id/residence-permit",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getResidencePermit)
);

// Mark Applicant as Complete
router.patch(
  "/:id/complete",
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.completeApplicant)
);

// Update Applicant Details
router.patch("/:id", validate(idParamsSchema, "params"), validate(updateApplicantSchema), asyncHandler(applicantController.updateApplicant));

module.exports = router;

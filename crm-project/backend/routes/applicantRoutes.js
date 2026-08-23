const express = require("express");
const router = express.Router();

const applicantController = require("../controllers/applicants");
const { asyncHandler } = require("../lib/asyncHandler");
const { noStore } = require("../middleware/noStore");
const { readCache } = require("../middleware/cacheControl");
const allowRoles = require("../middleware/roleMiddleware");
const requireRight = require("../middleware/requireRight");
const requireAnyRight = require("../middleware/requireAnyRight");
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
  bulkDispatchBodySchema,
  createApplicantSchema,
  dateTimeBodySchema,
  deferDocumentSchema,
  dispatchBodySchema,
  documentVersionParamsSchema,
  embassyAppointmentBodySchema,
  idDocTypeParamsSchema,
  idParamsSchema,
  interviewBodySchema,
  paymentActionParamsSchema,
  rejectDocumentSchema,
  quickPrintAssetParamsSchema,
  residencePermitBodySchema,
  signedContractDocumentParamsSchema,
  travelBodySchema,
  updateApplicantSchema,
  uploadDocumentBodySchema,
  visaTravelBodySchema
} = require("../validators/applicantSchemas");
const uploadDoc = require("../middleware/upload");

router.use(verifyToken);
router.use(noStore);

// Create Applicant
router.post("/create", requireRight("CREATE_APPLICANT"), validate(createApplicantSchema), asyncHandler(applicantController.createApplicant));

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
  requireRight("ADD_PAYMENT_DETAILS"),
  upload.fields([
    { name: "documents", maxCount: 5 },
    { name: "file", maxCount: 1 }
  ]),
  validate(applicantIdParamsSchema, "params"),
  validate(addPaymentSchema),
  asyncHandler(applicantController.addPayment)
);

// Get Payment Summary
router.get(
  "/:applicantId/payments/summary",
  requireRight("VIEW_PAYMENT_DETAILS"),
  validate(applicantIdParamsSchema, "params"),
  asyncHandler(applicantController.getPaymentSummary)
);
router.get(
  "/:applicantId/payments-page",
  requireRight("VIEW_PAYMENT_DETAILS"),
  validate(applicantIdParamsSchema, "params"),
  asyncHandler(applicantController.getApplicantPaymentsPage)
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
router.get("/:id/private-file", validate(idParamsSchema, "params"), asyncHandler(applicantController.getApplicantPrivateFile));
router.get(
  "/:id/quick-print-assets/:assetType",
  allowRoles("EMPLOYER"),
  validate(quickPrintAssetParamsSchema, "params"),
  asyncHandler(applicantController.getApplicantQuickPrintAsset)
);
router.get("/:id", requireRight("VIEW_APPLICANT_PROFILE"), readCache(20), validate(idParamsSchema, "params"), asyncHandler(applicantController.getApplicantById));
router.get(
  "/:id/workflow-bundle",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getApplicantWorkflowBundle)
);
router.get(
  "/:id/documents-context",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getApplicantDocumentsContext)
);
router.get(
  "/:id/documents-page",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getApplicantDocumentsPage)
);

// Upload Document
router.post(
  "/:applicantId/documents/:docType/upload",
  requireRight("UPLOAD_DOCUMENT"),
  upload.single("file"),
  validate(applicantDocParamsSchema, "params"),
  asyncHandler(applicantController.uploadDocumentByType)
);

// Approve and Move Stage (back-compat)
router.patch("/:id/approve-stage", validate(idParamsSchema, "params"), asyncHandler(applicantController.approveAndMoveStage));

// Upload Document (new route)
router.post(
  "/:id/upload-document",
  requireRight("UPLOAD_DOCUMENT"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(uploadDocumentBodySchema),
  asyncHandler(applicantController.uploadDocument)
);

// Get Documents for Applicant
router.get("/:id/documents", requireRight("VIEW_DOCUMENTS"), readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getDocuments));

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

// Add bulk dispatch
router.post("/bulk-dispatch", requireRight("ADD_DOCUMENT_DISPATCH"), validate(bulkDispatchBodySchema), asyncHandler(applicantController.addBulkDispatch));

// Upload contracts for multiple applicants
router.post(
  "/bulk-contract",
  requireRight("ISSUE_CONTRACT"),
  uploadDoc.fields([
    { name: "file", maxCount: 1 },
    { name: "additionalDocuments", maxCount: 3 }
  ]),
  asyncHandler(applicantController.uploadBulkContract)
);

// Add dispatch
router.post("/:id/dispatch", requireRight("ADD_DOCUMENT_DISPATCH"), validate(idParamsSchema, "params"), validate(dispatchBodySchema), asyncHandler(applicantController.addDispatch));

// Get dispatches
router.get("/:id/dispatch", requireRight("VIEW_DOCUMENT_DISPATCH"), readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getDispatches));

// Upload Contract
router.post(
  "/:id/contract",
  requireRight("ISSUE_CONTRACT"),
  uploadDoc.fields([
    { name: "file", maxCount: 1 },
    { name: "additionalDocuments", maxCount: 3 }
  ]),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.uploadContract)
);
router.patch(
  "/:applicantId/payments/:paymentId/acknowledge", requireRight("ACKNOWLEDGE_PAYMENT"),
  validate(paymentActionParamsSchema, "params"),
  asyncHandler(applicantController.acknowledgePayment)
);
router.patch(
  "/:applicantId/payments/:paymentId/confirm", requireRight("CONFIRM_PAYMENT"),
  validate(paymentActionParamsSchema, "params"),
  asyncHandler(applicantController.confirmPayment)
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
  requireRight("INITIATE_EMBASSY_APPOINTMENT"),
  uploadDoc.single("file"),
  validate(idParamsSchema, "params"),
  validate(embassyAppointmentBodySchema),
  asyncHandler(applicantController.addEmbassyAppointment)
);

router.patch(
  "/:id/embassy-appointment/approve",
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.approveEmbassyAppointment)
);

// Get Embassy Appointment
router.get(
  "/:id/embassy-appointment",
  requireRight("VIEW_EMBASSY_APPOINTMENT"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getEmbassyAppointment)
);
router.get(
  "/:id/embassy-workflow",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getEmbassyWorkflow)
);

// Get Contract
router.get("/:id/contract", readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getContract));

// Upload Signed Contract
router.post(
  "/:id/signed-contract",
  requireRight("UPLOAD_SIGNED_CONTRACT"),
  uploadDoc.fields([
    { name: "file", maxCount: 1 },
    { name: "additionalDocuments", maxCount: 3 }
  ]),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.uploadSignedContract)
);

// Reject Signed Contract Document
router.patch(
  "/:id/signed-contract/:documentId/reject",
  validate(signedContractDocumentParamsSchema, "params"),
  asyncHandler(applicantController.rejectSignedContractDocument)
);

// Get Signed Contract
router.get(
  "/:id/signed-contract",
  requireRight("VIEW_SIGNED_CONTRACT"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getSignedContract)
);

// Add Travel Details
router.post(
  "/:id/travel",
  requireRight("ADD_APPOINTMENT_TRAVEL"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(travelBodySchema),
  asyncHandler(applicantController.addTravelDetails)
);

// Get Travel Details
router.get(
  "/:id/travel",
  requireRight("VIEW_APPOINTMENT_TRAVEL_BIOMETRIC"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getTravelDetails)
);

// Upload Biometric Slip
router.post(
  "/:id/biometric",
  requireRight("ADD_APPOINTMENT_BIOMETRIC"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.uploadBiometricSlip)
);

// Get Biometric Slip
router.get( 
  "/:id/biometric",
  requireRight("VIEW_APPOINTMENT_TRAVEL_BIOMETRIC"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getBiometricSlip)
);

// Add Embassy Interview
router.post(
  "/:id/interview",
  requireRight("INITIATE_EMBASSY_INTERVIEW"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(interviewBodySchema),
  asyncHandler(applicantController.addEmbassyInterview)
);

// Get Embassy Interview
router.get("/:id/interview", requireRight("VIEW_EMBASSY_INTERVIEW"), readCache(15), validate(idParamsSchema, "params"), asyncHandler(applicantController.getEmbassyInterview));

// Approve Embassy Interview
router.patch("/:id/interview/approve", validate(idParamsSchema, "params"), asyncHandler(applicantController.approveEmbassyInterview));

// Add Interview Ticket
router.post(
  "/:id/interview-ticket",
  requireRight("ADD_INTERVIEW_TRAVEL"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(dateTimeBodySchema),
  asyncHandler(applicantController.addInterviewTicket)
);

// Get Interview Ticket
router.get(
  "/:id/interview-ticket",
  requireRight("VIEW_INTERVIEW_TRAVEL_BIOMETRIC"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getInterviewTicket)
);

// Upload Interview Biometric
router.post(
  "/:id/interview-biometric",
  requireRight("ADD_INTERVIEW_BIOMETRIC"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.uploadInterviewBiometric)
);

// Get Interview Biometric
router.get(
  "/:id/interview-biometric",
  requireRight("VIEW_INTERVIEW_TRAVEL_BIOMETRIC"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getInterviewBiometric)
);
router.get(
  "/:id/interview-workflow",
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getInterviewWorkflow)
);

// Add Visa Collection
router.post(
  "/:id/visa-collection",
  requireRight("INITIATE_VISA_COLLECTION"),
  upload.single("file"),
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
  requireRight("VIEW_VISA_COLLECTION"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getVisaCollection)
);

// Add Visa Collection Travel Details
router.post(
  "/:id/visa-collection-travel",
  requireRight("ADD_VISA_TRAVEL"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(dateTimeBodySchema),
  asyncHandler(applicantController.addVisaCollectionTravel)
);

// Get Visa Collection Travel Details
router.get(
  "/:id/visa-collection-travel",
  requireRight("VIEW_VISA_TRAVEL"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getVisaCollectionTravel)
);

// Add Visa Travel Details
router.post(
  "/:id/visa-travel",
  requireRight("ADD_APPLICANT_ARRIVAL"),
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "busTicket", maxCount: 1 }
  ]),
  validate(idParamsSchema, "params"),
  validate(visaTravelBodySchema),
  asyncHandler(applicantController.addVisaTravel)
);

// Get Visa Travel Details
router.get(
  "/:id/visa-travel",
  requireAnyRight("VIEW_APPLICANT_ARRIVAL", "ADD_APPLICANT_ARRIVAL"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getVisaTravel)
);

// Upload Residence Permit
router.post(
  "/:id/residence-permit",
  requireRight("UPLOAD_TRC"),
  upload.single("file"),
  validate(idParamsSchema, "params"),
  validate(residencePermitBodySchema),
  asyncHandler(applicantController.uploadResidencePermit)
);

// Get Residence Permit
router.get(
  "/:id/residence-permit",
  requireRight("VIEW_TRC"),
  readCache(15),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.getResidencePermit)
);

// Mark Applicant as Complete
router.patch(
  "/:id/complete",
  requireRight("COMPLETE_APPLICANT_ARRIVAL"),
  validate(idParamsSchema, "params"),
  asyncHandler(applicantController.completeApplicant)
);

// Update Applicant Details
router.patch("/:id", validate(idParamsSchema, "params"), validate(updateApplicantSchema), asyncHandler(applicantController.updateApplicant));
router.delete("/:id", requireRight("DELETE_APPLICANT"), validate(idParamsSchema, "params"), asyncHandler(applicantController.deleteApplicant));

module.exports = router;

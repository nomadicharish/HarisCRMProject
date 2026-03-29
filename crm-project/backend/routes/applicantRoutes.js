const express = require("express");
const router = express.Router();

const applicantController = require("../controllers/applicantController");
const { verifyToken } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
  addDispatch,
  getDispatches
} = require("../controllers/applicantController");
const uploadDoc = require("../middleware/upload");

router.use(verifyToken);

// Create Applicant
router.post("/create", applicantController.createApplicant);

// Approve Applicant
router.patch("/approve/:applicantId", applicantController.approveApplicant);

// Move stage
router.patch("/:applicantId/move-stage", applicantController.approveAndMoveStage);

// Mark Document as Seen
router.patch("/:applicantId/documents/:docType/seen",applicantController.markDocumentSeen);

// Defer Document
router.patch("/:applicantId/documents/:docType/defer",applicantController.deferDocument);

// Add Payment
router.post(
  "/:applicantId/payments",
  applicantController.addPayment
);

// Get Payment Summary
router.get(
  "/:applicantId/payments/summary",
  applicantController.getPaymentSummary
);

// Add appointment
router.post(
  "/:applicantId/appointments/:type",
  applicantController.addAppointment
);

// Approve appointment
router.patch(
  "/:applicantId/appointments/:type/approve",
  applicantController.approveAppointment
);

// Get Applicants (List)
router.get("/", applicantController.getApplicants);

// Get Applicant by ID
router.get("/:id", applicantController.getApplicantById);

// Upload Document
router.post(
  "/:applicantId/documents/:docType/upload",
  upload.single("file"),
  applicantController.uploadDocumentByType
);

// Approve and Move Stage (back-compat)
router.patch("/:id/approve-stage", applicantController.approveAndMoveStage);

// Upload Document (new route)
router.post(
  "/:id/upload-document",
  verifyToken,
  upload.single("file"),
  applicantController.uploadDocument
);

// Get Documents for Applicant
router.get("/:id/documents", verifyToken, applicantController.getDocuments);

// Reject document (Super User)
router.patch(
  "/:id/documents/:docType/:versionId/reject",
  verifyToken,
  applicantController.rejectDocument
);

// Defer document (Super User)
router.patch("/:id/documents/:docType/defer", verifyToken, applicantController.deferDocument);

// Approve document (Super User)
router.patch(
  "/:id/documents/:docType/:versionId/approve",
  verifyToken,
  applicantController.approveDocument
);

// Add dispatch
router.post("/:id/dispatch", verifyToken, applicantController.addDispatch);

// Get dispatches
router.get("/:id/dispatch", verifyToken, applicantController.getDispatches);

// Upload Contract
router.post(
  "/:id/contract",
  verifyToken,
  uploadDoc.single("file"),
  applicantController.uploadContract
);

// Get Contract
router.post(
  "/:id/embassy-appointment",
  verifyToken,
  uploadDoc.single("file"),
  applicantController.addEmbassyAppointment
);

// Get Embassy Appointment
router.get(
  "/:id/embassy-appointment",
  verifyToken,
  applicantController.getEmbassyAppointment
);

// Get Contract
router.get("/:id/contract", verifyToken, applicantController.getContract);

// Add Travel Details
router.post(
  "/:id/travel",
  verifyToken,
  upload.single("file"),
  applicantController.addTravelDetails
);

// Get Travel Details
router.get(
  "/:id/travel",
  verifyToken,
  applicantController.getTravelDetails
);

// Upload Biometric Slip
router.post(
  "/:id/biometric",
  verifyToken,
  upload.single("file"),
  applicantController.uploadBiometricSlip
);

// Get Biometric Slip
router.get( 
  "/:id/biometric",
  verifyToken,
  applicantController.getBiometricSlip
);

// Add Embassy Interview
router.post("/:id/interview", verifyToken, applicantController.addEmbassyInterview);

// Get Embassy Interview
router.get("/:id/interview", verifyToken, applicantController.getEmbassyInterview);

// Approve Embassy Interview
router.patch("/:id/interview/approve", verifyToken, applicantController.approveEmbassyInterview);

// Add Interview Ticket
router.post(
  "/:id/interview-ticket",
  verifyToken,
  upload.single("file"),
  applicantController.addInterviewTicket
);

// Get Interview Ticket
router.get(
  "/:id/interview-ticket",
  verifyToken,
  applicantController.getInterviewTicket
);

// Upload Interview Biometric
router.post(
  "/:id/interview-biometric",
  verifyToken,
  upload.single("file"),
  applicantController.uploadInterviewBiometric
);

// Get Interview Biometric
router.get(
  "/:id/interview-biometric",
  verifyToken,
  applicantController.getInterviewBiometric
);

// Add Visa Collection
router.post(
  "/:id/visa-collection",
  verifyToken,
  applicantController.addVisaCollection
);

// Approve Visa Collection
router.patch(
  "/:id/visa-collection/approve",
  verifyToken,
  applicantController.approveVisaCollection
);

// Get Visa Collection
router.get(
  "/:id/visa-collection",
  verifyToken,
  applicantController.getVisaCollection
);

// Add Visa Travel Details
router.post(
  "/:id/visa-travel",
  verifyToken,
  upload.single("file"),
  applicantController.addVisaTravel
);

// Get Visa Travel Details
router.get(
  "/:id/visa-travel",
  verifyToken,
  applicantController.getVisaTravel
);

// Upload Residence Permit
router.post(
  "/:id/residence-permit",
  verifyToken,
  upload.single("file"),
  applicantController.uploadResidencePermit
);

// Get Residence Permit
router.get(
  "/:id/residence-permit",
  verifyToken,
  applicantController.getResidencePermit
);

// Mark Applicant as Complete
router.patch(
  "/:id/complete",
  verifyToken,
  applicantController.completeApplicant
);

module.exports = router;

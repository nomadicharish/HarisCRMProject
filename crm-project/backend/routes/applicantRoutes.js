const express = require("express");
const router = express.Router();

const applicantController = require("../controllers/applicantController");
const { verifyToken } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

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
  "/:id/documents/:docType/reject",
  verifyToken,
  applicantController.rejectDocument
);

router.patch("/:id/documents/:docType/defer", verifyToken, applicantController.deferDocument);

module.exports = router;

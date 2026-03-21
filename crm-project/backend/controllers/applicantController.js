const { admin, db } = require("../config/firebase");

// ===============================
// CREATE APPLICANT
// ===============================



const createApplicant = async (req, res) => {
  const userRole = req.user?.role || "SUPER_USER";
  const userId = req.user?.uid || "testUser123";

  let assignedAgencyId = null;

  if (userRole === "AGENCY") {
    assignedAgencyId = req.user?.agencyId || userId;
  } else if (userRole === "SUPER_USER") {
    assignedAgencyId = req.body.agencyId || null;
  } else {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (!assignedAgencyId) {
    return res.status(400).json({ message: "Agency must be assigned" });
  }
  try {
    const {
      firstName,
      lastName,
      dob,
      countryId,
      companyId,
      totalAmount,
      amountPaid,
      currency,
      totalApplicantPayment,
      totalEmployerPayment
    } = req.body;

    const toNumber = (value) => {
      if (value === null || value === undefined || value === "") return 0;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const companySnap = await db.collection("companies").doc(companyId).get();
    const companyPaymentPerApplicant = companySnap.exists
      ? toNumber(companySnap.data()?.companyPaymentPerApplicant)
      : 0;

    const normalizedTotalApplicantPayment = toNumber(
      totalApplicantPayment ?? totalAmount
    );
    const normalizedTotalEmployerPayment = toNumber(
      totalEmployerPayment ?? companyPaymentPerApplicant
    );
    const normalizedAmountPaid = toNumber(amountPaid);

    const approvalStatus =
      userRole === "AGENCY" ? "pending" : "approved";

    const applicant = {
      personalDetails: {
        firstName,
        lastName,
        dob
      },
      countryId,
      companyId,
      agencyId: assignedAgencyId,
      createdBy: userId,
      approvalStatus,
      stage: 1,
      stageStatus: "ongoing",
      totalApplicantPayment: normalizedTotalApplicantPayment,
      totalEmployerPayment: normalizedTotalEmployerPayment,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Create applicant
    const docRef = await db.collection("applicants").add(applicant);
    const applicantId = docRef.id;

    console.log("DEBUG companyId:", companyId);

    // 🔹 Copy document templates from company
    const templatesSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("documentTemplates")
      .get();

      console.log("DEBUG companyId:", companyId);
    const batch = db.batch();

    templatesSnap.forEach((doc) => {
      const template = doc.data();

      const applicantDocRef = db
        .collection("applicants")
        .doc(applicantId)
        .collection("documents")
        .doc(template.docType);

      batch.set(applicantDocRef, {
        docType: template.docType,
        label: template.label,
        required: template.required,

        uploaded: false,
        fileUrl: null,

        deferred: false,

        uploadedBy: null,
        uploadedAt: null,

        seenBy: {
          agency: [],
          employer: []
        }
      });
    });

    await batch.commit();

    if (normalizedAmountPaid > 0) {
      const initialPayment = {
        type: "APPLICANT",
        amount: normalizedAmountPaid,
        currency: currency || "INR",
        note: "Initial payment",
        paidBy: userRole,
        paidTo: "SUPER_USER",
        paidDate: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db
        .collection("applicants")
        .doc(applicantId)
        .collection("payments")
        .add(initialPayment);
    }

    return res.status(201).json({
      message: "Applicant created successfully",
      applicantId
    });

  } catch (error) {
    console.error("Create Applicant Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// ===============================
// UPLOAD DOCUMENT (BY TYPE)
// ===============================

const uploadDocumentByType = async (req, res) => {
  try {
    const { applicantId, docType } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const userId = req.user?.uid || "testUser123";
    const userRole = req.user?.role || "SUPER_USER";

    // Firebase Storage
    const bucket = admin.storage().bucket();

    const fileName = `${docType}-${Date.now()}`;
    const filePath = `applicants/${applicantId}/documents/${fileName}`;

    const fileUpload = bucket.file(filePath);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype
      }
    });

    const [fileUrl] = await fileUpload.getSignedUrl({
      action: "read",
      expires: "03-01-2035"
    });

    // Update Firestore document
    const docRef = db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType);

    await docRef.update({
        uploaded: true,
        fileUrl,
        uploadedBy: userId,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),

        // Clear defer automatically
        deferred: false,
        deferredAt: null,
        deferredBy: null,
        deferReason: null
      });

    return res.json({
      message: "Document uploaded successfully",
      fileUrl
    });

  } catch (error) {
    console.error("Upload Document Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===============================
// MARK DOCUMENT SEEN
// ===============================

const markDocumentSeen = async (req, res) => {
  try {
    const { applicantId, docType } = req.params;

    const userId = req.user?.uid || "testUser123";
    const userRole = req.user?.role || "AGENCY"; // AGENCY or EMPLOYER

    if (!["AGENCY", "EMPLOYER"].includes(userRole)) {
      return res.status(403).json({ message: "Invalid role" });
    }

    const docRef = db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType);

    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: "Document not found" });
    }

    const roleKey = userRole.toLowerCase(); // agency / employer

    await docRef.update({
      [`seenBy.${roleKey}`]: admin.firestore.FieldValue.arrayUnion(userId)
    });

    return res.json({ message: "Document marked as seen" });

  } catch (error) {
    console.error("Mark Seen Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===============================
// DEFER DOCUMENT
// ===============================

const deferDocument = async (req, res) => {
  try {
    const { applicantId, docType } = req.params;
    const { reason } = req.body;

    const userId = req.user?.uid || "testUser123";
    const userRole = req.user?.role || "AGENCY";

    // Only Agency can defer
    if (userRole !== "AGENCY") {
      return res.status(403).json({ message: "Only Agency can defer documents" });
    }

    const docRef = db
      .collection("applicants")
      .doc(applicantId)
      .collection("documents")
      .doc(docType);

    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: "Document not found" });
    }

    await docRef.update({
      deferred: true,
      deferredAt: admin.firestore.FieldValue.serverTimestamp(),
      deferredBy: userId,
      deferReason: reason || "Deferred by agency"
    });

    return res.json({ message: "Document marked as deferred" });

  } catch (error) {
    console.error("Defer Document Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// ===============================
// ADD PAYMENT
// ===============================
const addPayment = async (req, res) => {
  try {

   
    const { applicantId } = req.params;
    const { type, amount, currency, note } = req.body;

    const userId = req.user?.uid || "testUser123";
    const userRole = req.user?.role || "SUPER_USER";

    if (!["APPLICANT", "EMPLOYER"].includes(type)) {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    // Role rules
    if (
      (type === "APPLICANT" && !["AGENCY", "SUPER_USER"].includes(userRole)) ||
      (type === "EMPLOYER" && !["SUPER_USER", "ACCOUNTANT"].includes(userRole))
    ) {
      return res.status(403).json({ message: "Not allowed to add this payment" });
    }

     // Check installment limit (only for applicant payments)
      if (type === "APPLICANT") {
        const paymentsSnap = await db
          .collection("applicants")
          .doc(applicantId)
          .collection("payments")
          .where("type", "==", "APPLICANT")
          .get();

        if (paymentsSnap.size >= 4) {
          return res.status(400).json({
            message: "Maximum 4 installments allowed"
          });
        }
      }

    const payment = {
      type,
      amount,
      currency,
      note: note || "",
      paidBy: userRole,
      paidTo: type === "APPLICANT" ? "SUPER_USER" : "EMPLOYER",
      paidDate: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db
      .collection("applicants")
      .doc(applicantId)
      .collection("payments")
      .add(payment);

    return res.json({ message: "Payment added successfully" });

  } catch (error) {
    console.error("Add Payment Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===============================
// GET PAYMENT SUMMARY
// ===============================

const getPaymentSummary = async (req, res) => {
  try {
    const { applicantId } = req.params;

    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const applicant = applicantSnap.data();

    const paymentsSnap = await applicantRef.collection("payments").get();

    let applicantPaid = 0;
    let employerPaid = 0;

    paymentsSnap.forEach(doc => {
      const p = doc.data();
      if (p.type === "APPLICANT") applicantPaid += p.amount;
      if (p.type === "EMPLOYER") employerPaid += p.amount;
    });

    return res.json({
      applicant: {
        total: applicant.totalApplicantPayment || 0,
        paid: applicantPaid,
        pending: (applicant.totalApplicantPayment || 0) - applicantPaid
      },
      employer: {
        total: applicant.totalEmployerPayment || 0,
        paid: employerPaid,
        pending: (applicant.totalEmployerPayment || 0) - employerPaid
      }
    });

  } catch (error) {
    console.error("Payment Summary Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===============================
// GET APPLICANTS (LIST)
// ===============================
const getApplicants = async (req, res) => {
  try {
    const userRole = req.user?.role || "SUPER_USER";
    const userId = req.user?.uid || null;
    const agencyId = req.user?.agencyId || null;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let snap = null;
    let query = db.collection("applicants");

    if (userRole === "AGENCY") {
      const primaryAgencyId = agencyId || userId;
      const primarySnap = await query.where("agencyId", "==", primaryAgencyId).get();

      if (agencyId && agencyId !== userId) {
        const legacySnap = await query.where("agencyId", "==", userId).get();
        const byId = new Map();
        primarySnap.docs.forEach((d) => byId.set(d.id, d));
        legacySnap.docs.forEach((d) => byId.set(d.id, d));
        snap = { docs: Array.from(byId.values()) };
      } else {
        snap = primarySnap;
      }
    } else if (userRole === "EMPLOYER") {
      const userDoc = await db.collection("users").doc(userId).get();
      const employerId = userDoc.exists ? userDoc.data()?.employerId : null;

      if (!employerId) {
        return res.status(400).json({ message: "Employer profile not linked" });
      }

      const employerDoc = await db.collection("employers").doc(employerId).get();
      const companyId = employerDoc.exists ? employerDoc.data()?.companyId : null;

      if (!companyId) {
        return res.status(400).json({ message: "Employer company not linked" });
      }

      query = query.where("companyId", "==", companyId);
      snap = await query.get();
    } else if (!["SUPER_USER", "ACCOUNTANT"].includes(userRole)) {
      return res.status(403).json({ message: "Unauthorized" });
    } else {
      snap = await query.get();
    }

    const companyIds = new Set();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data?.companyId) companyIds.add(data.companyId);
    });

    const companyIdToName = {};
    await Promise.all(
      Array.from(companyIds).map(async (companyId) => {
        const companyDoc = await db.collection("companies").doc(companyId).get();
        companyIdToName[companyId] = companyDoc.exists
          ? companyDoc.data()?.name || ""
          : "";
      })
    );

    const applicants = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();

        const firstName = data?.personalDetails?.firstName || "";
        const lastName = data?.personalDetails?.lastName || "";

        let applicantPaid = 0;
        const paymentsSnap = await db
          .collection("applicants")
          .doc(d.id)
          .collection("payments")
          .where("type", "==", "APPLICANT")
          .get();

        paymentsSnap.forEach((p) => {
          const amount = Number(p.data()?.amount);
          if (Number.isFinite(amount)) applicantPaid += amount;
        });

        const total = Number(data?.totalApplicantPayment) || 0;

        return {
          id: d.id,
          ...data,
          firstName,
          lastName,
          companyName: data?.companyId ? companyIdToName[data.companyId] : "",
          payment: {
            total,
            paid: applicantPaid,
            pending: total - applicantPaid
          }
        };
      })
    );

    return res.json(applicants);
  } catch (error) {
    console.error("Get Applicants Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===============================
// APPROVE APPLICANT
// ===============================
const approveApplicant = async (req, res) => {
  try {
    const { applicantId } = req.params;

    const userRole = req.user?.role || "SUPER_USER";
    const userId = req.user?.uid || "testSuperUser";

    if (userRole !== "SUPER_USER") {
      return res.status(403).json({ message: "Only SUPER_USER can approve" });
    }

    const ref = db.collection("applicants").doc(applicantId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const data = snap.data();
    if (data.approvalStatus === "approved") {
      return res.status(400).json({ message: "Already approved" });
    }

    await ref.update({
      approvalStatus: "approved",
      approvedBy: userId,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ message: "Applicant approved successfully" });

  } catch (error) {
    console.error("Approve Applicant Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===============================
// ADD APPOINTMENT
// ===============================
const addAppointment = async (req, res) => {
  try {
    const { applicantId, type } = req.params;
    const { date, time } = req.body;

    const userId = req.user?.uid || "testUser123";
    const userRole = req.user?.role || "EMPLOYER";

    const allowedTypes = ["BIOMETRIC", "INTERVIEW", "VISA_COLLECTION"];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid appointment type" });
    }

    // Role rules
    if (!["EMPLOYER", "SUPER_USER"].includes(userRole)) {
      return res.status(403).json({ message: "Not allowed to add appointment" });
    }

    // All appointments require approval,
// but auto-approve if added by Super User
const autoApprove = userRole === "SUPER_USER";
    const appointment = {
      type,
      date,
      time,

      addedBy: userId,
      addedRole: userRole,

      approved: autoApprove,
      approvedBy: autoApprove ? userId : null,
      approvedAt: autoApprove
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,

      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db
      .collection("applicants")
      .doc(applicantId)
      .collection("appointments")
      .doc(type)
      .set(appointment);

    return res.json({ message: "Appointment added successfully" });

  } catch (error) {
    console.error("Add Appointment Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// ===============================
// APPROVE APPOINTMENT
// ===============================
const approveAppointment = async (req, res) => {
  try {
    const { applicantId, type } = req.params;

    const userId = req.user?.uid || "testUser123";
    const userRole = req.user?.role || "SUPER_USER";

    if (userRole !== "SUPER_USER") {
      return res.status(403).json({ message: "Only Super User can approve" });
    }

    const applicantRef = db.collection("applicants").doc(applicantId);
    const appointmentRef = applicantRef
      .collection("appointments")
      .doc(type);

    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Approve appointment
    await appointmentRef.update({
      approved: true,
      approvedBy: userId,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 🔁 AUTO STAGE MOVE BASED ON APPOINTMENT TYPE
    let newStage = null;

    if (type === "BIOMETRIC") newStage = 7;
    if (type === "INTERVIEW") newStage = 9;
    if (type === "VISA_COLLECTION") newStage = 11;

    if (newStage !== null) {
      const applicantSnap = await applicantRef.get();
      const currentStage = applicantSnap.data().stage || 1;

      // Move only forward unless super user overrides manually elsewhere
      if (newStage > currentStage) {
        await applicantRef.update({ stage: newStage });

        // Stage log
        await db.collection("stageLogs").add({
          applicantId,
          fromStage: currentStage,
          toStage: newStage,
          role: "SUPER_USER",
          action: `AUTO_MOVE_AFTER_${type}_APPROVAL`,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    return res.json({
      message: "Appointment approved and stage updated if applicable"
    });

  } catch (error) {
    console.error("Approve Appointment Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const getAllowedRoleForStage = (stage) => {
  if (stage >= 1 && stage <= 3) return "AGENCY";
  if (stage >= 4 && stage <= 10) return "EMPLOYER";
  if (stage >= 11 && stage <= 13) return "AGENCY";
  if (stage === 14) return "SUPER_USER";
  return null;
};


// ===============================
// MOVE STAGE
// ===============================
const approveAndMoveStage = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only SUPER USER can approve stage
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve stages"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const applicant = doc.data();

    const currentStage = applicant.stage || 1;

    // ✅ Max stages
    const MAX_STAGE = 5;

    if (currentStage >= MAX_STAGE) {
      return res.status(400).json({
        message: "Applicant already at final stage"
      });
    }

    // ================================
    // 📄 DOCUMENT VALIDATION (ONLY STAGE 2 → 3)
    // ================================
    if (currentStage === 2) {

      const docsSnap = await db
        .collection("applicants")
        .doc(applicantId)
        .collection("documents")
        .get();

      const uploadedDocs = {};

      docsSnap.forEach(doc => {
        uploadedDocs[doc.id] = doc.data();
      });

      // ✅ Required documents
      let requiredDocs = [
        "PASSPORT",
        "PAN_CARD",
        "EDUCATION_10TH",
        "EDUCATION_12TH",
        "PHOTO",
        "BIRTH_CERTIFICATE",
        "MEDICAL_CERTIFICATE"
      ];

      // ✅ Conditional documents
      if (applicant.maritalStatus === "Single") {
        requiredDocs.push("UNMARRIED_CERTIFICATE");
      }

      if (applicant.maritalStatus === "Married") {
        requiredDocs.push("MARRIAGE_CERTIFICATE");
      }

      // ❌ Validate documents
      for (let docType of requiredDocs) {

        if (!uploadedDocs[docType]) {
          return res.status(400).json({
            message: `Missing required document: ${docType}`
          });
        }

        if (uploadedDocs[docType].status !== "APPROVED") {
          return res.status(400).json({
            message: `Document not approved: ${docType}`
          });
        }
      }
    }

    // ================================
    // 🚀 MOVE TO NEXT STAGE
    // ================================
    const nextStage = currentStage + 1;

    await docRef.update({
      stage: nextStage,
      stageUpdatedAt: new Date(),
      lastActionBy: req.user.uid
    });

    res.json({
      message: "Stage approved and moved successfully",
      previousStage: currentStage,
      newStage: nextStage
    });

  } catch (error) {

    console.error("Move Stage Error:", error);

    res.status(500).json({
      message: "Internal Server Error"
    });
  }
};

// ===============================
// GET APPLICANT BY ID (WITH COMPANY & AGENCY NAME)
// ===============================
const getApplicantById = async (req, res) => {
  try {

    const applicantId = req.params.id;

    const doc = await db.collection("applicants").doc(applicantId).get();

    if (!doc.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const applicant = doc.data();

    // Fetch company name
    let companyName = "";
    if (applicant.companyId) {
      const companyDoc = await db
        .collection("companies")
        .doc(applicant.companyId)
        .get();

      companyName = companyDoc.exists ? companyDoc.data().name : "";
    }

    // Fetch agency name
    let agencyName = "";
    if (applicant.agencyId) {
      const agencyDoc = await db
        .collection("agencies")
        .doc(applicant.agencyId)
        .get();

      agencyName = agencyDoc.exists ? agencyDoc.data().name : "";
    }

    res.json({
      id: doc.id,
      ...applicant,
      companyName,
      agencyName
    });

  } catch (error) {

    console.error("Get Applicant Error:", error);

    res.status(500).json({
      message: "Internal Server Error"
    });

  }
};

// ===============================
// GET APPLICANTS (LIST)
// ===============================
exports.getApplicants = async (req, res) => {
  try {

    const snapshot = await db.collection("applicants").get();

    const applicants = [];

    snapshot.forEach(doc => {
      applicants.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json(applicants);

  } catch (error) {

    console.error("Get Applicants Error:", error);

    res.status(500).json({
      message: "Internal Server Error"
    });

  }
};

// ===============================
// UPLOAD DOCUMENT
// ===============================  
exports.uploadDocument = async (req, res) => {
  try {

    const { id } = req.params;
    const { documentType } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    if (!documentType) {
      return res.status(400).json({ message: "Document type required" });
    }

    const bucket = admin.storage().bucket();

    const fileName = `applicants/${id}/${documentType}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    await db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(documentType)
      .set({
        fileUrl,
        status: "PENDING",
        rejectedReason: "",
        uploadedAt: new Date()
      });

    res.json({
      message: "Uploaded",
      documentType
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET DOCUMENTS FOR APPLICANT
// ===============================
exports.getDocuments = async (req, res) => {
  try {

    const snapshot = await db
      .collection("applicants")
      .doc(req.params.id)
      .collection("documents")
      .get();

    const docs = {};

    snapshot.forEach(doc => {
      docs[doc.id] = doc.data();
    });

    res.json(docs);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// REJECT DOCUMENT
// ===============================  
exports.rejectDocument = async (req, res) => {
  try {

    const { id, docType } = req.params;
    const { reason } = req.body;

    await db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(docType)
      .update({
        status: "REJECTED",
        rejectedReason: reason || "",
        reviewedAt: new Date()
      });

    res.json({ message: "Document rejected" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// DEFER DOCUMENT
// ===============================
exports.deferDocument = async (req, res) => {
  try {

    const { id, docType } = req.params;

    await db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(docType)
      .set({
        status: "DEFERRED",
        deferredAt: new Date()
      });

    res.json({ message: "Document deferred" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ EXPORTS (THIS IS CRITICAL)
module.exports = {
  createApplicant,
  getApplicants,
  approveApplicant,
  getApplicantById, 
  approveAndMoveStage,
  // Generic upload route: POST /:id/upload-document
  uploadDocument: exports.uploadDocument,
  // Template/type upload route: POST /:applicantId/documents/:docType/upload
  uploadDocumentByType,
  markDocumentSeen,
  deferDocument,
  addPayment,
  getPaymentSummary,
  approveAppointment,
  addAppointment,
  getDocuments: exports.getDocuments,
  rejectDocument: exports.rejectDocument
};

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
    const personalDetails = req.body.personalDetails || {};

    const {
      firstName = personalDetails.firstName,
      lastName = personalDetails.lastName,
      dob = personalDetails.dob,
      age = personalDetails.age,
      address = personalDetails.address,
      phone = personalDetails.phone,
      maritalStatus = personalDetails.maritalStatus,
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
        dob,
        age,
        address,
        phone,
        maritalStatus
      },
      firstName,
      lastName,
      age,
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

    // 🔹 Copy document templates from company
    const templatesSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("documentTemplates")
      .get();

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

    let applicants = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();

        const firstName =
          data?.personalDetails?.firstName ||
          data?.firstName ||
          (data?.fullName ? data?.fullName.split(" ")[0] : "") ||
          "";
        const lastName =
          data?.personalDetails?.lastName ||
          data?.lastName ||
          (data?.fullName ? data?.fullName.split(" ").slice(1).join(" ") : "") ||
          "";

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

        const total =
          Number(data?.totalApplicantPayment || data?.totalPayment) || 0;

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

    applicants = applicants.sort((a, b) => {
      const aDate = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const bDate = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return bDate - aDate;
    });

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

    const allowedTypes = ["EMBASSY_APPOINTMENT", "EMBASSY_INTERVIEW", "VISA_COLLECTION", "BIOMETRIC", "INTERVIEW"];
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

    // 🔁 STAGE TRANSITION BASED ON APPOINTMENT TYPE
    let newStage = null;

    if (type === "EMBASSY_APPOINTMENT") newStage = 6;
    if (type === "EMBASSY_INTERVIEW") newStage = 8;
    if (type === "VISA_COLLECTION") newStage = 10;

    // backward compatibility for older values
    if (type === "BIOMETRIC") newStage = 8;
    if (type === "INTERVIEW") newStage = 10;

    if (newStage !== null) {
      const applicantSnap = await applicantRef.get();
      const currentStage = applicantSnap.data().stage || 1;

      if (newStage > currentStage) {
        await applicantRef.update({ stage: newStage });

        await addStageLog({
          applicantId,
          fromStage: currentStage,
          toStage: newStage,
          role: "SUPER_USER",
          action: `APPOINTMENT_APPROVAL_${type}`
        });

        // auto stages move
        if (AUTO_STAGE_IDS.includes(newStage)) {
          await autoAdvanceStage(applicantId, newStage, `AUTO_AFTER_${type}_APPROVAL`);
        }
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

const MANUAL_STAGE_IDS = [1, 2, 4, 5, 7, 9, 11];
const AUTO_STAGE_IDS = [3, 6, 8, 10];
const MAX_STAGE = 11;

const getAllowedRoleForStage = (stage) => {
  // Update as needed for additional workflow/authorization rules
  if (stage >= 1 && stage <= 2) return "AGENCY";
  if (stage >= 3 && stage <= 6) return "EMPLOYER";
  if (stage >= 7 && stage <= 10) return "EMPLOYER";
  if (stage === 11) return "SUPER_USER";
  return null;
};

const addStageLog = async ({ applicantId, fromStage, toStage, role, action }) => {
  await db.collection("stageLogs").add({
    applicantId,
    fromStage,
    toStage,
    role,
    action,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
};

const autoAdvanceStage = async (applicantId, currentStage, reason = "AUTO_ADVANCE") => {
  if (!AUTO_STAGE_IDS.includes(currentStage)) {
    return;
  }

  const next = currentStage + 1;
  if (next > MAX_STAGE) {
    return;
  }

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) return;

  const current = applicantSnap.data().stage || currentStage;
  if (current !== currentStage) return; // if stage changed meanwhile

  await applicantRef.update({
    stage: next,
    stageUpdatedAt: new Date()
  });

  await addStageLog({
    applicantId,
    fromStage: currentStage,
    toStage: next,
    role: "SYSTEM",
    action: reason
  });
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
    if (currentStage >= MAX_STAGE) {
      return res.status(400).json({
        message: "Applicant already at final stage"
      });
    }

    if (!MANUAL_STAGE_IDS.includes(currentStage)) {
      return res.status(400).json({
        message: "Current stage is automated and cannot be manually approved"
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

      let uploadedDocs = {};

      for (let doc of docsSnap.docs) {

        const versionsSnap = await doc.ref
          .collection("versions")
          .orderBy("uploadedAt", "desc")
          .limit(1)
          .get();

        if (!versionsSnap.empty) {
          uploadedDocs[doc.id] = versionsSnap.docs[0].data(); // latest version
        }
      }

      let requiredDocs = [
        "PASSPORT",
        "PAN_CARD",
        "EDUCATION_10TH",
        "EDUCATION_12TH",
        "PHOTO",
        "BIRTH_CERTIFICATE",
        "MEDICAL_CERTIFICATE"
      ];

      if (applicant.maritalStatus === "Single") {
        requiredDocs.push("UNMARRIED_CERTIFICATE");
      }

      if (applicant.maritalStatus === "Married") {
        requiredDocs.push("MARRIAGE_CERTIFICATE");
      }

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

    await addStageLog({
      applicantId,
      fromStage: currentStage,
      toStage: nextStage,
      role: req.user.role,
      action: "MANUAL_STAGE_APPROVAL"
    });

    const finalApplicant = await docRef.get();
    const finalStage = finalApplicant.exists ? finalApplicant.data().stage : nextStage;

    res.json({
      message: "Stage approved and moved successfully",
      previousStage: currentStage,
      newStage: finalStage
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

    const bucket = admin.storage().bucket();

    const fileName = `applicants/${id}/${documentType}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const docRef = db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(documentType);

    // ✅ ENSURE parent doc exists
    await docRef.set({
      documentType,
      updatedAt: new Date()
    }, { merge: true });

    // ✅ ADD VERSION
    await docRef
      .collection("versions")
      .add({
        fileUrl,
        status: "PENDING",
        rejectedReason: "",
        uploadedAt: new Date(),
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role
      });

    res.json({ message: "Uploaded successfully" });

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

    const result = {};

    for (let doc of snapshot.docs) {

      const versionsSnap = await doc.ref
        .collection("versions")
        .orderBy("uploadedAt", "desc")
        .get();

      result[doc.id] = versionsSnap.docs.map(v => ({
        id: v.id,
        ...v.data()
      }));

    }

    res.json(result);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// REJECT DOCUMENT
// ===============================  
exports.rejectDocument = async (req, res) => {
  try {

    const { id, docType, versionId } = req.params;
    const { reason } = req.body;

    await db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(docType)
      .collection("versions")
      .doc(versionId)
      .update({
        status: "REJECTED",
        rejectedReason: reason,
        reviewedAt: new Date()
      });

    res.json({ message: "Rejected" });

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
      .collection("versions")
      .add({
        status: "DEFERRED",
        fileUrl: "",
        rejectedReason: "",
        uploadedAt: new Date(),
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role
      });

    res.json({ message: "Document deferred" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// APPROVE DOCUMENT
// ===============================
exports.approveDocument = async (req, res) => {
  try {

    const { id, docType, versionId } = req.params;

    // 🔒 Only Super User
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve documents"
      });
    }

    await db
      .collection("applicants")
      .doc(id)
      .collection("documents")
      .doc(docType)
      .collection("versions")
      .doc(versionId)
      .update({
        status: "APPROVED",
        reviewedAt: new Date(),
	      reviewedBy: req.user.uid
      });

    res.json({ message: "Document approved" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// ADD DISPATCH
// ===============================  
exports.addDispatch = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { note, trackingUrl, awbNumber } = req.body;

    if (!note || !awbNumber) {
      return res.status(400).json({
        message: "Note and AWB Number are required"
      });
    }

    const docRef = await db
      .collection("applicants")
      .doc(applicantId)
      .collection("dispatches")
      .add({
        note,
        trackingUrl: trackingUrl || "",
        awbNumber,
        createdBy: req.user.uid,
        createdAt: new Date()
      });

    // Auto advance stage 3 -> 4
    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();
    const applicantStage = applicantSnap.data()?.stage || 1;

    if (applicantStage === 3) {
      await autoAdvanceStage(applicantId, 3, "AUTO_AFTER_DISPATCH");
    }

    res.json({
      message: "Dispatch added successfully",
      id: docRef.id
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};  

// ===============================
// GET DISPATCHES FOR APPLICANT
// ===============================

exports.getDispatches = async (req, res) => {
  try {

    const snapshot = await db
      .collection("applicants")
      .doc(req.params.id)
      .collection("dispatches")
      .orderBy("createdAt", "desc")
      .get();

    const dispatches = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data?.createdAt;

      let createdAtMs = null;
      if (createdAt) {
        if (typeof createdAt.toMillis === "function") {
          createdAtMs = createdAt.toMillis();
        } else if (createdAt instanceof Date) {
          createdAtMs = createdAt.getTime();
        } else if (typeof createdAt === "number") {
          createdAtMs = createdAt;
        } else if (typeof createdAt === "object" && createdAt._seconds) {
          createdAtMs = createdAt._seconds * 1000;
        }
      }

      return {
        id: doc.id,
        ...data,
        createdAt: createdAtMs
      };
    });

    res.json(dispatches);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// UPLOAD CONTRACT
// ===============================
exports.uploadContract = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only SUPER_USER & EMPLOYER
    if (
      req.user.role !== "SUPER_USER" &&
      req.user.role !== "EMPLOYER"
    ) {
      return res.status(403).json({
        message: "Only Super User or Employer can upload contract"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "File required"
      });
    }

    const bucket = admin.storage().bucket();

    const fileName = `contracts/${applicantId}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Save in Firestore
    const applicantRef = db.collection("applicants").doc(applicantId);
    
    await applicantRef.set({
      contract: {
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt: new Date()
      }
    }, { merge: true });

    // 🔁 Auto advance stage 4 → 5 when super user uploads contract
    if (req.user.role === "SUPER_USER") {
      const applicantSnap = await applicantRef.get();
      const currentStage = applicantSnap.data()?.stage || 1;

      if (currentStage === 4) {
        await applicantRef.update({
          stage: 5,
          stageUpdatedAt: new Date()
        });

        await addStageLog({
          applicantId,
          fromStage: 4,
          toStage: 5,
          role: "SUPER_USER",
          action: "AUTO_ADVANCE_CONTRACT_UPLOADED"
        });
      }
    }

    res.json({
      message: "Contract uploaded successfully",
      fileUrl
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET CONTRACT FOR APPLICANT
// ===============================
exports.getContract = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();

    res.json(data.contract || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// ADD EMBASSY APPOINTMENT
// ===============================
exports.addEmbassyAppointment = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { dateTime } = req.body;

    // 🔒 Only SUPER_USER or EMPLOYER
    if (
      req.user.role !== "SUPER_USER" &&
      req.user.role !== "EMPLOYER"
    ) {
      return res.status(403).json({
        message: "Only Super User or Employer can add appointment"
      });
    }

    if (!dateTime) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    let fileUrl = "";

    // Optional file upload
    if (req.file) {

      const bucket = admin.storage().bucket();

      const fileName = `appointments/${applicantId}_${Date.now()}`;

      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();

      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    // Save appointment
    await db
      .collection("applicants")
      .doc(applicantId)
      .set({
        embassyAppointment: {
          dateTime,
          fileUrl,
          createdBy: req.user.uid,
          createdByRole: req.user.role,
          createdAt: new Date()
        }
      }, { merge: true });

    // 🔥 AUTO STAGE MOVE if SUPER USER
    if (req.user.role === "SUPER_USER") {

      const docRef = db.collection("applicants").doc(applicantId);
      const doc = await docRef.get();
      const applicant = doc.data();

      const currentStage = applicant.stage || 1;

      await docRef.update({
        stage: currentStage + 1,
        stageUpdatedAt: new Date()
      });
    }

    res.json({
      message: "Embassy appointment added"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET EMBASSY APPOINTMENT
// ===============================
exports.getEmbassyAppointment = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();

    res.json(data.embassyAppointment || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// ADD TRAVEL DETAILS
// ===============================
exports.addTravelDetails = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { travelDate, time, ticketNumber } = req.body;

    // 🔒 Only AGENT or SUPER USER
    if (
      req.user.role !== "AGENCY" &&
      req.user.role !== "SUPER_USER"
    ) {
      return res.status(403).json({
        message: "Only Agent or Super User can upload travel details"
      });
    }

    if (!travelDate || !time) {
      return res.status(400).json({
        message: "Travel Date and Time are required"
      });
    }

    let fileUrl = "";

    // Optional file upload
    if (req.file) {

      const bucket = admin.storage().bucket();

      const fileName = `travel/${applicantId}_${Date.now()}`;

      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();

      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    // Ensure travel details does not auto-advance applicant stage.
    const applicantRef = db.collection("applicants").doc(applicantId);
    const applicantSnap = await applicantRef.get();

    if (!applicantSnap.exists) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const currentStage = applicantSnap.data()?.stage || 1;

    // Travel details are a stage 6+ activity. Do not allow you to set it from stage 5.
    if (currentStage < 6) {
      return res.status(400).json({
        message: "Cannot add travel details before stage 6. Complete current stage first."
      });
    }

    await applicantRef.set({
      travelDetails: {
        travelDate,
        time,
        ticketNumber: ticketNumber || "",
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        createdAt: new Date()
      }
    }, { merge: true });

    res.json({
      message: "Travel details saved"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET TRAVEL DETAILS
// ===============================
exports.getTravelDetails = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();

    res.json(data.travelDetails || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// UPLOAD BIOMETRIC SLIP
// ===============================
exports.uploadBiometricSlip = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only AGENCY
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can upload biometric slip"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "File required"
      });
    }

    const bucket = admin.storage().bucket();

    const fileName = `biometric/${applicantId}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const docRef = db.collection("applicants").doc(applicantId);

    // Save biometric slip
    await docRef.set({
      biometricSlip: {
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt: new Date()
      }
    }, { merge: true });

    // 🔥 AUTO STAGE COMPLETE
    await docRef.update({
      stage: 7,
      stageUpdatedAt: new Date()
    });

    res.json({
      message: "Biometric slip uploaded & stage completed"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET BIOMETRIC SLIP
// ===============================
exports.getBiometricSlip = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();

    res.json(data.biometricSlip || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// ADD EMBASSY INTERVIEW
// ===============================
exports.addEmbassyInterview = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { dateTime } = req.body;

    // 🔒 Only SUPER_USER or EMPLOYER
    if (
      req.user.role !== "SUPER_USER" &&
      req.user.role !== "EMPLOYER"
    ) {
      return res.status(403).json({
        message: "Only Super User or Employer can add interview"
      });
    }

    if (!dateTime) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    const isSuperUser = req.user.role === "SUPER_USER";

    const docRef = db.collection("applicants").doc(applicantId);

    await docRef.set({
      embassyInterview: {
        dateTime,
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        approved: isSuperUser, // auto approve if super user
        approvedBy: isSuperUser ? req.user.uid : null,
        createdAt: new Date()
      }
    }, { merge: true });

    // 🔥 AUTO STAGE MOVE if SUPER USER
    if (isSuperUser) {

      const doc = await docRef.get();
      const applicant = doc.data();
      const currentStage = applicant.stage || 1;

      await docRef.update({
        stage: currentStage + 1,
        stageUpdatedAt: new Date()
      });
    }

    res.json({
      message: "Embassy interview added"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// APPROVE EMBASSY INTERVIEW & MOVE STAGE
// ===============================
exports.approveEmbassyInterview = async (req, res) => {
  try {

    const applicantId = req.params.id;

    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);

    const doc = await docRef.get();
    const applicant = doc.data();

    if (!applicant.embassyInterview) {
      return res.status(400).json({
        message: "No interview data"
      });
    }

    await docRef.update({
      "embassyInterview.approved": true,
      "embassyInterview.approvedBy": req.user.uid,
      stage: (applicant.stage || 1) + 1,
      stageUpdatedAt: new Date()
    });

    res.json({
      message: "Interview approved & stage moved"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET EMBASSY INTERVIEW
// ===============================
exports.getEmbassyInterview = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();

    res.json(data.embassyInterview || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// ADD INTERVIEW TICKET
// ===============================
exports.addInterviewTicket = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { date, time } = req.body;

    // 🔒 Only AGENCY
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can upload interview ticket"
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        message: "Date and Time required"
      });
    }

    let fileUrl = "";

    // Optional file upload
    if (req.file) {

      const bucket = admin.storage().bucket();

      const fileName = `interview-ticket/${applicantId}_${Date.now()}`;

      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();

      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    await db
      .collection("applicants")
      .doc(applicantId)
      .set({
        interviewTicket: {
          date,
          time,
          fileUrl,
          uploadedBy: req.user.uid,
          uploadedByRole: req.user.role,
          createdAt: new Date()
        }
      }, { merge: true });

    res.json({
      message: "Interview ticket saved"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET INTERVIEW TICKET
// ===============================
exports.getInterviewTicket = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();

    res.json(data.interviewTicket || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// UPLOAD INTERVIEW BIOMETRIC SLIP
// ===============================
exports.uploadInterviewBiometric = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only Agency
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can upload interview biometric slip"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "File required"
      });
    }

    const bucket = admin.storage().bucket();

    const fileName = `interview-biometric/${applicantId}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const docRef = db.collection("applicants").doc(applicantId);

    // Save document
    await docRef.set({
      interviewBiometric: {
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt: new Date()
      }
    }, { merge: true });

    // 🔥 AUTO MOVE TO STAGE 9
    await docRef.update({
      stage: 9,
      stageUpdatedAt: new Date()
    });

    res.json({
      message: "Interview biometric uploaded & stage completed"
    });

  } catch (err) {
    console.error("Upload Interview Biometric Error:", err);
    res.status(500).json({ message: err.message });
  }
};


// ===============================
// GET INTERVIEW BIOMETRIC SLIP
// ===============================
exports.getInterviewBiometric = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data();

    res.json(data.interviewBiometric || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// ADD VISA COLLECTION
// ===============================
exports.addVisaCollection = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { date, time } = req.body;

    if (!["EMPLOYER", "SUPER_USER"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Only Employer or Super User can add"
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);

    const status = req.user.role === "SUPER_USER" ? "APPROVED" : "PENDING";

    await docRef.set({
      visaCollection: {
        date,
        time,
        status,
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        createdAt: new Date(),
        approvedBy: status === "APPROVED" ? req.user.uid : null,
        approvedAt: status === "APPROVED" ? new Date() : null
      }
    }, { merge: true });

    // 🔥 If Super User → auto move stage
    if (status === "APPROVED") {
      await docRef.update({
        stage: 10,
        stageUpdatedAt: new Date()
      });
    }

    res.json({ message: "Visa collection saved" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// APPROVE VISA COLLECTION
// ===============================
exports.approveVisaCollection = async (req, res) => {
  try {

    const applicantId = req.params.id;

    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can approve"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);

    await docRef.update({
      "visaCollection.status": "APPROVED",
      "visaCollection.approvedBy": req.user.uid,
      "visaCollection.approvedAt": new Date(),
      stage: 10,
      stageUpdatedAt: new Date()
    });

    res.json({ message: "Visa collection approved" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET VISA COLLECTION
// ===============================
exports.getVisaCollection = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data()?.visaCollection;

    if (!data) return res.json(null);

    // 🔒 Visibility rule
    if (
      data.status !== "APPROVED" &&
      !["SUPER_USER", "EMPLOYER"].includes(req.user.role)
    ) {
      return res.json(null);
    }

    res.json(data);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// ADD VISA TRAVEL DETAILS
// ===============================
exports.addVisaTravel = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { date, time, ticketNumber } = req.body;

    // 🔒 Only Agency
    if (req.user.role !== "AGENCY") {
      return res.status(403).json({
        message: "Only Agency can add travel details"
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        message: "Date & Time required"
      });
    }

    let fileUrl = "";

    if (req.file) {
      const bucket = admin.storage().bucket();

      const fileName = `visa-travel/${applicantId}_${Date.now()}`;

      const fileUpload = bucket.file(fileName);

      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });

      await fileUpload.makePublic();

      fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    await db
      .collection("applicants")
      .doc(applicantId)
      .set({
        visaTravel: {
          date,
          time,
          ticketNumber: ticketNumber || "",
          fileUrl,
          uploadedBy: req.user.uid,
          uploadedByRole: req.user.role,
          createdAt: new Date()
        }
      }, { merge: true });

    res.json({ message: "Visa travel details saved" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET VISA TRAVEL DETAILS
// ===============================
exports.getVisaTravel = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    const data = doc.data()?.visaTravel;

    res.json(data || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// UPLOAD RESIDENCE PERMIT (FRONT/BACK)
// ===============================
exports.uploadResidencePermit = async (req, res) => {
  try {

    const applicantId = req.params.id;
    const { type } = req.body;

    if (req.user.role !== "AGENCY") {
      return res.status(403).json({ message: "Only Agency allowed" });
    }

    const bucket = admin.storage().bucket();

    const fileName = `residence/${applicantId}_${type}_${Date.now()}`;

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    await fileUpload.makePublic();

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const docRef = db.collection("applicants").doc(applicantId);

    // ✅ GET EXISTING
    const doc = await docRef.get();
    const existing = doc.data()?.residencePermit || {};

    // ✅ MERGE PROPERLY
    const updatedPermit = {
      ...existing,
      [type === "FRONT" ? "frontUrl" : "backUrl"]: fileUrl,
      uploadedBy: req.user.uid,
      uploadedByRole: req.user.role,
      uploadedAt: new Date()
    };

    await docRef.set({
      residencePermit: updatedPermit
    }, { merge: true });

    // ✅ FETCH AGAIN (IMPORTANT)
    const updatedDoc = await docRef.get();
    const data = updatedDoc.data()?.residencePermit;

    // ✅ AUTO STAGE COMPLETE
    if (data?.frontUrl && data?.backUrl) {
      await docRef.update({
        stage: 11,
        stageUpdatedAt: new Date()
      });
    }

    res.json({ message: "Uploaded successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET RESIDENCE PERMIT
// ===============================
exports.getResidencePermit = async (req, res) => {
  try {

    const doc = await db
      .collection("applicants")
      .doc(req.params.id)
      .get();

    res.json(doc.data()?.residencePermit || null);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// COMPLETE APPLICANT PROCESS
// ===============================
exports.completeApplicant = async (req, res) => {
  try {

    const applicantId = req.params.id;

    // 🔒 Only Super User
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can complete process"
      });
    }

    const docRef = db.collection("applicants").doc(applicantId);

    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        message: "Applicant not found"
      });
    }

    const data = doc.data();

    // Optional safety: only allow completion if stage >= 10
    if ((data.stage || 0) < 10) {
      return res.status(400).json({
        message: "Process not ready for completion"
      });
    }

    await docRef.update({
      stage: 12,
      completedAt: new Date(),
      completedBy: req.user.uid,
      stageUpdatedAt: new Date()
    });

    res.json({
      message: "Process completed successfully"
    });

  } catch (err) {
    console.error("Complete Applicant Error:", err);
    res.status(500).json({
      message: "Internal Server Error"
    });
  }
};

// ===============================
// UPDATE APPLICANT (GENERIC)
// ===============================
exports.updateApplicant = async (req, res) => {
  try {
    const { id } = req.params;

    // Only Super User
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({
        message: "Only Super User can update applicant"
      });
    }

    await db.collection("applicants").doc(id).update({
      ...req.body,
      updatedAt: new Date()
    });

    res.json({ message: "Applicant updated successfully" });

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
  rejectDocument: exports.rejectDocument,
  approveDocument: exports.approveDocument,
  addDispatch: exports.addDispatch,
  getDispatches: exports.getDispatches,
  uploadContract: exports.uploadContract,
  getContract: exports.getContract, 
  addEmbassyAppointment: exports.addEmbassyAppointment,
  getEmbassyAppointment: exports.getEmbassyAppointment,
  addTravelDetails: exports.addTravelDetails,
  getTravelDetails: exports.getTravelDetails,
  uploadBiometricSlip: exports.uploadBiometricSlip,
  getBiometricSlip: exports.getBiometricSlip,
  addEmbassyInterview: exports.addEmbassyInterview,
  approveEmbassyInterview: exports.approveEmbassyInterview,
  getEmbassyInterview: exports.getEmbassyInterview,
  addInterviewTicket: exports.addInterviewTicket,
  getInterviewTicket: exports.getInterviewTicket,
  uploadInterviewBiometric: exports.uploadInterviewBiometric,
  getInterviewBiometric: exports.getInterviewBiometric,
  addVisaCollection: exports.addVisaCollection,
  approveVisaCollection: exports.approveVisaCollection,
  getVisaCollection: exports.getVisaCollection,
  addVisaTravel: exports.addVisaTravel,
  getVisaTravel: exports.getVisaTravel,
  uploadResidencePermit: exports.uploadResidencePermit,
  getResidencePermit: exports.getResidencePermit,
  completeApplicant: exports.completeApplicant,
  updateApplicant: exports.updateApplicant
};

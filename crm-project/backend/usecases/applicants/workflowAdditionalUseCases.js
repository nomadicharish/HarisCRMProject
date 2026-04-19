const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { normalizeDate } = require("../../services/applicantDomainService");
const { refreshApplicantSummaries } = require("../../services/applicantSummaryService");
const { addStageLog } = require("../../services/applicantWorkflowStageService");
const { deleteStorageFileIfExists } = require("../../utils/storageFiles");

async function addEmbassyAppointmentUseCase(req) {
  const applicantId = req.params.id;
  const { dateTime, date, time } = req.body;

  if (!["SUPER_USER", "EMPLOYER"].includes(req.user.role)) {
    throw new AppError("Only Super User or Employer can add appointment", 403);
  }

  const resolvedDate = date || (dateTime ? String(dateTime).split("T")[0] : "");
  const resolvedTime = time || (dateTime ? String(dateTime).split("T")[1]?.slice(0, 5) : "");
  if (!resolvedDate || !resolvedTime) throw new AppError("Date & Time required", 400);

  let fileUrl = "";
  let bucket = null;
  if (req.file) {
    bucket = admin.storage().bucket();
    const fileName = `appointments/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();
    fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  }

  const appointmentDateTime = `${resolvedDate}T${resolvedTime}`;
  const createdAt = new Date();
  const docRef = db.collection("applicants").doc(applicantId);
  const existingApplicantSnap = await docRef.get();
  const previousAppointmentFileUrl = existingApplicantSnap.exists
    ? existingApplicantSnap.data()?.embassyAppointment?.fileUrl || ""
    : "";

  await docRef.set(
    {
      embassyAppointment: {
        date: resolvedDate,
        time: resolvedTime,
        dateTime: appointmentDateTime,
        fileUrl,
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        createdAt
      }
    },
    { merge: true }
  );

  if (fileUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousAppointmentFileUrl);
  }

  const doc = await docRef.get();
  const applicant = doc.data() || {};
  const currentStage = Number(applicant.stage || 1);
  if (currentStage === 5) {
    await docRef.update({
      stage: 6,
      stageUpdatedAt: createdAt
    });
    await addStageLog({
      applicantId,
      fromStage: 5,
      toStage: 6,
      role: req.user.role,
      action: "EMBASSY_APPOINTMENT_SAVED"
    });
  }

  await refreshApplicantSummaries(applicantId);
  return { message: "Embassy appointment added" };
}

async function getEmbassyAppointmentUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const appointment = doc.data()?.embassyAppointment || null;
  if (!appointment) return null;
  return {
    ...appointment,
    time:
      appointment.time ||
      appointment.appointmentTime ||
      (appointment.dateTime ? String(appointment.dateTime).split("T")[1]?.slice(0, 5) : "") ||
      "",
    createdAt: normalizeDate(appointment.createdAt)
  };
}

async function addTravelDetailsUseCase(req) {
  const applicantId = req.params.id;
  const { travelDate, time, ticketNumber } = req.body;

  if (req.user.role !== "AGENCY") throw new AppError("Only Agent can upload travel details", 403);
  if (!travelDate || !time) throw new AppError("Travel Date and Time are required", 400);

  let fileUrl = "";
  let bucket = null;
  if (req.file) {
    bucket = admin.storage().bucket();
    const fileName = `travel/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();
    fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  }

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const currentStage = Number(applicantSnap.data()?.stage || 1);
  if (currentStage < 6) {
    throw new AppError("Cannot add travel details before stage 6. Complete current stage first.", 400);
  }

  const previousTravelFileUrl = applicantSnap.data()?.travelDetails?.fileUrl || "";
  await applicantRef.set(
    {
      travelDetails: {
        travelDate,
        time,
        ticketNumber: ticketNumber || "",
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        createdAt: new Date()
      }
    },
    { merge: true }
  );

  if (fileUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousTravelFileUrl);
  }

  await refreshApplicantSummaries(applicantId);
  return { message: "Travel details saved" };
}

async function getTravelDetailsUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const travelDetails = doc.data()?.travelDetails || null;
  if (!travelDetails) return null;
  return {
    ...travelDetails,
    createdAt: normalizeDate(travelDetails.createdAt)
  };
}

async function uploadBiometricSlipUseCase(req) {
  const applicantId = req.params.id;
  if (req.user.role !== "AGENCY") throw new AppError("Only Agency can upload biometric slip", 403);
  if (!req.file) throw new AppError("File required", 400);

  const bucket = admin.storage().bucket();
  const fileName = `biometric/${applicantId}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);
  await fileUpload.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype }
  });
  await fileUpload.makePublic();
  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

  const docRef = db.collection("applicants").doc(applicantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new AppError("Applicant not found", 404);
  const currentStage = Number(docSnap.data()?.stage || 1);
  if (currentStage < 6) throw new AppError("Cannot add biometric slip before ticket upload stage", 400);

  const previousBiometricUrl = docSnap.data()?.biometricSlip?.fileUrl || "";
  await docRef.set(
    {
      biometricSlip: {
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        uploadedAt: new Date()
      }
    },
    { merge: true }
  );
  await deleteStorageFileIfExists(bucket, previousBiometricUrl);
  await docRef.update({
    stage: 7,
    stageUpdatedAt: new Date()
  });

  await refreshApplicantSummaries(applicantId);
  return { message: "Biometric slip uploaded & stage completed" };
}

async function getBiometricSlipUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const biometricSlip = doc.data()?.biometricSlip || null;
  if (!biometricSlip) return null;
  return {
    ...biometricSlip,
    uploadedAt: normalizeDate(biometricSlip.uploadedAt)
  };
}

async function addVisaCollectionUseCase(req) {
  const applicantId = req.params.id;
  const { date, time } = req.body;

  if (!["EMPLOYER", "SUPER_USER"].includes(req.user.role)) {
    throw new AppError("Only Employer or Super User can add", 403);
  }
  if (!date || !time) throw new AppError("Date & Time required", 400);

  const docRef = db.collection("applicants").doc(applicantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new AppError("Applicant not found", 404);
  const currentStage = Number(docSnap.data()?.stage || 1);
  if (currentStage < 9) throw new AppError("Cannot add visa collection before visa collection stage", 400);

  const status = req.user.role === "SUPER_USER" ? "APPROVED" : "PENDING";
  await docRef.set(
    {
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
    },
    { merge: true }
  );

  if (status === "APPROVED") {
    await docRef.update({
      stage: 10,
      stageUpdatedAt: new Date()
    });
  }

  await refreshApplicantSummaries(applicantId);
  return { message: "Visa collection saved" };
}

async function approveVisaCollectionUseCase(req) {
  const applicantId = req.params.id;
  if (req.user.role !== "SUPER_USER") throw new AppError("Only Super User can approve", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  await docRef.update({
    "visaCollection.status": "APPROVED",
    "visaCollection.approvedBy": req.user.uid,
    "visaCollection.approvedAt": new Date(),
    stage: 10,
    stageUpdatedAt: new Date()
  });

  await refreshApplicantSummaries(applicantId);
  return { message: "Visa collection approved" };
}

async function getVisaCollectionUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const visaCollection = doc.data()?.visaCollection || null;
  if (!visaCollection) return null;
  if (
    String(visaCollection.status || "").toUpperCase() !== "APPROVED" &&
    !["SUPER_USER", "EMPLOYER"].includes(req.user.role)
  ) {
    return null;
  }
  return {
    ...visaCollection,
    createdAt: normalizeDate(visaCollection.createdAt),
    approvedAt: normalizeDate(visaCollection.approvedAt)
  };
}

async function addVisaTravelUseCase(req) {
  const applicantId = req.params.id;
  const { date, time, ticketNumber } = req.body;

  if (req.user.role !== "AGENCY") throw new AppError("Only Agency can add travel details", 403);
  if (!date || !time) throw new AppError("Date & Time required", 400);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);
  const currentStage = Number(applicantSnap.data()?.stage || 1);
  if (currentStage < 10) {
    throw new AppError("Cannot add visa travel before visa collection completion stage", 400);
  }

  let fileUrl = "";
  let bucket = null;
  if (req.file) {
    bucket = admin.storage().bucket();
    const fileName = `visa-travel/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();
    fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  }

  const previousVisaTravelFileUrl = applicantSnap.data()?.visaTravel?.fileUrl || "";
  await applicantRef.set(
    {
      visaTravel: {
        date,
        time,
        ticketNumber: ticketNumber || "",
        fileUrl,
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        createdAt: new Date()
      }
    },
    { merge: true }
  );

  if (fileUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousVisaTravelFileUrl);
  }

  await refreshApplicantSummaries(applicantId);
  return { message: "Visa travel details saved" };
}

async function getVisaTravelUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const visaTravel = doc.data()?.visaTravel || null;
  if (!visaTravel) return null;
  return {
    ...visaTravel,
    createdAt: normalizeDate(visaTravel.createdAt)
  };
}

async function uploadResidencePermitUseCase(req) {
  const applicantId = req.params.id;
  const { type } = req.body;

  if (req.user.role !== "AGENCY") throw new AppError("Only Agency allowed", 403);
  if (!req.file) throw new AppError("File required", 400);
  if (!["FRONT", "BACK"].includes(String(type || "").toUpperCase())) {
    throw new AppError("type must be FRONT or BACK", 400);
  }

  const bucket = admin.storage().bucket();
  const side = String(type || "").toUpperCase();
  const fileName = `residence/${applicantId}_${side}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);
  await fileUpload.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype }
  });
  await fileUpload.makePublic();
  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

  const docRef = db.collection("applicants").doc(applicantId);
  const doc = await docRef.get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);
  const applicantData = doc.data() || {};
  const currentStage = Number(applicantData.stage || 1);
  if (currentStage < 10) {
    throw new AppError("Cannot upload residence permit before visa collection completion stage", 400);
  }
  if (!applicantData.visaTravel?.date || !applicantData.visaTravel?.time) {
    throw new AppError("Upload visa travel details before residence permit", 400);
  }

  const existing = applicantData.residencePermit || {};
  const previousSideUrl = side === "FRONT" ? existing.frontUrl : existing.backUrl;
  const updatedPermit = {
    ...existing,
    [side === "FRONT" ? "frontUrl" : "backUrl"]: fileUrl,
    uploadedBy: req.user.uid,
    uploadedByRole: req.user.role,
    uploadedAt: new Date()
  };

  await docRef.set({ residencePermit: updatedPermit }, { merge: true });
  await deleteStorageFileIfExists(bucket, previousSideUrl);

  const updatedDoc = await docRef.get();
  const data = updatedDoc.data()?.residencePermit;
  if (data?.frontUrl && data?.backUrl) {
    await docRef.update({
      stage: 11,
      stageUpdatedAt: new Date()
    });
  }

  await refreshApplicantSummaries(applicantId);
  return { message: "Uploaded successfully" };
}

async function getResidencePermitUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const residencePermit = doc.data()?.residencePermit || null;
  if (!residencePermit) return null;
  return {
    ...residencePermit,
    uploadedAt: normalizeDate(residencePermit.uploadedAt)
  };
}

module.exports = {
  addEmbassyAppointmentUseCase,
  addTravelDetailsUseCase,
  addVisaCollectionUseCase,
  addVisaTravelUseCase,
  approveVisaCollectionUseCase,
  getBiometricSlipUseCase,
  getEmbassyAppointmentUseCase,
  getResidencePermitUseCase,
  getTravelDetailsUseCase,
  getVisaCollectionUseCase,
  getVisaTravelUseCase,
  uploadBiometricSlipUseCase,
  uploadResidencePermitUseCase
};


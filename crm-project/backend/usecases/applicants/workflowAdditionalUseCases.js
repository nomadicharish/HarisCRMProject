const { admin, db } = require("../../config/firebase");
const { AppError } = require("../../lib/AppError");
const { normalizeDate } = require("../../services/applicantDomainService");
const { refreshApplicantDocumentSummary } = require("../../services/applicantSummaryService");
const { addStageLog } = require("../../services/applicantWorkflowStageService");
const { readEncryptedUserEmail } = require("../../services/accountService");
const { sendEmail } = require("../../services/emailService");
const {
  recordAdminApproval,
  recordAgencyTask,
  recordEmployerWorkflowInitiated,
  recordNotificationAction
} = require("../../services/notificationService");
const { safeSendCalendarInvite } = require("../../services/calendarInviteService");
const { decryptText } = require("../../utils/crypto");
const { deleteStorageFileIfExists } = require("../../utils/storageFiles");
const { isSuperUserLikeRole, SUPER_USER_ROLE } = require("../../utils/roles");
const { assertNoRejectedSignedDocuments } = require("./workflowExecutionUseCases");

async function addEmbassyAppointmentUseCase(req) {
  const applicantId = req.params.id;
  const { dateTime, date, time } = req.body;

  if (!(isSuperUserLikeRole(req.user.role) || req.user.role === "EMPLOYER")) {
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
  if (!existingApplicantSnap.exists) throw new AppError("Applicant not found", 404);
  const existingApplicant = existingApplicantSnap.data() || {};
  const previousAppointmentFileUrl = existingApplicantSnap.exists
    ? existingApplicantSnap.data()?.embassyAppointment?.fileUrl || ""
    : "";
  const existingAppointment = existingApplicant.embassyAppointment || {};
  const wasPreviouslyApproved = existingAppointment.approved === true || String(existingAppointment.status || "").toUpperCase() === "APPROVED";
  const status = isSuperUserLikeRole(req.user.role) || wasPreviouslyApproved ? "APPROVED" : "PENDING";

  await docRef.set(
    {
      embassyAppointment: {
        date: resolvedDate,
        time: resolvedTime,
        dateTime: appointmentDateTime,
        fileUrl: fileUrl || previousAppointmentFileUrl || "",
        status,
        approved: status === "APPROVED",
        approvedBy: isSuperUserLikeRole(req.user.role) ? req.user.uid : (existingAppointment.approvedBy || null),
        approvedAt: isSuperUserLikeRole(req.user.role) ? createdAt : (existingAppointment.approvedAt || null),
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        createdAt
      },
      hasPendingAppointmentApproval: status === "PENDING"
    },
    { merge: true }
  );

  if (fileUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousAppointmentFileUrl);
  }

  const currentStage = Number(existingApplicant.stage || 1);
  if (status === "APPROVED" && currentStage === 6) {
    await docRef.update({
      stage: 7,
      stageUpdatedAt: createdAt
    });
    await addStageLog({
      applicantId,
      fromStage: 6,
      toStage: 7,
      role: req.user.role,
      action: "EMBASSY_APPOINTMENT_SAVED"
    });
  }

  await refreshApplicantDocumentSummary(applicantId);
  if (status === "APPROVED") {
    await safeSendCalendarInvite({
      applicantRef: docRef,
      applicantId,
      applicant: existingApplicant,
      eventType: "embassyAppointment",
      workflow: {
        ...existingApplicant.embassyAppointment,
        date: resolvedDate,
        time: resolvedTime,
        dateTime: appointmentDateTime
      },
      includeAgency: true
    });
  }
  if (isSuperUserLikeRole(req.user.role)) {
    await recordNotificationAction({ actionKey: "EMBASSY_APPOINTMENT_INITIATED", applicantId, applicant: existingApplicant, user: req.user });
  } else {
    await recordEmployerWorkflowInitiated({ applicantId, applicant: existingApplicant, user: req.user, actionKey: "EMBASSY_APPOINTMENT_INITIATED" });
  }
  return { message: "Embassy appointment added" };
}

async function approveEmbassyAppointmentUseCase(req) {
  const applicantId = req.params.id;
  if (!isSuperUserLikeRole(req.user.role)) throw new AppError("Only Super User can approve", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = docSnap.data() || {};
  if (!applicant.embassyAppointment) throw new AppError("Embassy appointment not found", 404);

  const approvedAt = new Date();
  const currentStage = Number(applicant.stage || 1);
  const updatePayload = {
    "embassyAppointment.status": "APPROVED",
    "embassyAppointment.approved": true,
    "embassyAppointment.approvedBy": req.user.uid,
    "embassyAppointment.approvedAt": approvedAt,
    hasPendingAppointmentApproval: false
  };

  if (currentStage < 7) {
    updatePayload.stage = 7;
    updatePayload.stageUpdatedAt = approvedAt;
  }

  await docRef.update(updatePayload);

  if (currentStage < 7) {
    await addStageLog({
      applicantId,
      fromStage: currentStage,
      toStage: 7,
      role: req.user.role,
      action: "EMBASSY_APPOINTMENT_APPROVED"
    });
  }

  await refreshApplicantDocumentSummary(applicantId);
  await safeSendCalendarInvite({
    applicantRef: docRef,
    applicantId,
    applicant,
    eventType: "embassyAppointment",
    workflow: applicant.embassyAppointment,
    includeAgency: true
  });
  await recordAdminApproval({
    applicantId,
    applicant,
    user: req.user,
    actionKey: "EMBASSY_APPOINTMENT_APPROVED"
  });
  return { message: "Embassy appointment approved" };
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
    createdAt: normalizeDate(appointment.createdAt),
    approvedAt: normalizeDate(appointment.approvedAt)
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
  assertNoRejectedSignedDocuments(applicantSnap.data() || {});

  const currentStage = Number(applicantSnap.data()?.stage || 1);
  if (currentStage < 7) {
    throw new AppError("Cannot add travel details before embassy appointment completion stage", 400);
  }

  const previousTravelFileUrl = applicantSnap.data()?.travelDetails?.fileUrl || "";
  await applicantRef.set(
    {
      travelDetails: {
        travelDate,
        time,
        ticketNumber: ticketNumber || "",
        fileUrl: fileUrl || "",
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        createdAt: new Date()
      }
    },
    { merge: true }
  );

  if (previousTravelFileUrl) {
    await deleteStorageFileIfExists(bucket || admin.storage().bucket(), previousTravelFileUrl);
  }

  await refreshApplicantDocumentSummary(applicantId);
  await recordAgencyTask({
    applicantId,
    applicant: applicantSnap.data() || {},
    user: req.user,
    actionKey: "TRAVEL_DETAILS_ADDED"
  });
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
  assertNoRejectedSignedDocuments(docSnap.data() || {});
  const currentStage = Number(docSnap.data()?.stage || 1);
  if (currentStage < 7) throw new AppError("Cannot add biometric slip before ticket upload stage", 400);

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
    stage: 8,
    stageUpdatedAt: new Date()
  });

  await refreshApplicantDocumentSummary(applicantId);
  await recordAgencyTask({
    applicantId,
    applicant: docSnap.data() || {},
    user: req.user,
    actionKey: "EMBASSY_APPOINTMENT_COMPLETED"
  });
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

async function getEmbassyWorkflowUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);
  const data = doc.data() || {};

  const embassyAppointment = data.embassyAppointment
    ? {
        ...data.embassyAppointment,
        time:
          data.embassyAppointment.time ||
          data.embassyAppointment.appointmentTime ||
          (data.embassyAppointment.dateTime
            ? String(data.embassyAppointment.dateTime).split("T")[1]?.slice(0, 5)
            : "") ||
          "",
        createdAt: normalizeDate(data.embassyAppointment.createdAt),
        approvedAt: normalizeDate(data.embassyAppointment.approvedAt)
      }
    : null;

  const travelDetails = data.travelDetails
    ? {
        ...data.travelDetails,
        createdAt: normalizeDate(data.travelDetails.createdAt)
      }
    : null;

  const biometricSlip = data.biometricSlip
    ? {
        ...data.biometricSlip,
        uploadedAt: normalizeDate(data.biometricSlip.uploadedAt)
      }
    : null;

  return {
    embassyAppointment,
    travelDetails,
    biometricSlip
  };
}

async function uploadWorkflowFile({ file, storagePath, previousUrl = "" }) {
  if (!file) return { fileUrl: "", bucket: null };

  const bucket = admin.storage().bucket();
  const fileName = `${storagePath}_${Date.now()}`;
  const fileUpload = bucket.file(fileName);
  await fileUpload.save(file.buffer, {
    metadata: { contentType: file.mimetype }
  });
  await fileUpload.makePublic();
  if (previousUrl) await deleteStorageFileIfExists(bucket, previousUrl);
  return {
    fileUrl: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
    bucket
  };
}

function hasVisaCollectionStageDetails(applicant = {}) {
  const collectionTravel = applicant.visaCollectionTravel || {};
  const permit = applicant.residencePermit || {};
  const hasTravel = Boolean(collectionTravel.date && collectionTravel.time);
  const hasTrp = Boolean(permit.trpUrl || permit.fileUrl || permit.frontUrl || permit.backUrl);
  return hasTravel && hasTrp;
}

async function advanceToApplicantArrivalIfReady(applicantRef, applicantId) {
  const snap = await applicantRef.get();
  if (!snap.exists) return false;
  const applicant = snap.data() || {};
  const currentStage = Number(applicant.stage || 1);
  if (currentStage === 11 && hasVisaCollectionStageDetails(applicant)) {
    await applicantRef.update({
      stage: 12,
      stageUpdatedAt: new Date()
    });
    await addStageLog({
      applicantId,
      fromStage: 11,
      toStage: 12,
      role: "SYSTEM",
      action: "VISA_COLLECTION_COMPLETION_DETAILS_SAVED"
    });
    return true;
  }
  return false;
}

async function addVisaCollectionUseCase(req) {
  const applicantId = req.params.id;
  const { date, time } = req.body;

  if (!(req.user.role === "EMPLOYER" || isSuperUserLikeRole(req.user.role))) {
    throw new AppError("Only Employer or Super User can add", 403);
  }
  if (!date || !time) throw new AppError("Date & Time required", 400);

  const docRef = db.collection("applicants").doc(applicantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new AppError("Applicant not found", 404);
  const currentStage = Number(docSnap.data()?.stage || 1);
  if (currentStage < 10) throw new AppError("Cannot add visa collection before visa collection stage", 400);

  const existingVisaCollection = docSnap.data()?.visaCollection || {};
  const wasPreviouslyApproved = existingVisaCollection.approved === true || String(existingVisaCollection.status || "").toUpperCase() === "APPROVED";
  const status = isSuperUserLikeRole(req.user.role) || wasPreviouslyApproved ? "APPROVED" : "PENDING";
  let documentUrl = "";
  let bucket = null;
  if (req.file) {
    bucket = admin.storage().bucket();
    const fileName = `visa-collection-documents/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await fileUpload.makePublic();
    documentUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  }
  const previousDocumentUrl = docSnap.data()?.visaCollection?.documentUrl || "";

  await docRef.set(
    {
      visaCollection: {
        date,
        time,
        documentUrl: documentUrl || previousDocumentUrl,
        status,
        createdBy: req.user.uid,
        createdByRole: req.user.role,
        createdAt: new Date(),
        approvedBy: isSuperUserLikeRole(req.user.role) ? req.user.uid : (existingVisaCollection.approvedBy || null),
        approvedAt: isSuperUserLikeRole(req.user.role) ? new Date() : (existingVisaCollection.approvedAt || null)
      }
    },
    { merge: true }
  );

  if (documentUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousDocumentUrl);
  }

  if (status === "APPROVED") {
    await docRef.update({
      stage: currentStage < 11 ? 11 : currentStage,
      stageUpdatedAt: new Date()
    });
  }

  await refreshApplicantDocumentSummary(applicantId);
  if (status === "APPROVED") {
    await safeSendCalendarInvite({
      applicantRef: docRef,
      applicantId,
      applicant: docSnap.data() || {},
      eventType: "visaCollection",
      workflow: { ...(docSnap.data()?.visaCollection || {}), date, time },
      includeAgency: true
    });
  }
  if (isSuperUserLikeRole(req.user.role)) {
    await recordNotificationAction({ actionKey: "VISA_COLLECTION_INITIATED", applicantId, applicant: docSnap.data() || {}, user: req.user });
  } else {
    await recordEmployerWorkflowInitiated({ applicantId, applicant: docSnap.data() || {}, user: req.user, actionKey: "VISA_COLLECTION_INITIATED" });
  }
  return { message: "Visa collection saved" };
}

async function approveVisaCollectionUseCase(req) {
  const applicantId = req.params.id;
  if (!isSuperUserLikeRole(req.user.role)) throw new AppError("Only Super User can approve", 403);

  const docRef = db.collection("applicants").doc(applicantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new AppError("Applicant not found", 404);
  const currentStage = Number(docSnap.data()?.stage || 1);
  await docRef.update({
    "visaCollection.status": "APPROVED",
    "visaCollection.approvedBy": req.user.uid,
    "visaCollection.approvedAt": new Date(),
    stage: currentStage < 11 ? 11 : currentStage,
    stageUpdatedAt: new Date()
  });

  await refreshApplicantDocumentSummary(applicantId);
  await safeSendCalendarInvite({
    applicantRef: docRef,
    applicantId,
    applicant: docSnap.data() || {},
    eventType: "visaCollection",
    workflow: docSnap.data()?.visaCollection || {},
    includeAgency: true
  });
  await recordAdminApproval({
    applicantId,
    applicant: docSnap.data() || {},
    user: req.user,
    actionKey: "VISA_COLLECTION_APPROVED"
  });
  return { message: "Visa collection approved" };
}

async function getVisaCollectionUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const visaCollection = doc.data()?.visaCollection || null;
  if (!visaCollection) return null;
  if (
    String(visaCollection.status || "").toUpperCase() !== "APPROVED" &&
    !(isSuperUserLikeRole(req.user.role) || req.user.role === "EMPLOYER")
  ) {
    return null;
  }
  return {
    ...visaCollection,
    createdAt: normalizeDate(visaCollection.createdAt),
    approvedAt: normalizeDate(visaCollection.approvedAt)
  };
}

async function addVisaCollectionTravelUseCase(req) {
  const applicantId = req.params.id;
  const { date, time } = req.body;

  if (req.user.role !== "AGENCY") throw new AppError("Only Agency can add travel details", 403);
  if (!date || !time) throw new AppError("Travel date and time are required", 400);

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);

  const applicant = applicantSnap.data() || {};
  assertNoRejectedSignedDocuments(applicant);
  const currentStage = Number(applicant.stage || 1);
  const visaCollectionApproved = String(applicant?.visaCollection?.status || "").toUpperCase() === "APPROVED";
  if (currentStage < 11 || !visaCollectionApproved) {
    throw new AppError("Cannot add travel details before visa collection approval", 400);
  }

  const { fileUrl } = await uploadWorkflowFile({
    file: req.file,
    storagePath: `visa-collection-travel/${applicantId}`,
    previousUrl: applicant?.visaCollectionTravel?.fileUrl || ""
  });

  const previous = applicant?.visaCollectionTravel || {};
  await applicantRef.set(
    {
      visaCollectionTravel: {
        date,
        time,
        fileUrl: fileUrl || previous.fileUrl || "",
        uploadedBy: req.user.uid,
        uploadedByRole: req.user.role,
        createdAt: previous.createdAt || new Date(),
        updatedAt: new Date()
      }
    },
    { merge: true }
  );

  const advancedToArrival = await advanceToApplicantArrivalIfReady(applicantRef, applicantId);
  await refreshApplicantDocumentSummary(applicantId);
  await recordAgencyTask({
    applicantId,
    applicant,
    user: req.user,
    actionKey: "VISA_COLLECTION_TRAVEL_ADDED"
  });
  if (advancedToArrival) {
    await recordAgencyTask({
      applicantId,
      applicant,
      user: req.user,
      actionKey: "VISA_COLLECTION_COMPLETED"
    });
  }
  return { message: "Visa collection travel details saved" };
}

async function getVisaCollectionTravelUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const travel = doc.data()?.visaCollectionTravel || null;
  if (!travel) return null;
  return {
    ...travel,
    createdAt: normalizeDate(travel.createdAt),
    updatedAt: normalizeDate(travel.updatedAt)
  };
}

function getApplicantDisplayName(applicant = {}) {
  return (
    applicant.fullName ||
    [applicant?.personalDetails?.firstName || applicant.firstName, applicant?.personalDetails?.lastName || applicant.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Applicant"
  );
}

async function getTravelNotificationRecipients(applicant = {}) {
  const recipients = new Set();

  const superUserSnap = await db.collection("users").where("role", "==", SUPER_USER_ROLE).get();
  await Promise.all(superUserSnap.docs.map(async (doc) => {
    const email = await readEncryptedUserEmail(doc.data());
    if (email) recipients.add(email);
  }));

  const companyDoc = applicant.companyId ? await db.collection("companies").doc(applicant.companyId).get() : null;
  const employerIds = companyDoc?.exists && Array.isArray(companyDoc.data()?.employerIds)
    ? companyDoc.data().employerIds
    : [];

  const employerDocs = employerIds.length
    ? await db.getAll(...employerIds.map((id) => db.collection("employers").doc(id)))
    : [];

  await Promise.all(employerDocs.map(async (doc) => {
    if (!doc.exists) return;
    const data = doc.data() || {};
    const email = data.emailEncrypted ? await decryptText(data.emailEncrypted) : data.email || "";
    if (email) recipients.add(email);
  }));

  for (let index = 0; index < employerIds.length; index += 10) {
    const chunk = employerIds.slice(index, index + 10);
    if (!chunk.length) continue;
    const employerUserSnap = await db.collection("users").where("role", "==", "EMPLOYER").where("employerId", "in", chunk).get();
    await Promise.all(employerUserSnap.docs.map(async (doc) => {
      const email = await readEncryptedUserEmail(doc.data());
      if (email) recipients.add(email);
    }));
  }

  return Array.from(recipients);
}

async function sendApplicantArrivalDetailsEmail({ applicant, arrivalDetails, isUpdate }) {
  const recipients = await getTravelNotificationRecipients(applicant);
  if (!recipients.length) return;

  const applicantName = getApplicantDisplayName(applicant);
  const subject = `${isUpdate ? "Arrival Travel details changed" : "Arrival Travel details added"} for ${applicantName}`;
  const attachments = [
    arrivalDetails.fileUrl ? { filename: "travel-ticket", path: arrivalDetails.fileUrl } : null,
    arrivalDetails.busTicketUrl ? { filename: "bus-ticket", path: arrivalDetails.busTicketUrl } : null
  ].filter(Boolean);
  const lines = [
    `Applicant: ${applicantName}`,
    `Flight arrival date: ${arrivalDetails.date || "-"}`,
    `Flight arrival time: ${arrivalDetails.time || "-"}`,
    `Flight number: ${arrivalDetails.flightNumber || "-"}`,
    `Flight arrival place: ${arrivalDetails.arrivalPlace || "-"}`,
    `Arrival bus number: ${arrivalDetails.arrivalBusNumber || "-"}`,
    `Bus arrival date: ${arrivalDetails.arrivalBusDate || "-"}`,
    `Arrival bus time: ${arrivalDetails.arrivalBusTime || "-"}`,
    `Bus arrival place: ${arrivalDetails.busArrivalPlace || "-"}`,
    `Hotel name and address: ${arrivalDetails.hotelNameAddress || "-"}`,
    arrivalDetails.fileUrl ? `Travel ticket: ${arrivalDetails.fileUrl}` : "",
    arrivalDetails.busTicketUrl ? `Bus ticket: ${arrivalDetails.busTicketUrl}` : ""
  ].filter(Boolean);

  await sendEmail({
    to: recipients,
    subject,
    text: lines.join("\n"),
    html: lines.map((line) => `<p>${String(line).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join(""),
    attachments
  });
}

function isTruthyFormFlag(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

async function addVisaTravelUseCase(req) {
  const applicantId = req.params.id;
  const { date, time, ticketNumber, flightNumber, arrivalPlace, arrivalBusNumber, arrivalBusDate, arrivalBusTime, busArrivalPlace, hotelNameAddress, removeTravelFile, removeBusTicket } = req.body;

  if (req.user.role !== "AGENCY") throw new AppError("Only Agency can add travel details", 403);
  if (!date || !time || !flightNumber || !arrivalPlace) {
    throw new AppError("Arrival date, arrival time, flight number and arrival place are required", 400);
  }

  const applicantRef = db.collection("applicants").doc(applicantId);
  const applicantSnap = await applicantRef.get();
  if (!applicantSnap.exists) throw new AppError("Applicant not found", 404);
  const applicantData = applicantSnap.data() || {};
  assertNoRejectedSignedDocuments(applicantData);
  const currentStage = Number(applicantData.stage || 1);
  if (currentStage >= 13) {
    throw new AppError("Applicant arrival details cannot be edited after candidate arrival is completed", 400);
  }
  if (currentStage < 12) {
    throw new AppError("Cannot add applicant arrival details before applicant arrival stage", 400);
  }

  let fileUrl = "";
  let busTicketUrl = "";
  let bucket = null;
  const travelTicketFile = req.file || (Array.isArray(req.files?.file) ? req.files.file[0] : null);
  if (travelTicketFile) {
    bucket = admin.storage().bucket();
    const fileName = `visa-travel/${applicantId}_${Date.now()}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(travelTicketFile.buffer, {
      metadata: { contentType: travelTicketFile.mimetype }
    });
    await fileUpload.makePublic();
    fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  }
  const busTicketFile = Array.isArray(req.files?.busTicket) ? req.files.busTicket[0] : null;
  if (busTicketFile) {
    bucket = bucket || admin.storage().bucket();
    const busFileName = `visa-travel/bus/${applicantId}_${Date.now()}`;
    const busFileUpload = bucket.file(busFileName);
    await busFileUpload.save(busTicketFile.buffer, {
      metadata: { contentType: busTicketFile.mimetype }
    });
    await busFileUpload.makePublic();
    busTicketUrl = `https://storage.googleapis.com/${bucket.name}/${busFileName}`;
  }

  const previousVisaTravel = applicantData?.visaTravel || {};
  const previousVisaTravelFileUrl = previousVisaTravel.fileUrl || "";
  const previousBusTicketUrl = previousVisaTravel.busTicketUrl || "";
  const shouldRemoveTravelFile = isTruthyFormFlag(removeTravelFile) && !fileUrl;
  const shouldRemoveBusTicket = isTruthyFormFlag(removeBusTicket) && !busTicketUrl;
  const isUpdate = Boolean(previousVisaTravel.date || previousVisaTravel.time || previousVisaTravel.fileUrl);
  const now = new Date();
  const arrivalDetails = {
    date,
    time,
    ticketNumber: ticketNumber || "",
    flightNumber,
    arrivalPlace,
    arrivalBusNumber: arrivalBusNumber || "",
    arrivalBusDate: arrivalBusDate || "",
    arrivalBusTime: arrivalBusTime || "",
    busArrivalPlace: busArrivalPlace || "",
    hotelNameAddress: hotelNameAddress || "",
    fileUrl: shouldRemoveTravelFile ? "" : fileUrl || previousVisaTravelFileUrl || "",
    busTicketUrl: shouldRemoveBusTicket ? "" : busTicketUrl || previousBusTicketUrl || "",
    uploadedBy: req.user.uid,
    uploadedByRole: req.user.role,
    createdAt: previousVisaTravel.createdAt || now,
    updatedAt: now
  };

  await applicantRef.set(
    {
      visaTravel: arrivalDetails
    },
    { merge: true }
  );

  if (fileUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousVisaTravelFileUrl);
  }
  if (busTicketUrl && bucket) {
    await deleteStorageFileIfExists(bucket, previousBusTicketUrl);
  }
  if (shouldRemoveTravelFile && previousVisaTravelFileUrl) {
    const cleanupBucket = bucket || admin.storage().bucket();
    await deleteStorageFileIfExists(cleanupBucket, previousVisaTravelFileUrl);
  }
  if (shouldRemoveBusTicket && previousBusTicketUrl) {
    const cleanupBucket = bucket || admin.storage().bucket();
    await deleteStorageFileIfExists(cleanupBucket, previousBusTicketUrl);
  }

  await refreshApplicantDocumentSummary(applicantId);
  await recordAgencyTask({
    applicantId,
    applicant: applicantData,
    user: req.user,
    actionKey: "ARRIVAL_DETAILS_ADDED"
  });
  try {
    await sendApplicantArrivalDetailsEmail({ applicant: applicantData, arrivalDetails, isUpdate });
  } catch (error) {
    console.error("Travel details email failed", error);
  }
  await safeSendCalendarInvite({
    applicantRef,
    applicantId,
    applicant: applicantData,
    eventType: "applicantArrival",
    workflow: arrivalDetails,
    includeEmployers: true
  });
  return { message: "Applicant arrival details saved" };
}

async function getVisaTravelUseCase(req) {
  const doc = await db.collection("applicants").doc(req.params.id).get();
  const visaTravel = doc.data()?.visaTravel || null;
  if (!visaTravel) return null;
  return {
    ...visaTravel,
    createdAt: normalizeDate(visaTravel.createdAt),
    updatedAt: normalizeDate(visaTravel.updatedAt)
  };
}

async function uploadResidencePermitUseCase(req) {
  const applicantId = req.params.id;
  const { type } = req.body;

  if (req.user.role !== "AGENCY") throw new AppError("Only Agency allowed", 403);
  if (!req.file) throw new AppError("File required", 400);
  if (!["FRONT", "BACK", "TRP"].includes(String(type || "TRP").toUpperCase())) {
    throw new AppError("type must be TRP, FRONT or BACK", 400);
  }

  const bucket = admin.storage().bucket();
  const side = String(type || "TRP").toUpperCase();
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
  assertNoRejectedSignedDocuments(applicantData);
  const currentStage = Number(applicantData.stage || 1);
  if (currentStage < 11) {
    throw new AppError("Cannot upload residence permit before visa collection completion stage", 400);
  }
  const hasVisaCollectionTravel = Boolean(
    applicantData?.visaCollectionTravel?.date ||
    applicantData?.visaCollectionTravel?.time ||
    applicantData?.visaCollectionTravel?.fileUrl
  );
  if (!hasVisaCollectionTravel) {
    throw new AppError("Travel details must be saved before uploading TRP", 400);
  }

  const existing = applicantData.residencePermit || {};
  const previousSideUrl = side === "FRONT" ? existing.frontUrl : side === "BACK" ? existing.backUrl : existing.trpUrl || existing.fileUrl;
  const fileField = side === "FRONT" ? "frontUrl" : side === "BACK" ? "backUrl" : "trpUrl";
  const updatedPermit = {
    ...existing,
    [fileField]: fileUrl,
    fileUrl: side === "TRP" ? fileUrl : existing.fileUrl || "",
    uploadedBy: req.user.uid,
    uploadedByRole: req.user.role,
    uploadedAt: new Date()
  };

  await docRef.set({ residencePermit: updatedPermit }, { merge: true });
  await deleteStorageFileIfExists(bucket, previousSideUrl);

  let advancedToArrival = false;
  const updatedDoc = await docRef.get();
  if (updatedDoc.exists) {
    advancedToArrival = await advanceToApplicantArrivalIfReady(docRef, applicantId);
  }

  await refreshApplicantDocumentSummary(applicantId);
  await recordAgencyTask({
    applicantId,
    applicant: applicantData,
    user: req.user,
    actionKey: "TRC_ADDED"
  });
  if (advancedToArrival) {
    await recordAgencyTask({
      applicantId,
      applicant: applicantData,
      user: req.user,
      actionKey: "VISA_COLLECTION_COMPLETED"
    });
  }
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
  addVisaCollectionTravelUseCase,
  addVisaTravelUseCase,
  approveEmbassyAppointmentUseCase,
  approveVisaCollectionUseCase,
  getEmbassyWorkflowUseCase,
  getBiometricSlipUseCase,
  getEmbassyAppointmentUseCase,
  getResidencePermitUseCase,
  getTravelDetailsUseCase,
  getVisaCollectionUseCase,
  getVisaCollectionTravelUseCase,
  getVisaTravelUseCase,
  uploadBiometricSlipUseCase,
  uploadResidencePermitUseCase
};

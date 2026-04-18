const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { logAuditEvent } = require("./auditLogService");

const AGENT_ACTION_CATALOG = [
  {
    operation: "APPLICANT_GET",
    description: "Fetch applicant by id",
    requiredScope: "agent.actions.read"
  },
  {
    operation: "APPLICANT_APPROVE",
    description: "Approve applicant profile",
    requiredScope: "agent.actions.write"
  },
  {
    operation: "APPLICANT_SET_STAGE",
    description: "Set applicant stage explicitly",
    requiredScope: "agent.actions.write"
  },
  {
    operation: "APPLICANT_ADD_NOTE",
    description: "Append operational note to applicant",
    requiredScope: "agent.actions.write"
  }
];

function getCatalog() {
  return AGENT_ACTION_CATALOG;
}

async function runApplicantGet(input = {}) {
  const applicantId = String(input.applicantId || "").trim();
  if (!applicantId) throw new AppError("applicantId is required", 400);
  const doc = await db.collection("applicants").doc(applicantId).get();
  if (!doc.exists) throw new AppError("Applicant not found", 404);
  return { id: doc.id, ...doc.data() };
}

async function runApplicantApprove(input = {}, actor = {}) {
  const applicantId = String(input.applicantId || "").trim();
  if (!applicantId) throw new AppError("applicantId is required", 400);

  const ref = db.collection("applicants").doc(applicantId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError("Applicant not found", 404);

  await ref.set(
    {
      approvalStatus: "approved",
      approvedBy: actor.uid || "",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { applicantId, approvalStatus: "approved" };
}

async function runApplicantSetStage(input = {}, actor = {}) {
  const applicantId = String(input.applicantId || "").trim();
  const stage = Number(input.stage);
  if (!applicantId) throw new AppError("applicantId is required", 400);
  if (!Number.isInteger(stage) || stage < 1 || stage > 12) {
    throw new AppError("stage must be an integer between 1 and 12", 400);
  }

  const ref = db.collection("applicants").doc(applicantId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError("Applicant not found", 404);

  await ref.set(
    {
      stage,
      stageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActionBy: actor.uid || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { applicantId, stage };
}

async function runApplicantAddNote(input = {}, actor = {}) {
  const applicantId = String(input.applicantId || "").trim();
  const note = String(input.note || "").trim();
  if (!applicantId) throw new AppError("applicantId is required", 400);
  if (!note) throw new AppError("note is required", 400);

  const ref = db.collection("applicants").doc(applicantId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError("Applicant not found", 404);

  const noteEntry = {
    text: note,
    createdBy: actor.uid || "",
    createdByRole: actor.role || "",
    createdAt: Date.now(),
    source: "AGENT_ACTION"
  };

  await ref.set(
    {
      operationalNotes: admin.firestore.FieldValue.arrayUnion(noteEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { applicantId, note: noteEntry };
}

async function executeAgentAction({ operation = "", input = {}, actor = {}, correlationId = "" } = {}) {
  const normalizedOperation = String(operation || "").trim().toUpperCase();

  let result;
  if (normalizedOperation === "APPLICANT_GET") {
    result = await runApplicantGet(input);
  } else if (normalizedOperation === "APPLICANT_APPROVE") {
    result = await runApplicantApprove(input, actor);
  } else if (normalizedOperation === "APPLICANT_SET_STAGE") {
    result = await runApplicantSetStage(input, actor);
  } else if (normalizedOperation === "APPLICANT_ADD_NOTE") {
    result = await runApplicantAddNote(input, actor);
  } else {
    throw new AppError("Unsupported agent operation", 400, { operation: normalizedOperation });
  }

  await logAuditEvent({
    actorId: actor.uid || "",
    actorRole: actor.role || "",
    action: `AGENT_ACTION_${normalizedOperation}`,
    entityType: "agent_action",
    entityId: String(input?.applicantId || ""),
    status: "SUCCESS",
    source: "AGENT",
    correlationId,
    metadata: {
      operation: normalizedOperation
    }
  });

  return result;
}

module.exports = {
  executeAgentAction,
  getCatalog
};

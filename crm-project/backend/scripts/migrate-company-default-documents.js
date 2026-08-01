const { db } = require("../config/firebase");
const { createDefaultCompanyPositionDocuments, normalizeCompanyJobPositions } = require("../utils/normalizers");
const { logger } = require("../lib/logger");

const PCC_DOCUMENT = { id: "pcc", name: "PCC", required: true };

function isPccDocument(document = {}) {
  const id = String(document.id || "").trim().toLowerCase();
  const name = String(document.name || "").trim().toUpperCase();
  return id === "pcc" || id === "ppc" || name === "PCC" || name === "PPC";
}

function isAffidavitDocument(document = {}) {
  return String(document.id || "").trim().toLowerCase() === "affidavit" ||
    String(document.name || "").trim().toUpperCase() === "AFFIDAVIT";
}

function ensurePccDocument(documents = []) {
  const existingIndex = documents.findIndex(isPccDocument);
  if (existingIndex >= 0) {
    const existing = documents[existingIndex];
    const {
      referenceFileName,
      referenceUrl,
      documentToFillFileName,
      documentToFillUrl,
      templateFileName,
      templateFileUrl,
      ...pcc
    } = existing;
    const normalized = { ...pcc, ...PCC_DOCUMENT, updatedAt: new Date() };
    const unchanged = existing.id === normalized.id && existing.name === normalized.name && existing.required === true &&
      !referenceFileName && !referenceUrl && !documentToFillFileName && !documentToFillUrl && !templateFileName && !templateFileUrl;
    if (unchanged) return { documents, changed: false };
    return {
      documents: documents.map((document, index) => index === existingIndex ? normalized : document),
      changed: true
    };
  }

  const affidavitIndex = documents.findIndex(isAffidavitDocument);
  const nextDocuments = [...documents];
  nextDocuments.splice(affidavitIndex >= 0 ? affidavitIndex + 1 : nextDocuments.length, 0, {
    ...PCC_DOCUMENT,
    updatedAt: new Date()
  });
  return { documents: nextDocuments, changed: true };
}

function normalizeDateValue(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && value._seconds) return new Date(value._seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function keepCompanyPositionFields(position = {}, index = 0) {
  const title = String(position.title || position.name || position.label || `Job Position ${index + 1}`).trim();
  const pcc = ensurePccDocument(position.documents || []);
  return {
    ...position,
    id: String(position.id || `job_position_${index + 1}`).trim(),
    title,
    name: title,
    documents: pcc.documents,
    ...(pcc.changed ? { updatedAt: new Date() } : {})
  };
}

async function migrateCompanies() {
  const snapshot = await db.collection("companies").get();
  if (snapshot.empty) return { scanned: 0, updated: 0 };

  let scanned = 0;
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snapshot.docs) {
    scanned += 1;
    const data = doc.data() || {};
    const existingPositions = normalizeCompanyJobPositions(data.jobPositions, data.documentsNeeded);
    const jobPositions = existingPositions.length
      ? existingPositions.map(keepCompanyPositionFields)
      : [];
    const documentsResult = ensurePccDocument(
      jobPositions[0]?.documents || data.documentsNeeded || createDefaultCompanyPositionDocuments()
    );
    const documentsNeeded = documentsResult.documents;
    const previousCreatedAt = normalizeDateValue(data.createdAt);

    batch.set(
      doc.ref,
      {
        documentsNeeded,
        jobPositions,
        ...(previousCreatedAt ? { createdAt: previousCreatedAt } : {}),
        updatedAt: new Date()
      },
      { merge: true }
    );
    ops += 1;
    updated += 1;

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  return { scanned, updated };
}

async function run() {
  try {
    const result = await migrateCompanies();
    logger.info("Company default documents migration completed", result);
    process.exit(0);
  } catch (error) {
    logger.error("Company default documents migration failed", {
      message: error?.message,
      stack: error?.stack
    });
    process.exit(1);
  }
}

run();

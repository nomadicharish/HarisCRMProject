const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { decryptText, encryptText } = require("../utils/crypto");
const {
  normalizeCompanyDocuments,
  normalizeCompanyJobSpecifications,
  normalizeCompanyJobPositions,
  normalizeEmailValue,
  normalizeIdList,
  normalizePhoneValue
} = require("../utils/normalizers");
const { mapSnapshot } = require("../utils/firestore");
const {
  createLinkedUserAccount,
  deleteLinkedUserAccount,
  findLinkedUserByField,
  resetLinkedUserPassword,
  syncLinkedUserAccount
} = require("./accountService");
const { recordCompanyAssignmentNotification } = require("./notificationService");
const { isAccountantRole, isSuperUserLikeRole } = require("../utils/roles");
const { hasRight } = require("../config/userRights");
const { getCommonDocumentType, getCommonDocumentTypeByTarget } = require("../config/commonDocumentTypes");

function buildNormalizedFields({ email = "", contactNumber = "" } = {}) {
  return {
    normalizedEmail: normalizeEmailValue(email),
    normalizedContactNumber: normalizePhoneValue(contactNumber)
  };
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProjectionFields(value) {
  const requested = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!requested.length) return null;
  return new Set(["id", ...requested]);
}

function parseBooleanQuery(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return fallback;
}

async function countQueryResults(query) {
  if (typeof query.count !== "function") return null;
  const aggregateSnap = await query.count().get();
  return Number(aggregateSnap.data()?.count || 0);
}

function applyEntityFilter(query, field, values) {
  if (!values.length) return query;
  if (values.length === 1) return query.where(field, "==", values[0]);
  if (values.length <= 10) return query.where(field, "in", values);
  return query;
}

async function runFirestorePage(query, queryParams = {}) {
  const page = Math.max(1, Number(queryParams?.page || 1));
  const limit = Math.max(1, Math.min(100, Number(queryParams?.limit || 25)));
  const sortBy = queryParams?.sortBy || "createdAt";
  const sortOrder = queryParams?.sortOrder === "asc" ? "asc" : "desc";
  const total = await countQueryResults(query);
  const sortField = sortBy === "name" ? "name" : "createdAt";
  let cursor = null;
  try {
    cursor = queryParams?.cursor
      ? JSON.parse(Buffer.from(String(queryParams.cursor), "base64url").toString("utf8"))
      : null;
  } catch {
    cursor = null;
  }
  query = query.orderBy(sortField, sortOrder).orderBy(admin.firestore.FieldPath.documentId(), sortOrder);
  if (cursor?.id && Object.prototype.hasOwnProperty.call(cursor, "value")) {
    const cursorValue = sortField === "createdAt" ? new Date(cursor.value) : cursor.value;
    if (sortField !== "createdAt" || !Number.isNaN(cursorValue.getTime())) query = query.startAfter(cursorValue, cursor.id);
  } else if (page > 1) {
    query = query.offset((page - 1) * limit);
  }
  const snapshot = await query.limit(limit + 1).get();
  const hasMore = snapshot.docs.length > limit;
  const pageDocs = snapshot.docs.slice(0, limit);
  const items = pageDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const resolvedTotal = total ?? (page - 1) * limit + items.length;

  return {
    items,
    pagination: {
      page,
      limit,
      total: resolvedTotal,
      totalPages: Math.max(1, Math.ceil(resolvedTotal / limit)),
      hasMore,
      nextCursor: hasMore && pageDocs.length
        ? Buffer.from(JSON.stringify({
            value: sortField === "createdAt"
              ? pageDocs[pageDocs.length - 1].data()?.createdAt?.toDate?.().toISOString() || pageDocs[pageDocs.length - 1].data()?.createdAt
              : pageDocs[pageDocs.length - 1].data()?.[sortField],
            id: pageDocs[pageDocs.length - 1].id
          })).toString("base64url")
        : null
    }
  };
}

function projectEntityFields(item, fieldSet) {
  if (!fieldSet || !item || typeof item !== "object") return item;
  return Object.fromEntries(Object.entries(item).filter(([key]) => fieldSet.has(key)));
}

function applyProjectionToListResult(result, fieldSet) {
  if (!fieldSet) return result;
  if (Array.isArray(result)) {
    return result.map((item) => projectEntityFields(item, fieldSet));
  }
  return {
    ...result,
    items: Array.isArray(result.items)
      ? result.items.map((item) => projectEntityFields(item, fieldSet))
      : []
  };
}

function includesProtectedContactFields(fieldSet) {
  if (!fieldSet) return true;
  return fieldSet.has("email") || fieldSet.has("contactNumber");
}

async function hydrateEntityListIfNeeded(items, fieldSet, search = "") {
  const needsContactFields = includesProtectedContactFields(fieldSet);
  if (!needsContactFields && !search) return items;
  return Promise.all(items.map(hydrateEntityContactFields));
}

function toComparableDate(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "object" && value._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortAndPaginate(items, query = {}) {
  const paginated = parseBooleanQuery(query?.paginated, false);
  const page = Math.max(1, Number(query?.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query?.limit || 25)));
  const sortBy = query?.sortBy || "createdAt";
  const sortOrder = query?.sortOrder === "asc" ? "asc" : "desc";

  const sorted = [...items].sort((a, b) => {
    let left;
    let right;

    if (sortBy === "name") {
      left = normalizeText(a?.name);
      right = normalizeText(b?.name);
    } else {
      left = toComparableDate(a?.createdAt);
      right = toComparableDate(b?.createdAt);
    }

    if (left < right) return sortOrder === "asc" ? -1 : 1;
    if (left > right) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  if (!paginated) return sorted;

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * limit;
  const pagedItems = sorted.slice(startIndex, startIndex + limit);

  return {
    items: pagedItems,
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages
    }
  };
}

async function buildProtectedContactFields({ email = "", contactNumber = "" } = {}) {
  return {
    emailEncrypted: email ? await encryptText(normalizeEmailValue(email)) : "",
    contactNumberEncrypted: contactNumber ? await encryptText(String(contactNumber || "").trim()) : "",
    ...buildNormalizedFields({ email, contactNumber })
  };
}

async function hydrateEntityContactFields(entity = {}) {
  const decryptedEmail = entity.emailEncrypted ? await decryptText(entity.emailEncrypted) : entity.email || "";
  const decryptedContactNumber = entity.contactNumberEncrypted
    ? await decryptText(entity.contactNumberEncrypted)
    : entity.contactNumber || "";

  return {
    ...entity,
    email: decryptedEmail || entity.normalizedEmail || entity.email || "",
    contactNumber: decryptedContactNumber || entity.normalizedContactNumber || entity.contactNumber || ""
  };
}

async function findDuplicateByNormalizedField(collectionName, normalizedField, value, excludeId = "") {
  if (!value) return null;

  const normalizedSnapshot = await db
    .collection(collectionName)
    .where(normalizedField, "==", value)
    .limit(5)
    .get();

  const normalizedMatch = normalizedSnapshot.docs.find((doc) => doc.id !== excludeId);
  return normalizedMatch ? { id: normalizedMatch.id, ...normalizedMatch.data() } : null;
}

async function ensureUniqueEntityDetails({
  email = "",
  contactNumber = "",
  excludeAgencyId = "",
  excludeEmployerId = "",
  excludeUserUid = ""
}) {
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedPhone = normalizePhoneValue(contactNumber);

  if (normalizedEmail) {
    const [agencyMatch, employerMatch, userMatch] = await Promise.all([
      findDuplicateByNormalizedField("agencies", "normalizedEmail", normalizedEmail, excludeAgencyId),
      findDuplicateByNormalizedField("employers", "normalizedEmail", normalizedEmail, excludeEmployerId),
      findDuplicateByNormalizedField("users", "normalizedEmail", normalizedEmail, excludeUserUid)
    ]);

    if (
      agencyMatch ||
      employerMatch ||
      (userMatch &&
        userMatch.agencyId !== excludeAgencyId &&
        userMatch.employerId !== excludeEmployerId &&
        userMatch.id !== excludeUserUid)
    ) {
      throw new AppError("Email already exists in the system", 400);
    }
  }

  if (normalizedPhone) {
    const [agencyPhoneMatch, employerPhoneMatch, userPhoneMatch] = await Promise.all([
      findDuplicateByNormalizedField("agencies", "normalizedContactNumber", normalizedPhone, excludeAgencyId),
      findDuplicateByNormalizedField("employers", "normalizedContactNumber", normalizedPhone, excludeEmployerId),
      findDuplicateByNormalizedField("users", "normalizedContactNumber", normalizedPhone, excludeUserUid)
    ]);

    if (
      agencyPhoneMatch ||
      employerPhoneMatch ||
      (userPhoneMatch && userPhoneMatch.id !== excludeUserUid)
    ) {
      throw new AppError("Contact number already exists in the system", 400);
    }
  }
}

async function syncCompanyEmployerLinks(companyId, countryId, nextEmployerIds = [], previousEmployerIds = []) {
  if (!nextEmployerIds.length && !previousEmployerIds.length) return;

  const batch = admin.firestore().batch();
  const nextSet = new Set(nextEmployerIds);

  nextEmployerIds.forEach((employerId) => {
    const update = {
      companyId,
      countryId: countryId || null,
      companyIds: admin.firestore.FieldValue.arrayUnion(companyId)
    };
    if (countryId) {
      update.countryIds = admin.firestore.FieldValue.arrayUnion(countryId);
    }

    batch.set(
      db.collection("employers").doc(employerId),
      update,
      { merge: true }
    );
  });

  previousEmployerIds.forEach((employerId) => {
    if (nextSet.has(employerId)) return;

    const update = {
      companyId: null,
      companyIds: admin.firestore.FieldValue.arrayRemove(companyId)
    };
    if (countryId) {
      update.countryIds = admin.firestore.FieldValue.arrayRemove(countryId);
    }

    batch.set(db.collection("employers").doc(employerId), update, { merge: true });
  });

  await batch.commit();
}

function getEmployerCompanyIds(data = {}) {
  return normalizeIdList(data.companyIds).length
    ? normalizeIdList(data.companyIds)
    : normalizeIdList(data.companyId);
}

function getEmployerCountryIds(data = {}) {
  return normalizeIdList(data.countryIds).length
    ? normalizeIdList(data.countryIds)
    : normalizeIdList(data.countryId);
}

function resolveEmployerPayloadLinks(payload = {}) {
  const companyIds = normalizeIdList(payload.companyIds).length
    ? normalizeIdList(payload.companyIds)
    : normalizeIdList(payload.companyId);
  const countryIds = normalizeIdList(payload.countryIds).length
    ? normalizeIdList(payload.countryIds)
    : normalizeIdList(payload.countryId);

  return {
    companyIds,
    countryIds,
    primaryCompanyId: companyIds[0] || null,
    primaryCountryId: countryIds[0] || null
  };
}

async function syncEmployerCompanyBacklinks(employerId, nextCompanyIds = [], previousCompanyIds = []) {
  if (!nextCompanyIds.length && !previousCompanyIds.length) return;

  const batch = admin.firestore().batch();
  const nextSet = new Set(nextCompanyIds);

  nextCompanyIds.forEach((companyId) => {
    batch.set(
      db.collection("companies").doc(companyId),
      { employerIds: admin.firestore.FieldValue.arrayUnion(employerId) },
      { merge: true }
    );
  });

  previousCompanyIds.forEach((companyId) => {
    if (nextSet.has(companyId)) return;
    batch.set(
      db.collection("companies").doc(companyId),
      { employerIds: admin.firestore.FieldValue.arrayRemove(employerId) },
      { merge: true }
    );
  });

  await batch.commit();
}

async function syncCompanyAgencyLinks(companyId, nextAgencyIds = [], previousAgencyIds = []) {
  if (!nextAgencyIds.length && !previousAgencyIds.length) return;

  const batch = admin.firestore().batch();
  const nextSet = new Set(nextAgencyIds);

  nextAgencyIds.forEach((agencyId) => {
    batch.set(
      db.collection("agencies").doc(agencyId),
      {
        assignedCompanyIds: admin.firestore.FieldValue.arrayUnion(companyId)
      },
      { merge: true }
    );
  });

  previousAgencyIds.forEach((agencyId) => {
    if (nextSet.has(agencyId)) return;

    batch.set(
      db.collection("agencies").doc(agencyId),
      {
        assignedCompanyIds: admin.firestore.FieldValue.arrayRemove(companyId)
      },
      { merge: true }
    );
  });

  await batch.commit();
}

async function notifyCompanyAssignees({ companyId, companyName, employerIds = [], agencyIds = [], previousEmployerIds = [], previousAgencyIds = [], actor = {} }) {
  const previousEmployerSet = new Set(previousEmployerIds);
  const previousAgencySet = new Set(previousAgencyIds);
  const newEmployerIds = employerIds.filter((employerId) => employerId && !previousEmployerSet.has(employerId));
  const newAgencyIds = agencyIds.filter((agencyId) => agencyId && !previousAgencySet.has(agencyId));

  await Promise.all([
    ...newEmployerIds.map((employerId) =>
      recordCompanyAssignmentNotification({
        companyId,
        companyName,
        actor,
        recipientRole: "EMPLOYER",
        recipientEmployerId: employerId
      })
    ),
    ...newAgencyIds.map((agencyId) =>
      recordCompanyAssignmentNotification({
        companyId,
        companyName,
        actor,
        recipientRole: "AGENCY",
        recipientAgencyId: agencyId
      })
    )
  ]);
}

async function notifyAssignedCompaniesToEntity({ companyIds = [], previousCompanyIds = [], recipientRole = "", recipientAgencyId = "", recipientEmployerId = "", actor = {} }) {
  const previousSet = new Set(previousCompanyIds);
  const newCompanyIds = companyIds.filter((companyId) => companyId && !previousSet.has(companyId));
  if (!newCompanyIds.length || !recipientRole) return;

  const companyDocs = await db.getAll(...newCompanyIds.map((companyId) => db.collection("companies").doc(companyId)));
  await Promise.all(companyDocs
    .filter((companyDoc) => companyDoc.exists)
    .map((companyDoc) =>
      recordCompanyAssignmentNotification({
        companyId: companyDoc.id,
        companyName: companyDoc.data()?.name || "",
        actor,
        recipientRole,
        recipientAgencyId,
        recipientEmployerId
      })
    ));
}

async function getAgencyIdsAssignedToCompany(companyId) {
  if (!companyId) return [];
  const snapshot = await db
    .collection("agencies")
    .where("assignedCompanyIds", "array-contains", companyId)
    .get();
  return snapshot.docs.map((doc) => doc.id);
}

async function addCountry({ name }) {
  const docRef = await db.collection("countries").add({
    name,
    createdAt: new Date()
  });

  return { message: "Country added", id: docRef.id };
}

async function updateCountry(id, { name }) {
  const countryRef = db.collection("countries").doc(id);
  const countryDoc = await countryRef.get();

  if (!countryDoc.exists) {
    throw new AppError("Country not found", 404);
  }

  await countryRef.set(
    {
      name,
      updatedAt: new Date()
    },
    { merge: true }
  );

  return { message: "Country updated", id };
}

async function applySavedCommonDocumentsToCompany(countryId, jobPositions = []) {
  if (!countryId) return jobPositions;
  const settingsDoc = await db.collection("settings").doc("commonDocuments").get();
  const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
  const storedItems = Array.isArray(settings.documents) ? settings.documents : [];
  const legacyItems = Array.isArray(settings.standardReferences) ? settings.standardReferences : [];
  const commonItems = [...storedItems, ...legacyItems.filter((legacyItem) => !storedItems.some((item) => item?.id === legacyItem?.id))]
    .filter((item) => Array.isArray(item?.countryIds) && item.countryIds.includes(countryId));
  if (!commonItems.length) return jobPositions;
  return jobPositions.map((position) => ({
    ...position,
    documents: position.documents.map((document) => {
      const commonItem = commonItems.find((item) => {
        const definition = getCommonDocumentType(item.documentType);
        return definition?.targetField && getCommonDocumentTypeByTarget(document.id, definition.targetField, document.name)?.value === definition.value;
      });
      if (!commonItem) return document;
      const definition = getCommonDocumentType(commonItem.documentType);
      return definition.targetField === "reference"
        ? { ...document, referenceFileName: commonItem.fileName || "", referenceUrl: commonItem.fileUrl || "" }
        : { ...document, documentToFillFileName: commonItem.fileName || "", documentToFillUrl: commonItem.fileUrl || "", templateFileName: commonItem.fileName || "", templateFileUrl: commonItem.fileUrl || "" };
    })
  }));
}

async function addCompany(payload) {
  const normalizedEmployerIds = normalizeIdList(payload.employerIds);
  const normalizedAgencyIds = normalizeIdList(payload.agencyIds);
  const documentsNeeded = normalizeCompanyDocuments(payload.documentsNeeded);
  const jobPositions = await applySavedCommonDocumentsToCompany(
    payload.countryId,
    normalizeCompanyJobPositions(payload.jobPositions, documentsNeeded)
  );
  const docRef = await db.collection("companies").add({
    name: payload.name,
    countryId: payload.countryId,
    companyPaymentPerApplicant: payload.companyPaymentPerApplicant,
    contactNumber: payload.contactNumber || "",
    whatsappNumber: payload.whatsappNumber || "",
    employerIds: normalizedEmployerIds,
    agencyIds: normalizedAgencyIds,
    documentsNeeded: jobPositions[0]?.documents || documentsNeeded,
    jobSpecifications: normalizeCompanyJobSpecifications(payload.jobSpecifications),
    jobPositions,
    createdAt: new Date()
  });

  await syncCompanyEmployerLinks(docRef.id, payload.countryId, normalizedEmployerIds, []);
  await syncCompanyAgencyLinks(docRef.id, normalizedAgencyIds, []);
  await notifyCompanyAssignees({
    companyId: docRef.id,
    companyName: payload.name,
    employerIds: normalizedEmployerIds,
    agencyIds: normalizedAgencyIds,
    actor: payload.actor || {}
  });
  return { message: "Company added", id: docRef.id };
}

async function updateCompany(id, payload) {
  const companyRef = db.collection("companies").doc(id);
  const companyDoc = await companyRef.get();

  if (!companyDoc.exists) {
    throw new AppError("Company not found", 404);
  }

  const previousEmployerIds = normalizeIdList(companyDoc.data()?.employerIds);
  const normalizedEmployerIds = normalizeIdList(payload.employerIds);
  const storedPreviousAgencyIds = normalizeIdList(companyDoc.data()?.agencyIds);
  const previousAgencyIds = storedPreviousAgencyIds.length
    ? storedPreviousAgencyIds
    : await getAgencyIdsAssignedToCompany(id);
  const normalizedAgencyIds = normalizeIdList(payload.agencyIds);
  const documentsNeeded = normalizeCompanyDocuments(payload.documentsNeeded);
  const jobPositions = await applySavedCommonDocumentsToCompany(
    payload.countryId,
    normalizeCompanyJobPositions(payload.jobPositions, documentsNeeded)
  );

  await companyRef.set(
    {
      name: payload.name,
      countryId: payload.countryId,
      companyPaymentPerApplicant: payload.companyPaymentPerApplicant,
      contactNumber: payload.contactNumber || "",
      whatsappNumber: payload.whatsappNumber || "",
      employerIds: normalizedEmployerIds,
      agencyIds: normalizedAgencyIds,
      documentsNeeded: jobPositions[0]?.documents || documentsNeeded,
      jobSpecifications: normalizeCompanyJobSpecifications(payload.jobSpecifications),
      jobPositions,
      updatedAt: new Date()
    },
    { merge: true }
  );

  await syncCompanyEmployerLinks(id, payload.countryId, normalizedEmployerIds, previousEmployerIds);
  await syncCompanyAgencyLinks(id, normalizedAgencyIds, previousAgencyIds);
  await notifyCompanyAssignees({
    companyId: id,
    companyName: payload.name,
    employerIds: normalizedEmployerIds,
    agencyIds: normalizedAgencyIds,
    previousEmployerIds,
    previousAgencyIds,
    actor: payload.actor || {}
  });
  return { message: "Company updated", id };
}

async function deleteCompany(id) {
  const companyRef = db.collection("companies").doc(id);
  const companyDoc = await companyRef.get();

  if (!companyDoc.exists) {
    throw new AppError("Company not found", 404);
  }

  const employerIds = normalizeIdList(companyDoc.data()?.employerIds);
  const agencyIds = normalizeIdList(companyDoc.data()?.agencyIds);
  const countryId = companyDoc.data()?.countryId || "";
  if (employerIds.length || agencyIds.length) {
    const batch = admin.firestore().batch();

    employerIds.forEach((employerId) => {
      const update = {
        companyId: null,
        companyIds: admin.firestore.FieldValue.arrayRemove(id)
      };
      if (countryId) {
        update.countryIds = admin.firestore.FieldValue.arrayRemove(countryId);
      }
      batch.set(db.collection("employers").doc(employerId), update, { merge: true });
    });

    agencyIds.forEach((agencyId) => {
      batch.set(
        db.collection("agencies").doc(agencyId),
        { assignedCompanyIds: admin.firestore.FieldValue.arrayRemove(id) },
        { merge: true }
      );
    });

    await batch.commit();
  }

  await admin.storage().bucket().deleteFiles({ prefix: `companies/${id}/` }).catch(() => {});
  await companyRef.delete();
  return { message: "Company deleted successfully", id };
}

async function resetAgencyPassword(id) {
  return resetLinkedUserPassword("AGENCY", id);
}

async function resetEmployerPassword(id) {
  return resetLinkedUserPassword("EMPLOYER", id);
}

async function addAgency(payload) {
  await ensureUniqueEntityDetails({
    email: payload.email,
    contactNumber: payload.contactNumber
  });

  const assignedCompanyIds = normalizeIdList(payload.assignedCompanyIds);
  const docRef = await db.collection("agencies").add({
    name: payload.name,
    whatsappNumber: payload.whatsappNumber || "",
    address: payload.address,
    assignedCompanyIds,
    ...(await buildProtectedContactFields(payload)),
    createdAt: new Date()
  });

  const linkedUser = await createLinkedUserAccount({
    email: payload.email,
    name: payload.name,
    role: "AGENCY",
    agencyId: docRef.id,
    contactNumber: payload.contactNumber
  });

  await notifyAssignedCompaniesToEntity({
    companyIds: assignedCompanyIds,
    recipientRole: "AGENCY",
    recipientAgencyId: docRef.id,
    actor: payload.actor || {}
  });

  return { message: "Agency added", id: docRef.id, welcomeEmail: linkedUser.welcomeEmail };
}

async function updateAgency(id, payload) {
  const agencyRef = db.collection("agencies").doc(id);
  const agencyDoc = await agencyRef.get();

  if (!agencyDoc.exists) {
    throw new AppError("Agency not found", 404);
  }

  const linkedUserDoc = await findLinkedUserByField("agencyId", id, "AGENCY");
  const previousAssignedCompanyIds = normalizeIdList(agencyDoc.data()?.assignedCompanyIds);
  await ensureUniqueEntityDetails({
    email: payload.email,
    contactNumber: payload.contactNumber,
    excludeAgencyId: id,
    excludeUserUid: linkedUserDoc?.id || ""
  });

  await agencyRef.set(
    {
      name: payload.name,
      whatsappNumber: payload.whatsappNumber || "",
      address: payload.address,
      assignedCompanyIds: normalizeIdList(payload.assignedCompanyIds),
      ...(await buildProtectedContactFields(payload)),
      updatedAt: new Date()
    },
    { merge: true }
  );

  await syncLinkedUserAccount({
    email: payload.email,
    name: payload.name,
    role: "AGENCY",
    agencyId: id,
    contactNumber: payload.contactNumber
  });

  await notifyAssignedCompaniesToEntity({
    companyIds: normalizeIdList(payload.assignedCompanyIds),
    previousCompanyIds: previousAssignedCompanyIds,
    recipientRole: "AGENCY",
    recipientAgencyId: id,
    actor: payload.actor || {}
  });

  return { message: "Agency updated", id };
}

async function deleteAgency(id) {
  const agencyRef = db.collection("agencies").doc(id);
  const agencyDoc = await agencyRef.get();

  if (!agencyDoc.exists) {
    throw new AppError("Agency not found", 404);
  }

  await deleteLinkedUserAccount("AGENCY", id);
  await agencyRef.delete();
  return { message: "Agency deleted successfully", id };
}

async function addEmployer(payload) {
  await ensureUniqueEntityDetails({
    email: payload.email,
    contactNumber: payload.contactNumber
  });

  const { companyIds, countryIds, primaryCompanyId, primaryCountryId } = resolveEmployerPayloadLinks(payload);
  const docRef = await db.collection("employers").add({
    name: payload.name,
    whatsappNumber: payload.whatsappNumber || "",
    companyId: primaryCompanyId,
    countryId: primaryCountryId,
    companyIds,
    countryIds,
    ...(await buildProtectedContactFields(payload)),
    createdAt: new Date()
  });

  const linkedUser = await createLinkedUserAccount({
    email: payload.email,
    name: payload.name,
    role: "EMPLOYER",
    employerId: docRef.id,
    contactNumber: payload.contactNumber
  });

  await syncEmployerCompanyBacklinks(docRef.id, companyIds, []);
  await notifyAssignedCompaniesToEntity({
    companyIds,
    recipientRole: "EMPLOYER",
    recipientEmployerId: docRef.id,
    actor: payload.actor || {}
  });

  return { message: "Employer added", id: docRef.id, welcomeEmail: linkedUser.welcomeEmail };
}

async function updateEmployer(id, payload) {
  const employerRef = db.collection("employers").doc(id);
  const employerDoc = await employerRef.get();

  if (!employerDoc.exists) {
    throw new AppError("Employer not found", 404);
  }

  const linkedUserDoc = await findLinkedUserByField("employerId", id, "EMPLOYER");
  await ensureUniqueEntityDetails({
    email: payload.email,
    contactNumber: payload.contactNumber,
    excludeEmployerId: id,
    excludeUserUid: linkedUserDoc?.id || ""
  });

  const previousCompanyIds = getEmployerCompanyIds(employerDoc.data());
  const { companyIds, countryIds, primaryCompanyId, primaryCountryId } = resolveEmployerPayloadLinks(payload);

  await employerRef.set(
    {
      name: payload.name,
      whatsappNumber: payload.whatsappNumber || "",
      companyId: primaryCompanyId,
      countryId: primaryCountryId,
      companyIds,
      countryIds,
      ...(await buildProtectedContactFields(payload)),
      updatedAt: new Date()
    },
    { merge: true }
  );

  await syncEmployerCompanyBacklinks(id, companyIds, previousCompanyIds);

  await syncLinkedUserAccount({
    email: payload.email,
    name: payload.name,
    role: "EMPLOYER",
    employerId: id,
    contactNumber: payload.contactNumber
  });

  await notifyAssignedCompaniesToEntity({
    companyIds,
    previousCompanyIds,
    recipientRole: "EMPLOYER",
    recipientEmployerId: id,
    actor: payload.actor || {}
  });

  return { message: "Employer updated", id };
}

async function deleteEmployer(id) {
  const employerRef = db.collection("employers").doc(id);
  const employerDoc = await employerRef.get();

  if (!employerDoc.exists) {
    throw new AppError("Employer not found", 404);
  }

  await syncEmployerCompanyBacklinks(id, [], getEmployerCompanyIds(employerDoc.data()));

  await deleteLinkedUserAccount("EMPLOYER", id);
  await employerRef.delete();
  return { message: "Employer deleted successfully", id };
}

async function listCountries() {
  const snapshot = await db.collection("countries").get();
  return mapSnapshot(snapshot);
}

async function listAgencies({ user = {}, query = {} }) {
  if (!isSuperUserLikeRole(user?.role) && !hasRight(user, "ADD_COMPANIES")) return [];
  const projection = parseProjectionFields(query?.fields);
  const search = normalizeText(query?.q);
  const countryFilters = parseCsv(query?.country);
  const companyFilters = parseCsv(query?.company);

  if (parseBooleanQuery(query?.paginated, false) && !search && !countryFilters.length) {
    let agencyQuery = db.collection("agencies");
    if (companyFilters.length === 1) {
      agencyQuery = agencyQuery.where("assignedCompanyIds", "array-contains", companyFilters[0]);
    } else if (companyFilters.length > 1 && companyFilters.length <= 10) {
      agencyQuery = agencyQuery.where("assignedCompanyIds", "array-contains-any", companyFilters);
    } else if (companyFilters.length > 10) {
      agencyQuery = null;
    }

    if (agencyQuery) {
      const result = await runFirestorePage(agencyQuery, query);
      if (includesProtectedContactFields(projection)) {
        result.items = await hydrateEntityListIfNeeded(result.items || [], projection);
      }
      return applyProjectionToListResult(result, projection);
    }
  }

  const snapshot = await db.collection("agencies").get();
  let items = mapSnapshot(snapshot);

  if (search) {
    items = await hydrateEntityListIfNeeded(items, projection, search);
  }

  if (search) {
    items = items.filter((agency) =>
      [agency?.name, agency?.email, agency?.contactNumber].some((value) =>
        normalizeText(value).includes(search)
      )
    );
  }

  if (companyFilters.length) {
    items = items.filter((agency) =>
      companyFilters.some((companyId) => normalizeIdList(agency?.assignedCompanyIds).includes(companyId))
    );
  }

  if (countryFilters.length) {
    const companyIds = Array.from(
      new Set(items.flatMap((agency) => normalizeIdList(agency?.assignedCompanyIds)))
    );
    const refs = companyIds.map((companyId) => db.collection("companies").doc(companyId));
    const docs = refs.length ? await db.getAll(...refs) : [];
    const companyCountryMap = Object.fromEntries(
      docs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()?.countryId || ""])
    );

    items = items.filter((agency) =>
      normalizeIdList(agency?.assignedCompanyIds).some((companyId) =>
        countryFilters.includes(companyCountryMap[companyId] || "")
      )
    );
  }

  const result = sortAndPaginate(items, query);
  if (!search && includesProtectedContactFields(projection)) {
    if (Array.isArray(result)) {
      return applyProjectionToListResult(await hydrateEntityListIfNeeded(result, projection), projection);
    }
    return applyProjectionToListResult({
      ...result,
      items: await hydrateEntityListIfNeeded(result.items || [], projection)
    }, projection);
  }
  return applyProjectionToListResult(result, projection);
}

async function listEmployers({ user = {}, query = {} }) {
  if (!isSuperUserLikeRole(user?.role) && !hasRight(user, "ADD_COMPANIES")) return [];
  const projection = parseProjectionFields(query?.fields);
  const search = normalizeText(query?.q);
  const countryFilters = parseCsv(query?.country);
  const companyFilters = parseCsv(query?.company);

  if (parseBooleanQuery(query?.paginated, false) && !search && !countryFilters.length && companyFilters.length <= 1) {
    let employerQuery = db.collection("employers");
    employerQuery = applyEntityFilter(employerQuery, "companyId", companyFilters);

    if (employerQuery) {
      const result = await runFirestorePage(employerQuery, query);
      if (includesProtectedContactFields(projection)) {
        result.items = await hydrateEntityListIfNeeded(result.items || [], projection);
      }
      return applyProjectionToListResult(result, projection);
    }
  }

  const snapshot = await db.collection("employers").get();
  let items = mapSnapshot(snapshot);

  if (search) {
    items = await hydrateEntityListIfNeeded(items, projection, search);
  }

  if (search) {
    items = items.filter((employer) =>
      [employer?.name, employer?.email, employer?.contactNumber].some((value) =>
        normalizeText(value).includes(search)
      )
    );
  }

  if (countryFilters.length) {
    items = items.filter((employer) => {
      const employerCountryIds = getEmployerCountryIds(employer);
      return countryFilters.some((countryId) => employerCountryIds.includes(countryId));
    });
  }

  if (companyFilters.length) {
    items = items.filter((employer) => {
      const employerCompanyIds = getEmployerCompanyIds(employer);
      return companyFilters.some((companyId) => employerCompanyIds.includes(companyId));
    });
  }

  const result = sortAndPaginate(items, query);
  if (!search && includesProtectedContactFields(projection)) {
    if (Array.isArray(result)) {
      return applyProjectionToListResult(await hydrateEntityListIfNeeded(result, projection), projection);
    }
    return applyProjectionToListResult({
      ...result,
      items: await hydrateEntityListIfNeeded(result.items || [], projection)
    }, projection);
  }
  return applyProjectionToListResult(result, projection);
}

async function listCompanies({ user, query: queryParams = {} }) {
  const userRole = user?.role || "";
  const userId = user?.uid || "";
  const countryId = queryParams?.countryId || "";
  const companyFilters = parseCsv(queryParams?.company);
  const search = normalizeText(queryParams?.q);

  if (isSuperUserLikeRole(userRole) || isAccountantRole(userRole)) {
    let companyQuery = db.collection("companies");
    if (countryId) {
      companyQuery = companyQuery.where("countryId", "==", countryId);
    }

    if (parseBooleanQuery(queryParams?.paginated, false) && !search && !companyFilters.length) {
      const projection = parseProjectionFields(queryParams?.fields);
      return applyProjectionToListResult(await runFirestorePage(companyQuery, queryParams), projection);
    }

    let items = mapSnapshot(await companyQuery.get());

    if (search) {
      items = items.filter((company) => normalizeText(company?.name).includes(search));
    }
    if (companyFilters.length) {
      items = items.filter((company) => companyFilters.includes(company?.id || ""));
    }

    const projection = parseProjectionFields(queryParams?.fields);
    return applyProjectionToListResult(sortAndPaginate(items, queryParams), projection);
  }

  if (userRole === "EMPLOYER") {
    const userDoc = await db.collection("users").doc(userId).get();
    const employerId = userDoc.exists ? userDoc.data()?.employerId : null;
    if (!employerId) return [];

    const employerDoc = await db.collection("employers").doc(employerId).get();
    const companyIds = employerDoc.exists ? getEmployerCompanyIds(employerDoc.data()) : [];
    if (!companyIds.length) return [];

    const companyDocs = await db.getAll(...companyIds.map((companyId) => db.collection("companies").doc(companyId)));
    let items = companyDocs
      .filter((companyDoc) => companyDoc.exists)
      .map((companyDoc) => ({ id: companyDoc.id, ...companyDoc.data() }));
    if (countryId) {
      items = items.filter((company) => company.countryId === countryId);
    }
    if (search) {
      items = items.filter((company) => normalizeText(company?.name).includes(search));
    }
    if (companyFilters.length) {
      items = items.filter((company) => companyFilters.includes(company?.id || ""));
    }

    const projection = parseProjectionFields(queryParams?.fields);
    return applyProjectionToListResult(sortAndPaginate(items, queryParams), projection);
  }

  if (userRole === "AGENCY") {
    const agencyId = user?.agencyId || userId;
    if (!agencyId) return [];

    const agencyDoc = await db.collection("agencies").doc(agencyId).get();
    const assignedCompanyIds = agencyDoc.exists
      ? normalizeIdList(agencyDoc.data()?.assignedCompanyIds)
      : [];

    if (!assignedCompanyIds.length) return [];

    const refs = assignedCompanyIds.map((companyId) => db.collection("companies").doc(companyId));
    const companyDocs = await db.getAll(...refs);

    let items = companyDocs
      .filter((companyDoc) => companyDoc.exists)
      .filter((companyDoc) => !countryId || companyDoc.data()?.countryId === countryId)
      .map((companyDoc) => ({
        id: companyDoc.id,
        ...companyDoc.data()
      }));

    if (search) {
      items = items.filter((company) => normalizeText(company?.name).includes(search));
    }
    if (companyFilters.length) {
      items = items.filter((company) => companyFilters.includes(company?.id || ""));
    }

    const projection = parseProjectionFields(queryParams?.fields);
    return applyProjectionToListResult(sortAndPaginate(items, queryParams), projection);
  }

  throw new AppError("Access denied", 403);
}

async function uploadCompanyDocumentTemplate(companyId, documentId, file, jobPositionIdValue = "", templateTypeValue = "documentToFill") {
  const companyRef = db.collection("companies").doc(companyId);
  const companyDoc = await companyRef.get();

  if (!companyDoc.exists) {
    throw new AppError("Company not found", 404);
  }

  const templateType = String(templateTypeValue || "") === "reference" ? "reference" : "documentToFill";
  const bucket = admin.storage().bucket();
  const safeFileName = String(file.originalname || "template").replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileLabel = String(documentId || "document").trim();
  const storagePath = `companies/${companyId}/document-templates/${fileLabel}_${templateType}_${Date.now()}_${safeFileName}`;
  const fileRef = bucket.file(storagePath);

  await fileRef.save(file.buffer, {
    metadata: { contentType: file.mimetype }
  });
  const fileUrl = storagePath;

  if (!String(documentId || "").trim()) {
    throw new AppError("Document id is required", 400);
  }

  const jobPositionId = String(jobPositionIdValue || "").trim();
  const jobPositions = normalizeCompanyJobPositions(companyDoc.data()?.jobPositions, companyDoc.data()?.documentsNeeded);
  const targetPositionIndex = jobPositionId
    ? jobPositions.findIndex((position) => position.id === jobPositionId)
    : -1;
  const documentsNeeded = targetPositionIndex >= 0
    ? jobPositions[targetPositionIndex].documents
    : normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded);
  const targetIndex = documentsNeeded.findIndex((document) => document.id === String(documentId).trim());

  if (targetIndex === -1) {
    throw new AppError("Company document not found", 404);
  }

  const fileNameField = templateType === "reference" ? "referenceFileName" : "documentToFillFileName";
  const fileUrlField = templateType === "reference" ? "referenceUrl" : "documentToFillUrl";
  const previousPath = String(documentsNeeded[targetIndex][fileUrlField] || "");

  documentsNeeded[targetIndex] = {
    ...documentsNeeded[targetIndex],
    [fileNameField]: file.originalname || safeFileName,
    [fileUrlField]: fileUrl,
    templateFileName: templateType === "documentToFill" ? file.originalname || safeFileName : documentsNeeded[targetIndex].templateFileName || "",
    templateFileUrl: templateType === "documentToFill" ? fileUrl : documentsNeeded[targetIndex].templateFileUrl || "",
    updatedAt: new Date()
  };

  if (targetPositionIndex >= 0) {
    jobPositions[targetPositionIndex] = {
      ...jobPositions[targetPositionIndex],
      documents: documentsNeeded,
      updatedAt: new Date()
    };
    await companyRef.set(
      {
        jobPositions,
        documentsNeeded: jobPositions[0]?.documents || [],
        updatedAt: new Date()
      },
      { merge: true }
    );
  } else {
    await companyRef.set(
      {
        documentsNeeded,
        updatedAt: new Date()
      },
      { merge: true }
    );
  }

  if (previousPath && previousPath !== fileUrl && previousPath.startsWith("companies/")) {
    await bucket.file(previousPath).delete({ ignoreNotFound: true });
  }

  return {
    message: "Template uploaded successfully",
    document: documentsNeeded[targetIndex]
  };
}

async function deleteCompanyDocumentTemplate(companyId, documentId, jobPositionIdValue = "", templateTypeValue = "documentToFill") {
  const companyRef = db.collection("companies").doc(String(companyId || ""));
  const companyDoc = await companyRef.get();
  if (!companyDoc.exists) throw new AppError("Company not found", 404);
  const templateType = String(templateTypeValue) === "reference" ? "reference" : "documentToFill";
  const jobPositionId = String(jobPositionIdValue || "").trim();
  const jobPositions = normalizeCompanyJobPositions(companyDoc.data()?.jobPositions, companyDoc.data()?.documentsNeeded);
  const targetPositionIndex = jobPositionId ? jobPositions.findIndex((position) => position.id === jobPositionId) : -1;
  const documents = targetPositionIndex >= 0 ? jobPositions[targetPositionIndex].documents : normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded);
  const targetIndex = documents.findIndex((document) => document.id === String(documentId || "").trim());
  if (targetIndex < 0) throw new AppError("Company document not found", 404);
  const fileNameField = templateType === "reference" ? "referenceFileName" : "documentToFillFileName";
  const fileUrlField = templateType === "reference" ? "referenceUrl" : "documentToFillUrl";
  const previousPath = String(documents[targetIndex][fileUrlField] || "");
  documents[targetIndex] = { ...documents[targetIndex], [fileNameField]: "", [fileUrlField]: "", ...(templateType === "documentToFill" ? { templateFileName: "", templateFileUrl: "" } : {}), updatedAt: new Date() };
  if (targetPositionIndex >= 0) {
    jobPositions[targetPositionIndex] = { ...jobPositions[targetPositionIndex], documents, updatedAt: new Date() };
    await companyRef.set({ jobPositions, documentsNeeded: jobPositions[0]?.documents || [], updatedAt: new Date() }, { merge: true });
  } else {
    await companyRef.set({ documentsNeeded: documents, updatedAt: new Date() }, { merge: true });
  }
  if (previousPath.startsWith("companies/")) await admin.storage().bucket().file(previousPath).delete({ ignoreNotFound: true });
  return { message: "Company document deleted successfully" };
}

module.exports = {
  addAgency,
  addCompany,
  addCountry,
  addEmployer,
  deleteAgency,
  deleteCompany,
  resetAgencyPassword,
  resetEmployerPassword,
  deleteEmployer,
  ensureUniqueEntityDetails,
  listAgencies,
  listCompanies,
  listCountries,
  listEmployers,
  updateAgency,
  updateCompany,
  updateCountry,
  updateEmployer,
  uploadCompanyDocumentTemplate,
  deleteCompanyDocumentTemplate
};

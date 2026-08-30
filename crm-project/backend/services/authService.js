const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { COMMON_DOCUMENT_TYPES, getCommonDocumentType, getCommonDocumentTypeByTarget } = require("../config/commonDocumentTypes");
const { recordCommonDocumentNotification } = require("./notificationService");
const { normalizeCompanyJobPositions } = require("../utils/normalizers");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const { decryptText, encryptText } = require("../utils/crypto");
const { validatePassword } = require("../utils/password");
const {
  readEncryptedUserContactNumber,
  readEncryptedUserEmail
} = require("./accountService");
const { ensureUniqueEntityDetails } = require("./entityService");
const { getEffectiveRights } = require("../config/userRights");

const USER_PROFILE_CACHE_TTL_MS = Number(process.env.AUTH_PROFILE_READ_CACHE_TTL_MS || 30_000);
const userProfileCache = new Map();

function getCachedUserProfile(uid) {
  const cached = userProfileCache.get(uid);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    userProfileCache.delete(uid);
    return null;
  }
  return cached.value;
}

function setCachedUserProfile(uid, value) {
  userProfileCache.set(uid, {
    value,
    expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS
  });
}

function invalidateCachedUserProfile(uid) {
  if (!uid) return;
  userProfileCache.delete(uid);
}

async function getCurrentUserProfile(uid) {
  const cachedProfile = getCachedUserProfile(uid);
  if (cachedProfile) return cachedProfile;

  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    throw new AppError("User profile not found", 404);
  }

  const userData = userDoc.data() || {};

  const profile = {
    uid,
    name: userData.name || "",
    email: await readEncryptedUserEmail(userData),
    role: userData.role,
    forcePasswordReset: Boolean(userData.forcePasswordReset),
    active: Boolean(userData.active),
    agencyId: userData.agencyId || null,
    employerId: userData.employerId || null,
    rights: getEffectiveRights(userData),
    profilePhotoUrl: userData.profilePhotoUrl || ""
  };
  setCachedUserProfile(uid, profile);
  return profile;
}

async function changePassword(uid, newPassword) {
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    throw new AppError(passwordError, 400);
  }

  await admin.auth().updateUser(uid, { password: newPassword });
  await admin.auth().revokeRefreshTokens(uid);
  await db.collection("users").doc(uid).set(
    {
      forcePasswordReset: false,
      updatedAt: new Date()
    },
    { merge: true }
  );
  invalidateCachedUserProfile(uid);

  return { message: "Password updated successfully" };
}

async function checkEmailExists(email) {
  const normalizedEmail = normalizeEmailValue(email);
  const snapshot = await db
    .collection("users")
    .where("normalizedEmail", "==", normalizedEmail)
    .limit(1)
    .get();

  let userDoc = snapshot.empty ? null : snapshot.docs[0];

  if (!userDoc) {
    try {
      const authUser = await admin.auth().getUserByEmail(normalizedEmail);
      const fallbackDoc = await db.collection("users").doc(authUser.uid).get();
      if (fallbackDoc.exists) {
        userDoc = fallbackDoc;
      }
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }
  }

  if (!userDoc) {
    const legacySnapshot = await db.collection("users").get();
    for (const doc of legacySnapshot.docs) {
      const data = doc.data() || {};
      const storedEmail = await readEncryptedUserEmail(data);
      if (normalizeEmailValue(storedEmail) === normalizedEmail) {
        userDoc = doc;
        break;
      }
    }
  }

  const userData = userDoc ? userDoc.data() : null;

  if (!userData) {
    throw new AppError("Email is not registered in the system", 404);
  }

  if (userData?.active === false) {
    throw new AppError("User account is inactive", 400);
  }

  if (!userData.normalizedEmail) {
    await userDoc.ref.set(
      {
        normalizedEmail,
        updatedAt: new Date()
      },
      { merge: true }
    );
  }

  return { exists: true };
}

async function getSettings(uid) {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new AppError("User profile not found", 404);
  }

  const userData = userDoc.data() || {};
  const lookups = [];

  if (userData.role === "AGENCY" && userData.agencyId) {
    lookups.push(db.collection("agencies").doc(userData.agencyId).get());
  } else if (userData.role === "EMPLOYER" && userData.employerId) {
    lookups.push(db.collection("employers").doc(userData.employerId).get());
  }

  const [linkedEntityDoc] = await Promise.all(lookups);
  const contactNumber = linkedEntityDoc?.exists
    ? (linkedEntityDoc.data()?.contactNumberEncrypted
        ? await decryptText(linkedEntityDoc.data()?.contactNumberEncrypted)
        : String(linkedEntityDoc.data()?.contactNumber || ""))
    : await readEncryptedUserContactNumber(userData);

  return {
    name: userData.name || "",
    email: await readEncryptedUserEmail(userData),
    role: userData.role || "",
    contactNumber,
    rights: getEffectiveRights(userData),
    profilePhotoUrl: userData.profilePhotoUrl || "",
    passwordMasked: "********"
  };
}

async function updateSettings(uid, { name, contactNumber }) {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new AppError("User profile not found", 404);
  }

  const userData = userDoc.data() || {};
  await ensureUniqueEntityDetails({
    contactNumber,
    excludeAgencyId: userData.agencyId || "",
    excludeEmployerId: userData.employerId || "",
    excludeUserUid: uid
  });

  const updatePayload = {
    name,
    contactNumberEncrypted: await encryptText(contactNumber),
    normalizedContactNumber: normalizePhoneValue(contactNumber),
    updatedAt: new Date()
  };

  await admin.auth().updateUser(uid, { displayName: name });
  const updates = [db.collection("users").doc(uid).set(updatePayload, { merge: true })];

  if (userData.role === "AGENCY" && userData.agencyId) {
    updates.push(db.collection("agencies").doc(userData.agencyId).set(updatePayload, { merge: true }));
  } else if (userData.role === "EMPLOYER" && userData.employerId) {
    updates.push(db.collection("employers").doc(userData.employerId).set(updatePayload, { merge: true }));
  }

  await Promise.all(updates);
  invalidateCachedUserProfile(uid);
  return { message: "Settings updated successfully", name };
}

async function uploadProfilePhoto(uid, file) {
  if (!file || !String(file.mimetype || "").startsWith("image/")) throw new AppError("Please upload a JPEG or PNG image", 400);
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) throw new AppError("User profile not found", 404);
  const safeFileName = String(file.originalname || "profile-photo").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `user-profiles/${uid}/profile_${Date.now()}_${safeFileName}`;
  const bucket = admin.storage().bucket();
  await bucket.file(storagePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
  const previousPath = String(userDoc.data()?.profilePhotoUrl || "");
  await userRef.set({ profilePhotoUrl: storagePath, updatedAt: new Date() }, { merge: true });
  if (previousPath && previousPath !== storagePath) await bucket.file(previousPath).delete({ ignoreNotFound: true });
  invalidateCachedUserProfile(uid);
  return { message: "Profile picture updated successfully", profilePhotoUrl: storagePath };
}

async function getCommonDocuments(user = {}) {
  const [doc, companiesSnapshot] = await Promise.all([
    db.collection("settings").doc("commonDocuments").get(),
    db.collection("companies").select("countryId", "documentsNeeded", "jobPositions", "createdAt", "updatedAt").get()
  ]);
  const data = doc.exists ? doc.data() || {} : {};
  const legacyItems = Array.isArray(data.standardReferences) ? data.standardReferences : [];
  const storedItems = Array.isArray(data.documents) ? data.documents : [];
  const items = [...storedItems, ...legacyItems.filter((legacyItem) => !storedItems.some((item) => item?.id === legacyItem?.id))].length
    ? [...storedItems, ...legacyItems.filter((legacyItem) => !storedItems.some((item) => item?.id === legacyItem?.id))]
    : data.standardReferenceUrl
      ? [{ id: "legacy_standard_reference", documentType: "standard_reference_document", fileName: data.standardReferenceFileName, fileUrl: data.standardReferenceUrl, countryIds: [] }]
      : [];
  const documentTypes = getConfiguredDocumentTypes(data);
  const commonDocumentItems = items.map((item) => {
    const definition = getConfiguredDocumentType(data, item.documentType);
    return {
      id: String(item.id || ""),
      documentType: definition?.value || "standard_reference_document",
      name: definition?.label || "Standard Reference Document",
      fileName: String(item.fileName || item.standardReferenceFileName || ""),
      fileUrl: String(item.fileUrl || item.standardReferenceUrl || ""),
      countryIds: Array.isArray(item.countryIds) ? item.countryIds.filter(Boolean) : [],
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      createdByName: String(item.createdByName || "")
    };
  });
  const companyDocumentItems = [];
  companiesSnapshot.forEach((companyDoc) => {
    const company = companyDoc.data() || {};
    const positions = Array.isArray(company.jobPositions) && company.jobPositions.length
      ? company.jobPositions
      : [{ id: "default", documents: Array.isArray(company.documentsNeeded) ? company.documentsNeeded : [] }];
    positions.forEach((position, positionIndex) => {
      const documents = Array.isArray(position?.documents) && position.documents.length
        ? position.documents
        : Array.isArray(position?.documentsNeeded) && position.documentsNeeded.length
          ? position.documentsNeeded
          : positionIndex === 0 && Array.isArray(company.documentsNeeded)
            ? company.documentsNeeded
            : [];
      documents.forEach((document, documentIndex) => {
        ["reference", "documentToFill"].forEach((targetField) => {
          const definition = getCommonDocumentTypeByTarget(document?.id, targetField, document?.name);
          const fileUrl = targetField === "reference"
            ? document?.referenceUrl || document?.referenceDocumentUrl
            : document?.documentToFillUrl || document?.fillDocumentUrl || document?.templateFileUrl;
          const fileName = targetField === "reference"
            ? document?.referenceFileName || document?.referenceDocumentFileName
            : document?.documentToFillFileName || document?.fillDocumentFileName || document?.templateFileName;
          if (!fileUrl) return;
          const documentName = String(document?.name || document?.id || "Company Document").trim();
          companyDocumentItems.push({
            id: `company_${companyDoc.id}_${position?.id || positionIndex}_${document?.id || documentIndex}_${targetField}`,
            documentType: definition?.value || "company_existing_document",
            name: definition?.label || `${documentName} ${targetField === "reference" ? "Reference Document" : "Document to fill"}`,
            fileName: String(fileName || ""),
            fileUrl: String(fileUrl || ""),
            countryIds: company.countryId ? [String(company.countryId)] : [],
            createdAt: company.updatedAt || company.createdAt || null,
            updatedAt: company.updatedAt || null,
            createdByName: "",
            source: "company",
            sourceCompanyId: companyDoc.id,
            sourceJobPositionId: String(position?.id || ""),
            sourceDocumentId: String(document?.id || ""),
            sourceTemplateType: targetField
          });
        });
      });
    });
  });
  const effectiveItems = [...commonDocumentItems];
  const seenCompanyDocumentKeys = new Set();
  companyDocumentItems.forEach((item) => {
    const isCoveredByCommonDocument = commonDocumentItems.some(
      (commonItem) => commonItem.documentType === item.documentType && (commonItem.countryIds || []).some((countryId) => (item.countryIds || []).includes(countryId))
    );
    const companyKey = `${item.documentType}:${(item.countryIds || []).slice().sort().join(",")}:${item.documentType === "company_existing_document" ? item.name : ""}`;
    if (isCoveredByCommonDocument || seenCompanyDocumentKeys.has(companyKey)) return;
    seenCompanyDocumentKeys.add(companyKey);
    effectiveItems.push(item);
  });
  let visibleItems = effectiveItems;
  if (user?.role === "AGENCY") {
    const agencyId = String(user.agencyId || user.uid || "");
    const agencyDoc = agencyId ? await db.collection("agencies").doc(agencyId).get() : null;
    const assignedCompanyIds = agencyDoc?.exists && Array.isArray(agencyDoc.data()?.assignedCompanyIds)
      ? new Set(agencyDoc.data().assignedCompanyIds.map((id) => String(id || "")).filter(Boolean))
      : new Set();
    const allowedCountryIds = new Set(
      companiesSnapshot.docs
        .filter((companyDoc) => assignedCompanyIds.has(companyDoc.id))
        .map((companyDoc) => String(companyDoc.data()?.countryId || ""))
        .filter(Boolean)
    );
    visibleItems = effectiveItems
      .map((item) => ({ ...item, countryIds: (item.countryIds || []).filter((countryId) => allowedCountryIds.has(String(countryId))) }))
      .filter((item) => item.countryIds.length);
  }
  return {
    items: visibleItems,
    documentTypes,
    // Retain these fields for clients that have not yet moved to country-mapped references.
    standardReferenceFileName: data.standardReferenceFileName || "",
    standardReferenceUrl: data.standardReferenceUrl || ""
  };
}

function normalizeCustomDocumentType(type = {}) {
  const value = String(type?.value || "").trim();
  const label = String(type?.label || "").trim();
  return value && label ? { value, label } : null;
}

function getConfiguredDocumentTypes(data = {}) {
  const configuredTypes = Array.isArray(data.documentTypes) ? data.documentTypes.map(normalizeCustomDocumentType).filter(Boolean) : [];
  const knownValues = new Set(COMMON_DOCUMENT_TYPES.map((type) => type.value));
  return [...COMMON_DOCUMENT_TYPES, ...configuredTypes.filter((type) => !knownValues.has(type.value))]
    .map((type) => ({ value: type.value, label: type.label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function getConfiguredDocumentType(data = {}, value = "") {
  return getCommonDocumentType(value) || getConfiguredDocumentTypes(data).find((type) => type.value === String(value || "").trim()) || null;
}

function buildCustomDocumentTypeValue(label = "") {
  const value = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  if (!value) throw new AppError("Document type name must contain letters or numbers", 400);
  return `custom_${value}`;
}

async function createCommonDocumentType(label, user = {}) {
  const normalizedLabel = String(label || "").trim().replace(/\s+/g, " ");
  if (!normalizedLabel) throw new AppError("Document type name is required", 400);
  if (normalizedLabel.length > 100) throw new AppError("Document type name must be 100 characters or fewer", 400);
  const value = buildCustomDocumentTypeValue(normalizedLabel);
  const ref = db.collection("settings").doc("commonDocuments");
  const type = { value, label: normalizedLabel, createdAt: new Date(), createdByName: String(user?.name || "") };
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existingTypes = getConfiguredDocumentTypes(snapshot.data() || {});
    if (existingTypes.some((item) => item.value === value || item.label.toLowerCase() === normalizedLabel.toLowerCase())) {
      throw new AppError("This document type already exists", 409);
    }
    const currentCustomTypes = Array.isArray(snapshot.data()?.documentTypes) ? snapshot.data().documentTypes : [];
    transaction.set(ref, { documentTypes: [...currentCustomTypes, type], updatedAt: new Date() }, { merge: true });
  });
  return { message: "Document type added successfully", type: { value: type.value, label: type.label } };
}

function parseCountryIds(countryIds) {
  let raw;
  try {
    raw = Array.isArray(countryIds) ? countryIds : JSON.parse(String(countryIds || "[]"));
  } catch {
    throw new AppError("Country mapping must be a valid country list", 400);
  }
  if (!Array.isArray(raw)) throw new AppError("Country mapping must be a valid country list", 400);
  return [...new Set(raw.map((countryId) => String(countryId || "").trim()).filter(Boolean))];
}

function normalizeStandardReferences(data = {}) {
  const storedItems = Array.isArray(data.documents) ? data.documents : [];
  const legacyItems = Array.isArray(data.standardReferences) ? data.standardReferences : [];
  const mergedItems = [...storedItems, ...legacyItems.filter((legacyItem) => !storedItems.some((item) => item?.id === legacyItem?.id))];
  const items = mergedItems.length
    ? mergedItems
    : data.standardReferenceUrl
      ? [{ id: "legacy_standard_reference", documentType: "standard_reference_document", fileName: data.standardReferenceFileName || "", fileUrl: data.standardReferenceUrl, countryIds: [] }]
      : [];
  return items.map((item) => ({ ...item, documentType: getConfiguredDocumentType(data, item.documentType)?.value || "standard_reference_document" })).filter((item) => item && item.id);
}

function getConflictingCountryIds(items, countryIds, documentType, excludedId = "") {
  const mappedCountryIds = new Set(
    items
      .filter((item) => item.id !== excludedId && item.documentType === documentType)
      .flatMap((item) => Array.isArray(item.countryIds) ? item.countryIds : [])
  );
  return countryIds.filter((countryId) => mappedCountryIds.has(countryId));
}

async function syncCommonDocumentToCompanyRequirements(item = {}) {
  const definition = getCommonDocumentType(item.documentType);
  if (!definition?.targetDocumentId || !definition.targetField) return;
  const countryIds = new Set(Array.isArray(item.countryIds) ? item.countryIds : []);
  if (!countryIds.size) return;
  const snapshot = await db.collection("companies").get();
  const replacedStoragePaths = new Set();
  await Promise.all(snapshot.docs.filter((companyDoc) => countryIds.has(String(companyDoc.data()?.countryId || ""))).map(async (companyDoc) => {
    const company = companyDoc.data() || {};
    const jobPositions = normalizeCompanyJobPositions(company.jobPositions, company.documentsNeeded);
    let changed = false;
    const nextPositions = jobPositions.map((position) => ({
      ...position,
      documents: position.documents.map((document) => {
        const matchedType = getCommonDocumentTypeByTarget(document.id, definition.targetField, document.name);
        if (matchedType?.value !== definition.value) return document;
        const oldPath = definition.targetField === "reference" ? document.referenceUrl : document.documentToFillUrl || document.templateFileUrl;
        if (oldPath && oldPath !== item.fileUrl && String(oldPath).startsWith("companies/")) replacedStoragePaths.add(oldPath);
        changed = true;
        return definition.targetField === "reference"
          ? { ...document, referenceFileName: item.fileName, referenceUrl: item.fileUrl, updatedAt: new Date() }
          : { ...document, documentToFillFileName: item.fileName, documentToFillUrl: item.fileUrl, templateFileName: item.fileName, templateFileUrl: item.fileUrl, updatedAt: new Date() };
      }),
      updatedAt: new Date()
    }));
    if (changed) await companyDoc.ref.set({ jobPositions: nextPositions, documentsNeeded: nextPositions[0]?.documents || [], updatedAt: new Date() }, { merge: true });
  }));
  const bucket = admin.storage().bucket();
  await Promise.all([...replacedStoragePaths].map((path) => bucket.file(path).delete({ ignoreNotFound: true })));
}

async function uploadStandardReferenceDocument(file, { countryIds, documentType, user } = {}) {
  if (!file) throw new AppError("Common document is required", 400);
  const mappedCountryIds = parseCountryIds(countryIds);
  if (!mappedCountryIds.length) throw new AppError("Select at least one country", 400);
  const ref = db.collection("settings").doc("commonDocuments");
  const settingsSnapshot = await ref.get();
  const documentDefinition = getConfiguredDocumentType(settingsSnapshot.data() || {}, documentType);
  if (!documentDefinition) throw new AppError("Select a valid document type", 400);
  const documentName = documentDefinition.label;
  const safeFileName = String(file.originalname || "standard-reference").replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = `standard-reference_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `common-documents/${id}_${safeFileName}`;
  const bucket = admin.storage().bucket();
  await bucket.file(storagePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
  const item = {
    id,
    name: documentName,
    documentType: documentDefinition.value,
    fileName: file.originalname || safeFileName,
    fileUrl: storagePath,
    countryIds: mappedCountryIds,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByName: String(user?.name || "")
  };
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const items = normalizeStandardReferences(snapshot.data() || {});
      const conflicts = getConflictingCountryIds(items, mappedCountryIds, documentDefinition.value);
      if (conflicts.length) throw new AppError("This document type already exists for one or more selected countries", 409, { countryIds: conflicts });
      transaction.set(ref, { documents: [...items, item], updatedAt: new Date() }, { merge: true });
    });
  } catch (error) {
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    throw error;
  }
  await syncCommonDocumentToCompanyRequirements(item);
  await recordCommonDocumentNotification({ documentId: item.id, documentName: item.name, countryIds: item.countryIds, user, isUpdate: false });
  return { message: "Common document added successfully", item };
}

async function updateStandardReferenceDocument(id, file, { countryIds, documentType, user } = {}) {
  if (!file) throw new AppError("Upload the replacement common document", 400);
  const mappedCountryIds = parseCountryIds(countryIds);
  if (!mappedCountryIds.length) throw new AppError("Select at least one country", 400);
  const ref = db.collection("settings").doc("commonDocuments");
  const settingsSnapshot = await ref.get();
  const documentDefinition = getConfiguredDocumentType(settingsSnapshot.data() || {}, documentType);
  if (!documentDefinition) throw new AppError("Select a valid document type", 400);
  const documentName = documentDefinition.label;
  const safeFileName = String(file.originalname || "standard-reference").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `common-documents/${id}_${Date.now()}_${safeFileName}`;
  const bucket = admin.storage().bucket();
  await bucket.file(storagePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
  let previousPath = "";
  let updatedItem = null;
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const items = normalizeStandardReferences(snapshot.data() || {});
      const current = items.find((item) => item.id === id);
      if (!current) throw new AppError("Standard reference document not found", 404);
      const conflicts = getConflictingCountryIds(items, mappedCountryIds, documentDefinition.value, id);
      if (conflicts.length) throw new AppError("This document type already exists for one or more selected countries", 409, { countryIds: conflicts });
      previousPath = String(current.fileUrl || "");
      updatedItem = { ...current, name: documentName, documentType: documentDefinition.value, fileName: file.originalname || safeFileName, fileUrl: storagePath, countryIds: mappedCountryIds, updatedAt: new Date(), updatedByName: String(user?.name || "") };
      transaction.set(ref, { documents: items.map((item) => item.id === id ? updatedItem : item), updatedAt: new Date() }, { merge: true });
    });
  } catch (error) {
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    throw error;
  }
  if (previousPath && previousPath !== storagePath) await bucket.file(previousPath).delete({ ignoreNotFound: true });
  await syncCommonDocumentToCompanyRequirements(updatedItem);
  await recordCommonDocumentNotification({ documentId: updatedItem.id, documentName: updatedItem.name, countryIds: updatedItem.countryIds, user, isUpdate: true });
  return { message: "Common document updated successfully", item: updatedItem };
}

async function deleteCommonDocument(id) {
  const ref = db.collection("settings").doc("commonDocuments");
  const snapshot = await ref.get();
  const items = normalizeStandardReferences(snapshot.data() || {});
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new AppError("Common document not found", 404);
  await ref.set({ documents: items.filter((entry) => entry.id !== id), updatedAt: new Date() }, { merge: true });
  if (String(item.fileUrl || "").startsWith("common-documents/")) await admin.storage().bucket().file(item.fileUrl).delete({ ignoreNotFound: true });
  return { message: "Common document deleted successfully" };
}

async function markPasswordUpdated(uid) {
  await db.collection("users").doc(uid).set(
    {
      forcePasswordReset: false,
      updatedAt: new Date()
    },
    { merge: true }
  );
  invalidateCachedUserProfile(uid);

  return { message: "Password status updated" };
}

async function disableUser(uid) {
  await admin.auth().updateUser(uid, { disabled: true });
  await db.collection("users").doc(uid).set(
    {
      active: false,
      updatedAt: new Date()
    },
    { merge: true }
  );
  invalidateCachedUserProfile(uid);

  return { message: "User disabled successfully" };
}

module.exports = {
  changePassword,
  checkEmailExists,
  disableUser,
  getCurrentUserProfile,
  getCommonDocuments,
  createCommonDocumentType,
  deleteCommonDocument,
  getSettings,
  markPasswordUpdated,
  updateSettings,
  uploadProfilePhoto,
  uploadStandardReferenceDocument,
  updateStandardReferenceDocument
};

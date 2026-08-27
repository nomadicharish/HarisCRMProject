const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
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

async function getCommonDocuments() {
  const doc = await db.collection("settings").doc("commonDocuments").get();
  const data = doc.exists ? doc.data() || {} : {};
  const items = Array.isArray(data.standardReferences) ? data.standardReferences : [];
  return {
    items: items.map((item) => ({
      id: String(item.id || ""),
      name: "Standard Reference Document",
      fileName: String(item.fileName || item.standardReferenceFileName || ""),
      fileUrl: String(item.fileUrl || item.standardReferenceUrl || ""),
      countryIds: Array.isArray(item.countryIds) ? item.countryIds.filter(Boolean) : [],
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      createdByName: String(item.createdByName || "")
    })),
    // Retain these fields for clients that have not yet moved to country-mapped references.
    standardReferenceFileName: data.standardReferenceFileName || "",
    standardReferenceUrl: data.standardReferenceUrl || ""
  };
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
  return Array.isArray(data.standardReferences) ? data.standardReferences.filter((item) => item && item.id) : [];
}

function getConflictingCountryIds(items, countryIds, excludedId = "") {
  const mappedCountryIds = new Set(
    items
      .filter((item) => item.id !== excludedId)
      .flatMap((item) => Array.isArray(item.countryIds) ? item.countryIds : [])
  );
  return countryIds.filter((countryId) => mappedCountryIds.has(countryId));
}

async function uploadStandardReferenceDocument(file, { countryIds, user } = {}) {
  if (!file) throw new AppError("Standard reference document is required", 400);
  const documentName = "Standard Reference Document";
  const mappedCountryIds = parseCountryIds(countryIds);
  if (!mappedCountryIds.length) throw new AppError("Select at least one country", 400);
  const ref = db.collection("settings").doc("commonDocuments");
  const safeFileName = String(file.originalname || "standard-reference").replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = `standard-reference_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `common-documents/${id}_${safeFileName}`;
  const bucket = admin.storage().bucket();
  await bucket.file(storagePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
  const item = {
    id,
    name: documentName,
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
      const conflicts = getConflictingCountryIds(items, mappedCountryIds);
      if (conflicts.length) throw new AppError("A standard reference document already exists for one or more selected countries", 409, { countryIds: conflicts });
      transaction.set(ref, { standardReferences: [...items, item], updatedAt: new Date() }, { merge: true });
    });
  } catch (error) {
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    throw error;
  }
  return { message: "Standard reference document added successfully", item };
}

async function updateStandardReferenceDocument(id, file, { countryIds, user } = {}) {
  if (!file) throw new AppError("Upload the replacement standard reference document", 400);
  const documentName = "Standard Reference Document";
  const mappedCountryIds = parseCountryIds(countryIds);
  if (!mappedCountryIds.length) throw new AppError("Select at least one country", 400);
  const ref = db.collection("settings").doc("commonDocuments");
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
      const conflicts = getConflictingCountryIds(items, mappedCountryIds, id);
      if (conflicts.length) throw new AppError("A standard reference document already exists for one or more selected countries", 409, { countryIds: conflicts });
      previousPath = String(current.fileUrl || "");
      updatedItem = { ...current, name: documentName, fileName: file.originalname || safeFileName, fileUrl: storagePath, countryIds: mappedCountryIds, updatedAt: new Date(), updatedByName: String(user?.name || "") };
      transaction.set(ref, { standardReferences: items.map((item) => item.id === id ? updatedItem : item), updatedAt: new Date() }, { merge: true });
    });
  } catch (error) {
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    throw error;
  }
  if (previousPath && previousPath !== storagePath) await bucket.file(previousPath).delete({ ignoreNotFound: true });
  return { message: "Standard reference document updated successfully", item: updatedItem };
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
  getSettings,
  markPasswordUpdated,
  updateSettings,
  uploadProfilePhoto,
  uploadStandardReferenceDocument,
  updateStandardReferenceDocument
};

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
    rights: getEffectiveRights(userData)
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
  getSettings,
  markPasswordUpdated,
  updateSettings
};

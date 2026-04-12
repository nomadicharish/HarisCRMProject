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

async function getCurrentUserProfile(uid) {
  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    throw new AppError("User profile not found", 404);
  }

  const userData = userDoc.data() || {};

  return {
    uid,
    name: userData.name || "",
    email: await readEncryptedUserEmail(userData),
    role: userData.role,
    forcePasswordReset: Boolean(userData.forcePasswordReset),
    active: Boolean(userData.active),
    agencyId: userData.agencyId || null,
    employerId: userData.employerId || null
  };
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

  return { message: "Password updated successfully" };
}

async function checkEmailExists(email) {
  const normalizedEmail = normalizeEmailValue(email);
  const snapshot = await db
    .collection("users")
    .where("normalizedEmail", "==", normalizedEmail)
    .limit(1)
    .get();

  let userData = snapshot.empty ? null : snapshot.docs[0].data();

  if (!userData) {
    const legacySnapshot = await db.collection("users").select("email", "emailEncrypted", "active").get();
    const legacyDocs = await Promise.all(
      legacySnapshot.docs.map(async (doc) => {
        const data = doc.data() || {};
        let resolvedEmail = normalizeEmailValue(data.email || "");

        if (!resolvedEmail && data.emailEncrypted) {
          try {
            resolvedEmail = normalizeEmailValue(await decryptText(data.emailEncrypted));
          } catch {
            resolvedEmail = "";
          }
        }

        return { data, resolvedEmail };
      })
    );
    const legacyMatch = legacyDocs.find((entry) => entry.resolvedEmail === normalizedEmail);
    userData = legacyMatch ? legacyMatch.data : null;
  }

  if (!userData) {
    throw new AppError("Email is not registered in the system", 404);
  }

  if (userData?.active === false) {
    throw new AppError("User account is inactive", 400);
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
    passwordMasked: "********"
  };
}

async function updateSettings(uid, { contactNumber }) {
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
    contactNumberEncrypted: await encryptText(contactNumber),
    normalizedContactNumber: normalizePhoneValue(contactNumber),
    updatedAt: new Date()
  };

  const updates = [db.collection("users").doc(uid).set(updatePayload, { merge: true })];

  if (userData.role === "AGENCY" && userData.agencyId) {
    updates.push(db.collection("agencies").doc(userData.agencyId).set(updatePayload, { merge: true }));
  } else if (userData.role === "EMPLOYER" && userData.employerId) {
    updates.push(db.collection("employers").doc(userData.employerId).set(updatePayload, { merge: true }));
  }

  await Promise.all(updates);
  return { message: "Settings updated successfully" };
}

async function markPasswordUpdated(uid) {
  await db.collection("users").doc(uid).set(
    {
      forcePasswordReset: false,
      updatedAt: new Date()
    },
    { merge: true }
  );

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

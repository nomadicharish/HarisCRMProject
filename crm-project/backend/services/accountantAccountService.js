const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { normalizeEmailValue, normalizePhoneValue } = require("../utils/normalizers");
const {
  createLinkedUserAccount,
  buildUserProfileRecord,
  readEncryptedUserContactNumber,
  readEncryptedUserEmail
} = require("./accountService");
const { ensureUniqueEntityDetails } = require("./entityService");
const { JUNIOR_ACCOUNTANT_ROLE, SENIOR_ACCOUNTANT_ROLE } = require("../utils/roles");

const ACCOUNTANT_ROLES = [JUNIOR_ACCOUNTANT_ROLE, SENIOR_ACCOUNTANT_ROLE];

async function mapAccountantDoc(doc) {
  const data = doc.data() || {};
  return {
    uid: doc.id,
    name: data.name || "",
    contactNumber: await readEncryptedUserContactNumber(data),
    email: await readEncryptedUserEmail(data),
    role: data.role || "",
    accountantType: data.role === JUNIOR_ACCOUNTANT_ROLE ? "Junior Accountant" : "Senior Accountant",
    active: data.active !== false,
    createdAt: data.createdAt || null
  };
}

async function listAccountants() {
  const snapshots = await Promise.all(
    ACCOUNTANT_ROLES.map((role) => db.collection("users").where("role", "==", role).get())
  );
  const docs = snapshots.flatMap((snapshot) => snapshot.docs);
  const items = await Promise.all(docs.map(mapAccountantDoc));
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function createAccountant({ name, contactNumber, email, accountantType }) {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedContactNumber = normalizePhoneValue(contactNumber);
  const role = String(accountantType || "").trim();

  if (!ACCOUNTANT_ROLES.includes(role)) throw new AppError("Invalid accountant type", 400);

  await ensureUniqueEntityDetails({
    email: normalizedEmail,
    contactNumber: normalizedContactNumber
  });

  let existingAuthUser = null;
  try {
    existingAuthUser = await admin.auth().getUserByEmail(normalizedEmail);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  if (existingAuthUser) throw new AppError("A user with this email already exists", 409);

  const created = await createLinkedUserAccount({
    email: normalizedEmail,
    name: normalizedName,
    role,
    contactNumber: String(contactNumber || "").trim()
  });
  const doc = await db.collection("users").doc(created.uid).get();
  return {
    accountant: await mapAccountantDoc(doc),
    welcomeEmail: created.welcomeEmail
  };
}

async function updateAccountant(uid, { name, contactNumber, email, accountantType }) {
  const ref = db.collection("users").doc(uid);
  const doc = await ref.get();
  if (!doc.exists || !ACCOUNTANT_ROLES.includes(doc.data()?.role)) {
    throw new AppError("Accountant not found", 404);
  }

  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedContactNumber = normalizePhoneValue(contactNumber);
  const role = String(accountantType || "").trim();
  if (!ACCOUNTANT_ROLES.includes(role)) throw new AppError("Invalid accountant type", 400);

  await ensureUniqueEntityDetails({
    email: normalizedEmail,
    contactNumber: normalizedContactNumber,
    excludeUserUid: uid
  });

  await admin.auth().updateUser(uid, {
    email: normalizedEmail,
    displayName: normalizedName
  });
  await admin.auth().setCustomUserClaims(uid, { role });
  await ref.set(
    {
      ...(await buildUserProfileRecord({
        email: normalizedEmail,
        name: normalizedName,
        role,
        contactNumber: String(contactNumber || "").trim()
      })),
      updatedAt: new Date()
    },
    { merge: true }
  );
  return mapAccountantDoc(await ref.get());
}

async function removeAccountant(uid, actorUid) {
  if (uid === actorUid) throw new AppError("You cannot remove your own account", 400);
  const ref = db.collection("users").doc(uid);
  const doc = await ref.get();
  if (!doc.exists || !ACCOUNTANT_ROLES.includes(doc.data()?.role)) {
    throw new AppError("Accountant not found", 404);
  }
  await admin.auth().deleteUser(uid).catch(async (error) => {
    if (error?.code !== "auth/user-not-found") throw error;
  });
  await ref.delete();
  return { message: "Accountant removed successfully" };
}

module.exports = {
  createAccountant,
  listAccountants,
  removeAccountant,
  updateAccountant
};

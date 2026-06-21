const { admin, db } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { decryptText, encryptText } = require("../utils/crypto");

const COLLECTION = "bankAccounts";

async function mapBankAccount(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    beneficiaryName: data.beneficiaryName || "",
    accountNumber: data.accountNumberEncrypted
      ? await decryptText(data.accountNumberEncrypted)
      : data.accountNumber || "",
    bankNameBranch: data.bankNameBranch || "",
    createdAt: data.createdAt || null
  };
}

async function listBankAccounts() {
  const snapshot = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
  return Promise.all(snapshot.docs.map(mapBankAccount));
}

async function getBankAccount(id) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) throw new AppError("Bank account not found", 404);
  return mapBankAccount(doc);
}

async function createBankAccount({ beneficiaryName, accountNumber, bankNameBranch }, actorUid) {
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    beneficiaryName: String(beneficiaryName || "").trim(),
    accountNumberEncrypted: await encryptText(String(accountNumber || "").trim()),
    bankNameBranch: String(bankNameBranch || "").trim(),
    createdBy: actorUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return getBankAccount(ref.id);
}

async function updateBankAccount(id, { beneficiaryName, accountNumber, bankNameBranch }, actorUid) {
  const ref = db.collection(COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("Bank account not found", 404);
  await ref.set(
    {
      beneficiaryName: String(beneficiaryName || "").trim(),
      accountNumberEncrypted: await encryptText(String(accountNumber || "").trim()),
      bankNameBranch: String(bankNameBranch || "").trim(),
      updatedBy: actorUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  return getBankAccount(id);
}

async function deleteBankAccount(id) {
  const ref = db.collection(COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("Bank account not found", 404);
  await ref.delete();
  return { message: "Bank account removed successfully" };
}

module.exports = {
  createBankAccount,
  deleteBankAccount,
  getBankAccount,
  listBankAccounts,
  updateBankAccount
};

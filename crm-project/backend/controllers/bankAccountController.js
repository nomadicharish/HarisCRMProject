const bankAccountService = require("../services/bankAccountService");

async function listBankAccounts(req, res) {
  const items = await bankAccountService.listBankAccounts();
  return res.json({ items, total: items.length });
}

async function createBankAccount(req, res) {
  const bankAccount = await bankAccountService.createBankAccount(req.body, req.user.uid);
  return res.status(201).json({ message: "Bank account added successfully", bankAccount });
}

async function deleteBankAccount(req, res) {
  const data = await bankAccountService.deleteBankAccount(req.params.id);
  return res.json(data);
}

async function updateBankAccount(req, res) {
  const bankAccount = await bankAccountService.updateBankAccount(req.params.id, req.body, req.user.uid);
  return res.json({ message: "Bank account updated successfully", bankAccount });
}

module.exports = {
  createBankAccount,
  deleteBankAccount,
  listBankAccounts,
  updateBankAccount
};

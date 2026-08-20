const accountantAccountService = require("../services/accountantAccountService");

async function listAccountants(req, res) {
  const items = await accountantAccountService.listAccountants();
  return res.json({ items, total: items.length });
}

async function createAccountant(req, res) {
  const data = await accountantAccountService.createAccountant(req.body);
  return res.status(201).json({ message: "Accountant added successfully", ...data });
}

async function removeAccountant(req, res) {
  const data = await accountantAccountService.removeAccountant(req.params.uid, req.user.uid);
  return res.json(data);
}

async function updateAccountant(req, res) {
  const accountant = await accountantAccountService.updateAccountant(req.params.uid, req.body);
  return res.json({ message: "Accountant updated successfully", accountant });
}

async function resetAccountantPassword(req, res) {
  const data = await accountantAccountService.resetAccountantPassword(req.params.uid);
  return res.json(data);
}

module.exports = {
  createAccountant,
  listAccountants,
  removeAccountant,
  resetAccountantPassword,
  updateAccountant
};

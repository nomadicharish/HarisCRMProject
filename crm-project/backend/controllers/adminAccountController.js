const adminAccountService = require("../services/adminAccountService");

async function listAdmins(req, res) {
  const admins = await adminAccountService.listAdmins();
  return res.json({ items: admins, total: admins.length });
}

async function createAdmin(req, res) {
  const data = await adminAccountService.createAdmin(req.body);
  return res.status(201).json(data);
}

async function removeAdmin(req, res) {
  const data = await adminAccountService.removeAdmin(req.params.uid, req.user.uid);
  return res.json(data);
}

module.exports = {
  createAdmin,
  listAdmins,
  removeAdmin
};

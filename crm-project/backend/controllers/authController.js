const authService = require("../services/authService");

async function getCurrentUser(req, res) {
  const data = await authService.getCurrentUserProfile(req.user.uid);
  return res.json(data);
}

async function checkEmail(req, res) {
  const data = await authService.checkEmailExists(req.body.email);
  return res.json(data);
}

async function changePassword(req, res) {
  const data = await authService.changePassword(req.user.uid, req.body.newPassword);
  return res.json(data);
}

async function getSettings(req, res) {
  const data = await authService.getSettings(req.user.uid);
  return res.json(data);
}

async function updateSettings(req, res) {
  const data = await authService.updateSettings(req.user.uid, req.body);
  return res.json(data);
}

async function uploadProfilePhoto(req, res) {
  const data = await authService.uploadProfilePhoto(req.user.uid, req.file);
  return res.json(data);
}

async function getCommonDocuments(req, res) {
  const data = await authService.getCommonDocuments();
  return res.json(data);
}

async function uploadStandardReferenceDocument(req, res) {
  const data = await authService.uploadStandardReferenceDocument(req.file);
  return res.json(data);
}

async function markPasswordUpdated(req, res) {
  const data = await authService.markPasswordUpdated(req.user.uid);
  return res.json(data);
}

async function disableUser(req, res) {
  const data = await authService.disableUser(req.params.uid);
  return res.json(data);
}

module.exports = {
  changePassword,
  checkEmail,
  disableUser,
  getCurrentUser,
  getCommonDocuments,
  getSettings,
  markPasswordUpdated,
  updateSettings,
  uploadProfilePhoto,
  uploadStandardReferenceDocument
};

const entityService = require("../services/entityService");
const { AppError } = require("../lib/AppError");

async function addCountry(req, res) {
  const data = await entityService.addCountry(req.body);
  return res.json(data);
}

async function updateCountry(req, res) {
  const data = await entityService.updateCountry(req.params.id, req.body);
  return res.json(data);
}

async function addCompany(req, res) {
  const data = await entityService.addCompany(req.body);
  return res.json(data);
}

async function updateCompany(req, res) {
  const data = await entityService.updateCompany(req.params.id, req.body);
  return res.json(data);
}

async function deleteCompany(req, res) {
  const data = await entityService.deleteCompany(req.params.id);
  return res.json(data);
}

async function addAgency(req, res) {
  const data = await entityService.addAgency(req.body);
  return res.json(data);
}

async function updateAgency(req, res) {
  const data = await entityService.updateAgency(req.params.id, req.body);
  return res.json(data);
}

async function deleteAgency(req, res) {
  const data = await entityService.deleteAgency(req.params.id);
  return res.json(data);
}

async function addEmployer(req, res) {
  const data = await entityService.addEmployer(req.body);
  return res.json(data);
}

async function updateEmployer(req, res) {
  const data = await entityService.updateEmployer(req.params.id, req.body);
  return res.json(data);
}

async function deleteEmployer(req, res) {
  const data = await entityService.deleteEmployer(req.params.id);
  return res.json(data);
}

async function listCountries(req, res) {
  const data = await entityService.listCountries();
  return res.json(data);
}

async function listCompanies(req, res) {
  const data = await entityService.listCompanies({
    user: req.user,
    countryId: req.query.countryId || ""
  });
  return res.json(data);
}

async function listAgencies(req, res) {
  const data = await entityService.listAgencies(req.user.role);
  return res.json(data);
}

async function listEmployers(req, res) {
  const data = await entityService.listEmployers(req.user.role);
  return res.json(data);
}

async function uploadDocumentTemplate(req, res) {
  if (!req.file) {
    throw new AppError("Template file is required", 400);
  }

  const data = await entityService.uploadCompanyDocumentTemplate(req.params.id, req.body.documentId, req.file);
  return res.json(data);
}

module.exports = {
  addAgency,
  addCompany,
  addCountry,
  addEmployer,
  deleteAgency,
  deleteCompany,
  deleteEmployer,
  listAgencies,
  listCompanies,
  listCountries,
  listEmployers,
  updateAgency,
  updateCompany,
  updateCountry,
  updateEmployer,
  uploadDocumentTemplate
};

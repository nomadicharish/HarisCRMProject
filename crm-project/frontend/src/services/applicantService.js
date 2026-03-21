import API from "./api";

export const getApplicants = async () => {
  const res = await API.get("/applicants");
  return res.data;
};

export const createApplicant = async (data) => {
  const res = await API.post("/applicants/create", data);
  return res.data;
};

export const getDocuments = (id) =>
  API.get(`/applicants/${id}/documents`);

export const uploadDocument = (id, formData) =>
  API.post(`/applicants/${id}/upload-document`, formData);

export const rejectDocument = (id, docType, reason) =>
  API.patch(`/applicants/${id}/documents/${docType}/reject`, { reason });
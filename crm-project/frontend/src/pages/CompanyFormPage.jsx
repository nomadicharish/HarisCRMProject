import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import BlockingLoader from "../components/common/BlockingLoader";
import PageLoader from "../components/common/PageLoader";
import "../styles/applicantsDashboard.css";

const DEFAULT_DOCUMENTS = [
  { id: "passport", name: "Passport", required: true },
  { id: "passport_size_photo", name: "Passport Size photo", required: true },
  { id: "10th_education_certificate", name: "10th Education Certificate", required: true },
  { id: "12th_education_certificate", name: "12th Education Certificate", required: true },
  { id: "work_wear_measurement", name: "Work Wear measurement", required: true },
  { id: "international_driving_permit_optional", name: "International Driving Permit", required: false },
  { id: "birth_certificate", name: "Birth Certificate", required: true },
  { id: "medical_certificate", name: "Medical Certificate", required: true }
];

const createKey = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function buildId(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function createDocumentRow(document = {}, index = 0) {
  const name = document.name || document.label || "";
  return {
    rowKey: document.rowKey || createKey("document"),
    id: document.id || document.docType || buildId(name, `document_${index + 1}`),
    name,
    required: Boolean(document.required),
    templateFileName: document.templateFileName || "",
    templateFileUrl: document.templateFileUrl || "",
    file: null
  };
}

function createPositionRow(position = {}, index = 0, fallbackDocuments = []) {
  const title = position.title || position.name || position.label || "";
  const documents = Array.isArray(position.documents) && position.documents.length
    ? position.documents
    : Array.isArray(position.documentsNeeded) && position.documentsNeeded.length
      ? position.documentsNeeded
      : fallbackDocuments.length
        ? fallbackDocuments
        : DEFAULT_DOCUMENTS;

  return {
    rowKey: position.rowKey || createKey("position"),
    id: position.id || buildId(title, `job_position_${index + 1}`),
    title,
    documents: documents.map((document, documentIndex) => createDocumentRow(document, documentIndex))
  };
}

function normalizeCompanyPositions(company = {}) {
  const fallbackDocuments = Array.isArray(company.documentsNeeded) ? company.documentsNeeded : [];
  if (Array.isArray(company.jobPositions) && company.jobPositions.length) {
    return company.jobPositions.map((position, index) => createPositionRow(position, index, fallbackDocuments));
  }
  if (Array.isArray(company.jobSpecifications) && company.jobSpecifications.length) {
    return company.jobSpecifications.map((position, index) => createPositionRow(position, index, fallbackDocuments));
  }
  return [createPositionRow({}, 0, DEFAULT_DOCUMENTS)];
}

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 46,
    height: 46,
    borderColor: state.isFocused ? "#2563eb" : "#cfd8e6",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
    borderRadius: 6,
    fontSize: 14,
    overflow: "hidden"
  }),
  valueContainer: (base) => ({
    ...base,
    minHeight: 46,
    height: 46,
    paddingTop: 0,
    paddingBottom: 0,
    overflowX: "auto",
    flexWrap: "nowrap"
  }),
  indicatorsContainer: (base) => ({ ...base, minHeight: 46, height: 46 }),
  input: (base) => ({ ...base, margin: 0, padding: 0 }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  multiValue: (base) => ({ ...base, background: "#dbeafe", borderRadius: 4 }),
  multiValueLabel: (base) => ({ ...base, color: "#0b55d9", fontWeight: 700 }),
  multiValueRemove: (base) => ({ ...base, color: "#0b55d9", ":hover": { background: "#bfdbfe", color: "#0b55d9" } })
};

function CompanyFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const menuPortalTarget = typeof document !== "undefined" ? document.body : null;

  const [user, setUser] = useState(null);
  const [countries, setCountries] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    name: "",
    countryId: "",
    companyPaymentPerApplicant: "",
    employerIds: [],
    agencyIds: [],
    jobPositions: [createPositionRow({}, 0, DEFAULT_DOCUMENTS)]
  });

  useEffect(() => {
    async function load() {
      try {
        setPageLoading(true);
        const [me, countryRes, employerRes, agencyRes, companyRes] = await Promise.all([
          API.get("/auth/me"),
          API.get("/countries"),
          API.get("/employers?paginated=false"),
          API.get("/agencies?paginated=false"),
          API.get("/companies?paginated=false")
        ]);
        const nextUser = me.data || null;
        setUser(nextUser);
        if (nextUser?.role !== "SUPER_USER") {
          navigate("/dashboard", { replace: true });
          return;
        }
        const companyItems = Array.isArray(companyRes.data) ? companyRes.data : companyRes.data?.items || [];
        setCountries(Array.isArray(countryRes.data) ? countryRes.data : countryRes.data?.items || []);
        setEmployers(Array.isArray(employerRes.data) ? employerRes.data : employerRes.data?.items || []);
        setAgencies(Array.isArray(agencyRes.data) ? agencyRes.data : agencyRes.data?.items || []);

        if (isEdit) {
          const selected = companyItems.find((company) => company.id === id);
          if (selected) {
            const agencyItems = Array.isArray(agencyRes.data) ? agencyRes.data : agencyRes.data?.items || [];
            const selectedAgencyIds = Array.isArray(selected.agencyIds) && selected.agencyIds.length
              ? selected.agencyIds
              : agencyItems
                  .filter((agency) => Array.isArray(agency.assignedCompanyIds) && agency.assignedCompanyIds.includes(id))
                  .map((agency) => agency.id);
            setForm({
              name: selected.name || "",
              countryId: selected.countryId || "",
              companyPaymentPerApplicant: selected.companyPaymentPerApplicant ?? "",
              employerIds: Array.isArray(selected.employerIds) ? selected.employerIds : [],
              agencyIds: selectedAgencyIds,
              jobPositions: normalizeCompanyPositions(selected)
            });
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setPageLoading(false);
      }
    }
    load();
  }, [id, isEdit, navigate]);

  const countryOptions = useMemo(() => countries.map((country) => ({ value: country.id, label: country.name })), [countries]);
  const employerOptions = useMemo(() => employers.map((employer) => ({ value: employer.id, label: employer.name })), [employers]);
  const agencyOptions = useMemo(() => agencies.map((agency) => ({ value: agency.id, label: agency.name })), [agencies]);

  const selectedCountry = countryOptions.find((country) => country.value === form.countryId) || null;
  const selectedEmployers = employerOptions.filter((employer) => form.employerIds.includes(employer.value));
  const selectedAgencies = agencyOptions.filter((agency) => form.agencyIds.includes(agency.value));

  const updatePosition = (rowKey, updater) => {
    setForm((prev) => ({
      ...prev,
      jobPositions: prev.jobPositions.map((position) =>
        position.rowKey === rowKey ? updater(position) : position
      )
    }));
  };

  const handleDocumentChange = (positionKey, documentKey, patch) => {
    updatePosition(positionKey, (position) => ({
      ...position,
      documents: position.documents.map((document) =>
        document.rowKey === documentKey ? { ...document, ...patch } : document
      )
    }));
  };

  const addPosition = () => {
    setForm((prev) => ({
      ...prev,
      jobPositions: [...prev.jobPositions, createPositionRow({}, prev.jobPositions.length, DEFAULT_DOCUMENTS)]
    }));
  };

  const removePosition = (rowKey) => {
    setForm((prev) => ({
      ...prev,
      jobPositions: prev.jobPositions.length > 1
        ? prev.jobPositions.filter((position) => position.rowKey !== rowKey)
        : prev.jobPositions
    }));
  };

  const addDocument = (positionKey) => {
    updatePosition(positionKey, (position) => ({
      ...position,
      documents: [...position.documents, createDocumentRow({}, position.documents.length)]
    }));
  };

  const removeDocument = (positionKey, documentKey) => {
    updatePosition(positionKey, (position) => ({
      ...position,
      documents: position.documents.filter((document) => document.rowKey !== documentKey)
    }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Company name is required";
    if (!form.countryId) nextErrors.countryId = "Country is required";

    const invalidPosition = form.jobPositions.find((position) => !String(position.title || "").trim());
    if (invalidPosition) nextErrors.jobPositions = "Job title is required";

    const invalidDocument = form.jobPositions.some((position) =>
      position.documents.some((document) => !String(document.name || "").trim())
    );
    if (invalidDocument) nextErrors.documents = "Document name is required";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const uploadDocumentTemplates = async (companyId) => {
    for (const position of form.jobPositions) {
      for (const document of position.documents) {
        if (!document.file) continue;
        const body = new FormData();
        body.append("file", document.file);
        body.append("documentId", document.id || buildId(document.name, "document"));
        body.append("jobPositionId", position.id || buildId(position.title, "job_position"));
        await API.post(`/companies/${companyId}/document-template`, body, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      }
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      setSaving(true);
      const jobPositions = form.jobPositions.map((position, index) => {
        const title = position.title.trim();
        const positionId = position.id || buildId(title, `job_position_${index + 1}`);
        return {
          id: positionId,
          title,
          name: title,
          documents: position.documents.map((document, documentIndex) => {
            const name = document.name.trim();
            return {
              id: document.id || buildId(name, `document_${documentIndex + 1}`),
              name,
              required: Boolean(document.required),
              templateFileName: document.templateFileName || "",
              templateFileUrl: document.templateFileUrl || ""
            };
          })
        };
      });

      const payload = {
        name: form.name.trim(),
        countryId: form.countryId,
        companyPaymentPerApplicant: Number(form.companyPaymentPerApplicant || 0),
        employerIds: form.employerIds,
        agencyIds: form.agencyIds,
        documentsNeeded: jobPositions[0]?.documents || [],
        jobSpecifications: jobPositions.map((position) => ({ id: position.id, name: position.title })),
        jobPositions
      };

      const response = isEdit
        ? await API.patch(`/companies/${id}`, payload)
        : await API.post("/add-company", payload);
      const companyId = id || response.data?.id;
      if (companyId) await uploadDocumentTemplates(companyId);
      navigate("/dashboard?tab=companies");
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="page-container">
        <DashboardTopbar user={user} />
        <PageLoader label="Loading company..." />
      </div>
    );
  }

  return (
    <div className="page-container companyFormPage">
      <DashboardTopbar user={user} />
      <BlockingLoader open={saving} label={isEdit ? "Updating company..." : "Creating company..."} />
      <main className="companyFormShell">
        <section className="companyFormCard">
          <div className="companyFormHeader">
            <span className="companyFormIcon">CO</span>
            <h1>{isEdit ? "Update Company" : "Add Company"}</h1>
          </div>

          <div className="companyFormGrid">
            <div>
              <label>Company Name <span>*</span></label>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className={errors.name ? "companyFormInput companyFormInputError" : "companyFormInput"}
                placeholder="Enter company name"
              />
              {errors.name ? <div className="companyFormError">{errors.name}</div> : null}
            </div>
            <div>
              <label>Country <span>*</span></label>
              <Select
                styles={selectStyles}
                options={countryOptions}
                value={selectedCountry}
                placeholder="Select country"
                onChange={(selected) => setForm((prev) => ({ ...prev, countryId: selected?.value || "" }))}
                menuPortalTarget={menuPortalTarget}
                menuPosition="fixed"
              />
              {errors.countryId ? <div className="companyFormError">{errors.countryId}</div> : null}
            </div>
            <div>
              <label>Employer POC</label>
              <Select
                isMulti
                styles={selectStyles}
                options={employerOptions}
                value={selectedEmployers}
                placeholder="Select employer POC"
                onChange={(selected) =>
                  setForm((prev) => ({ ...prev, employerIds: (selected || []).map((item) => item.value) }))
                }
                menuPortalTarget={menuPortalTarget}
                menuPosition="fixed"
              />
            </div>
            <div>
              <label>Agencies</label>
              <Select
                isMulti
                styles={selectStyles}
                options={agencyOptions}
                value={selectedAgencies}
                placeholder="Select agencies"
                onChange={(selected) =>
                  setForm((prev) => ({ ...prev, agencyIds: (selected || []).map((item) => item.value) }))
                }
                menuPortalTarget={menuPortalTarget}
                menuPosition="fixed"
              />
            </div>
          </div>

          <div className="companyPositionsHeader companyPaymentDetailsHeader">
            <div className="companySectionTitle">
              <span className="companyFormIcon">PD</span>
              <div>
                <h2>Payment Details</h2>
                <p>Set the company payment amount for each applicant.</p>
              </div>
            </div>
          </div>

          <div className="companyFormGrid companyPaymentGrid">
            <div>
              <label>Company Payment Per Applicant</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.companyPaymentPerApplicant}
                onChange={(event) => setForm((prev) => ({ ...prev, companyPaymentPerApplicant: event.target.value }))}
                className="companyFormInput"
                placeholder="Enter amount"
              />
            </div>
          </div>

          <div className="companyPositionsHeader">
            <div>
              <div className="companySectionTitle">
                <span className="companyFormIcon">JP</span>
                <div>
                  <h2>Job Positions</h2>
                  <p>Add one or more job positions for this company.</p>
                </div>
              </div>
            </div>
          </div>

          {errors.jobPositions ? <div className="companyFormError companyFormWideError">{errors.jobPositions}</div> : null}
          {errors.documents ? <div className="companyFormError companyFormWideError">{errors.documents}</div> : null}

          <div className="companyPositionsList">
            {form.jobPositions.map((position, positionIndex) => (
              <section className="companyPositionPanel" key={position.rowKey}>
                <div className="companyPositionTop">
                  <span className="companyPositionNumber">{positionIndex + 1}</span>
                  <label>Job Title <span>*</span></label>
                  <input
                    value={position.title}
                    placeholder="Enter job title"
                    className="companyFormInput companyJobTitleInput"
                    onChange={(event) => updatePosition(position.rowKey, (item) => ({ ...item, title: event.target.value }))}
                  />
                  <button
                    type="button"
                    className="companyDeleteIcon"
                    aria-label="Remove job position"
                    onClick={() => removePosition(position.rowKey)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Delete
                  </button>
                </div>

                <div className="companyDocumentsBlock">
                  <div className="companyDocumentsHeader">
                    <h3>Documents Required</h3>
                  </div>
                  <div className="companyDocumentsTable">
                    <div className="companyDocumentsRow companyDocumentsHead">
                      <div>Document Name</div>
                      <div>Required</div>
                      <div>Document to fill</div>
                      <div>Actions</div>
                    </div>
                    {position.documents.map((document) => (
                      <div className="companyDocumentsRow" key={document.rowKey}>
                        <input
                          className="companyFormInput"
                          value={document.name}
                          placeholder="Document name"
                          onChange={(event) => handleDocumentChange(position.rowKey, document.rowKey, { name: event.target.value })}
                        />
                        <label className="companyRequiredToggle">
                          <input
                            type="checkbox"
                            checked={Boolean(document.required)}
                            onChange={(event) => handleDocumentChange(position.rowKey, document.rowKey, { required: event.target.checked })}
                          />
                          Required
                        </label>
                        <label className="companyFileDrop">
                          <input
                            type="file"
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              handleDocumentChange(position.rowKey, document.rowKey, {
                                file,
                                templateFileName: file?.name || document.templateFileName
                              });
                            }}
                          />
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M15 3v4h4M10 13h4M10 17h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>{document.templateFileName || "Choose document"}</span>
                        </label>
                        <button
                          type="button"
                          className="companyRemoveButton"
                          onClick={() => removeDocument(position.rowKey, document.rowKey)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="companySectionFooter">
                    <button type="button" className="companyOutlineButton companySmallButton" onClick={() => addDocument(position.rowKey)}>
                      + Add Document
                    </button>
                  </div>
                </div>
              </section>
            ))}
          </div>

          <div className="companySectionFooter companyPositionsFooter">
            <button type="button" className="companyOutlineButton" onClick={addPosition}>
              + Add Job Position
            </button>
          </div>

          <div className="companyFormActions">
            <button type="button" className="companyCancelButton" onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="companyPrimaryButton" onClick={handleSubmit} disabled={saving}>
              {isEdit ? "Update Company" : "Create Company"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default CompanyFormPage;

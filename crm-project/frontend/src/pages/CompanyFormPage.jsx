import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmActionModal from "../components/common/ConfirmActionModal";
import API from "../services/api";
import "../styles/forms.css";
import "../styles/applicantDocuments.css";
import "../styles/applicantsDashboard.css";

const THEME = {
  primary: "#0052CC",
  border: "#ddd",
  error: "red"
};

const createDocumentId = (value, fallbackIndex = 0) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `document_${fallbackIndex + 1}`;
};

const createDocumentRow = (value = {}, index = 0) => ({
  rowKey: String(value.rowKey || value.id || `document_row_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`),
  id: String(value.id || createDocumentId(value.name, index)),
  name: String(value.name || value.label || ""),
  required: Boolean(value.required),
  templateFileName: String(value.templateFileName || ""),
  templateFileUrl: String(value.templateFileUrl || ""),
  file: null,
  clearTemplate: false
});

const handleFocus = (event) => {
  event.target.style.border = `1px solid ${THEME.primary}`;
};

const handleBlur = (event, hasError) => {
  event.target.style.border = hasError
    ? `1px solid ${THEME.error}`
    : `1px solid ${THEME.border}`;
};

const input = {
  width: "100%",
  padding: "6px",
  minHeight: "36px",
  borderRadius: 0,
  border: `1px solid ${THEME.border}`,
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none",
  transition: "border 0.2s ease"
};

const label = {
  fontSize: "13px",
  marginBottom: "5px",
  display: "block",
  color: "#374151",
  fontWeight: "500"
};

const errorText = {
  color: "red",
  fontSize: "12px",
  marginTop: "3px"
};

function TrashIcon() {
  return (
    <svg className="dashboardCountryIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CompanyFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [countries, setCountries] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [errors, setErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    countryId: "",
    employerIds: [],
    companyPaymentPerApplicant: "",
    documentsNeeded: []
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [userRes, countryRes, employerRes, companyRes] = await Promise.all([
          API.get("/auth/me"),
          API.get("/countries"),
          API.get("/employers"),
          API.get("/companies")
        ]);

        if (cancelled) return;

        if (userRes.data?.role !== "SUPER_USER") {
          navigate("/dashboard", { replace: true });
          return;
        }

        const companiesData = Array.isArray(companyRes.data) ? companyRes.data : [];
        setCountries(Array.isArray(countryRes.data) ? countryRes.data : []);
        setEmployers(Array.isArray(employerRes.data) ? employerRes.data : []);
        setCompanies(companiesData);

        if (isEdit) {
          const selected = companiesData.find((company) => company.id === id);
          if (!selected) {
            navigate("/dashboard?tab=companies", { replace: true });
            return;
          }

          setForm({
            name: selected.name || "",
            countryId: selected.countryId || "",
            employerIds: Array.isArray(selected.employerIds) ? selected.employerIds : [],
            companyPaymentPerApplicant: selected.companyPaymentPerApplicant ?? "",
            documentsNeeded: Array.isArray(selected.documentsNeeded)
              ? selected.documentsNeeded.map((document, index) => createDocumentRow(document, index))
              : []
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, navigate]);

  const countryOptions = useMemo(
    () =>
      countries.map((country) => ({
        value: country.id,
        label: country.name
      })),
    [countries]
  );

  const employerOptions = useMemo(
    () =>
      employers
        .filter((employer) => !form.countryId || employer.countryId === form.countryId)
        .map((employer) => ({
          value: employer.id,
          label: employer.name
        })),
    [employers, form.countryId]
  );

  const customSelectStyles = {
    control: (base, state) => ({
      ...base,
      padding: "2px",
      borderRadius: 0,
      border: `1px solid ${
        state.selectProps.hasError ? THEME.error : state.isFocused ? THEME.primary : THEME.border
      }`,
      boxShadow: "none",
      minHeight: "36px",
      "&:hover": {
        border: `1px solid ${state.selectProps.hasError ? THEME.error : THEME.primary}`
      }
    }),
    valueContainer: (base) => ({
      ...base,
      padding: "0 10px"
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 0,
      zIndex: 9999
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "#f0f6ff" : "#fff",
      color: "#333",
      cursor: "pointer"
    }),
    input: (base) => ({
      ...base,
      boxShadow: "none",
      border: "none"
    }),
    multiValue: (base) => ({
      ...base,
      borderRadius: 0
    })
  };

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "countryId") {
        next.employerIds = prev.employerIds.filter((employerId) =>
          employers.some((employer) => employer.id === employerId && employer.countryId === value)
        );
      }
      return next;
    });

    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const updateDocument = (rowKey, key, value) => {
    setForm((prev) => ({
      ...prev,
      documentsNeeded: prev.documentsNeeded.map((document, index) => {
        if (document.rowKey !== rowKey) return document;

        const next = { ...document, [key]: value };
        if (key === "name") {
          next.id = createDocumentId(value, index);
        }
        if (key === "file") {
          next.clearTemplate = false;
        }
        return next;
      })
    }));
  };

  const addDocumentRow = () => {
    setForm((prev) => ({
      ...prev,
      documentsNeeded: [...prev.documentsNeeded, createDocumentRow({}, prev.documentsNeeded.length)]
    }));
  };

  const removeDocumentRow = (documentId) => {
    setForm((prev) => ({
      ...prev,
      documentsNeeded: prev.documentsNeeded.filter((document) => document.rowKey !== documentId)
    }));
  };

  const clearTemplateFile = (rowKey) => {
    setForm((prev) => ({
      ...prev,
      documentsNeeded: prev.documentsNeeded.map((document) =>
        document.rowKey === rowKey
          ? {
              ...document,
              templateFileName: "",
              templateFileUrl: "",
              file: null,
              clearTemplate: true
            }
          : document
      )
    }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.name.trim()) nextErrors.name = "Company name is required";
    if (!form.countryId) nextErrors.countryId = "Select country";
    if (form.companyPaymentPerApplicant === "") {
      nextErrors.companyPaymentPerApplicant = "Total amount is required";
    } else if (Number.isNaN(Number(form.companyPaymentPerApplicant)) || Number(form.companyPaymentPerApplicant) < 0) {
      nextErrors.companyPaymentPerApplicant = "Total amount must be a valid number";
    }

    const invalidDocument = form.documentsNeeded.find((document) => !String(document.name || "").trim());
    if (invalidDocument) {
      nextErrors.documentsNeeded = "Document name is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const uploadDocumentTemplates = async (companyId, documentsNeeded) => {
    for (const document of documentsNeeded) {
      if (!document.file) continue;

      const formData = new FormData();
      formData.append("file", document.file);
      formData.append("documentId", document.id);
      await API.post(`/companies/${companyId}/document-template`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      setSaving(true);

      const documentsNeeded = form.documentsNeeded.map((document, index) => ({
        id: createDocumentId(document.name, index),
        name: String(document.name || "").trim(),
        required: Boolean(document.required),
        templateFileName: document.clearTemplate ? "" : document.templateFileName || "",
        templateFileUrl: document.clearTemplate ? "" : document.templateFileUrl || ""
      }));

      const payload = {
        name: form.name.trim(),
        countryId: form.countryId,
        employerIds: form.employerIds,
        companyPaymentPerApplicant: Number(form.companyPaymentPerApplicant),
        documentsNeeded
      };

      let companyId = id;
      if (isEdit) {
        await API.patch(`/companies/${id}`, payload);
      } else {
        const response = await API.post("/add-company", payload);
        companyId = response.data?.id;
      }

      await uploadDocumentTemplates(companyId, form.documentsNeeded);
      navigate({ pathname: "/dashboard", search: "?tab=companies" }, { replace: true });
    } catch (error) {
      console.error(error);
      setErrors((prev) => ({
        ...prev,
        form: error?.response?.data?.message || "Failed to save company"
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!id) return;

    try {
      setSaving(true);
      await API.delete(`/companies/${id}`);
      navigate({ pathname: "/dashboard", search: "?tab=companies" }, { replace: true });
    } catch (error) {
      console.error(error);
      setErrors((prev) => ({
        ...prev,
        form: error?.response?.data?.message || "Failed to delete company"
      }));
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-content" style={{ maxWidth: "980px" }}>
        <div className="card">
          <div style={{ marginBottom: "10px" }}>
            <div className="dashboardHeaderActions">
              <h3 style={{ margin: 0 }}>{isEdit ? "Edit Company" : "Add Company"}</h3>
              {isEdit ? (
                <button
                  type="button"
                  className="dashboardIconBtn"
                  onClick={() => setShowDeleteConfirm(true)}
                  aria-label="Delete company"
                  title="Delete company"
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label}>Company Name</label>
              <input
                style={{ ...input, border: errors.name ? `1px solid ${THEME.error}` : input.border }}
                value={form.name}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.name)}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Company Name"
              />
              {errors.name ? <div style={errorText}>{errors.name}</div> : null}
            </div>

            <div>
              <label style={label}>Country</label>
              <div className="dashboardSelect">
                <Select
                  classNamePrefix="dashboardSelect"
                  styles={customSelectStyles}
                  hasError={Boolean(errors.countryId)}
                  options={countryOptions}
                  placeholder="Search country..."
                  value={countryOptions.find((country) => country.value === form.countryId) || null}
                  onChange={(selected) => updateField("countryId", selected?.value || "")}
                />
              </div>
              {errors.countryId ? <div style={errorText}>{errors.countryId}</div> : null}
            </div>

            <div>
              <label style={label}>Employer POC</label>
              <div className="dashboardSelect">
                <Select
                  isMulti
                  classNamePrefix="dashboardSelect"
                  styles={customSelectStyles}
                  options={employerOptions}
                  placeholder="Search employer..."
                  value={employerOptions.filter((option) => form.employerIds.includes(option.value))}
                  onChange={(selected) => updateField("employerIds", (selected || []).map((option) => option.value))}
                />
              </div>
            </div>

            <div>
              <label style={label}>Total Amount in Euro</label>
              <input
                style={{
                  ...input,
                  border: errors.companyPaymentPerApplicant ? `1px solid ${THEME.error}` : input.border
                }}
                value={form.companyPaymentPerApplicant}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.companyPaymentPerApplicant)}
                onChange={(event) => updateField("companyPaymentPerApplicant", event.target.value)}
                placeholder="Total Amount"
              />
              {errors.companyPaymentPerApplicant ? (
                <div style={errorText}>{errors.companyPaymentPerApplicant}</div>
              ) : null}
            </div>

          </div>

          <div style={{ marginTop: "24px" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "10px" }}>Documents Needed</div>

            {form.documentsNeeded.map((document) => (
              <div
                key={document.rowKey}
                style={{
                  border: "1px solid #dbe3ef",
                  padding: "14px",
                  marginBottom: "12px",
                  background: "#fff"
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "12px",
                    alignItems: "start"
                  }}
                >
                  <div>
                    <label style={label}>Document Name</label>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        style={{
                          ...input,
                          flex: "1 1 220px",
                          border: errors.documentsNeeded ? `1px solid ${THEME.error}` : input.border
                        }}
                        value={document.name}
                        onFocus={handleFocus}
                        onBlur={(event) => handleBlur(event, errors.documentsNeeded)}
                        onChange={(event) => updateDocument(document.rowKey, "name", event.target.value)}
                        placeholder="Document Name"
                      />
                      <button
                        type="button"
                        className="dashboardInlineLinkBtn"
                        onClick={() => removeDocumentRow(document.rowKey)}
                      >
                        Remove document
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={label}>Required</label>
                    <label className="dashboardMiniCheckbox" style={{ minHeight: "44px" }}>
                      <input
                        type="checkbox"
                        checked={document.required}
                        onChange={(event) => updateDocument(document.rowKey, "required", event.target.checked)}
                      />
                      <span>Required</span>
                    </label>
                  </div>

                  <div>
                    <label style={label}>Document to fill</label>
                    <label className="docsFileCard" style={{ marginBottom: "8px" }}>
                      <input
                        type="file"
                        className="docsFileInput"
                        onChange={(event) => updateDocument(document.rowKey, "file", event.target.files?.[0] || null)}
                      />
                      <span className="docsFileCardTitle">
                        {document.file?.name || document.templateFileName || "Upload document"}
                      </span>
                    </label>

                    {document.templateFileUrl ? (
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        <a className="linkBtn" href={document.templateFileUrl} target="_blank" rel="noreferrer">
                          Download current file
                        </a>
                        <button
                          type="button"
                          className="dashboardInlineLinkBtn"
                          onClick={() => clearTemplateFile(document.rowKey)}
                        >
                          Remove file
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

              </div>
            ))}

            {errors.documentsNeeded ? <div style={errorText}>{errors.documentsNeeded}</div> : null}

            <button type="button" className="dashboardPrimaryBtn" onClick={addDocumentRow}>
              Add Document
            </button>
          </div>

          {errors.form ? <div style={{ ...errorText, marginTop: "16px" }}>{errors.form}</div> : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
            <button
              type="button"
              className="dashboardPaginationBtn"
              onClick={() => navigate({ pathname: "/dashboard", search: "?tab=companies" }, { replace: true })}
            >
              Cancel
            </button>
            <button type="button" className="dashboardPrimaryBtn" disabled={saving} onClick={handleSubmit}>
              {saving ? "Saving..." : isEdit ? "Update Profile" : "Create Profile"}
            </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm ? (
        <ConfirmActionModal
          title="Delete Company"
          message="Are you sure you want to delete this company? This cannot be undone."
          confirmLabel="Delete"
          isBusy={saving}
          onConfirm={handleDeleteCompany}
          onClose={() => setShowDeleteConfirm(false)}
        />
      ) : null}
    </div>
  );
}

export default CompanyFormPage;

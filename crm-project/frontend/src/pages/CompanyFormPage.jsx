import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "../utils/toast";
import API from "../services/api";
import { getCached, invalidateCache } from "../services/cachedApi";
import DashboardTopbar from "../components/common/DashboardTopbar";
import BlockingLoader from "../components/common/BlockingLoader";
import PageLoader from "../components/common/PageLoader";
import ConfirmActionModal from "../components/common/ConfirmActionModal";
import {
  ALLOWED_DOCUMENT_ACCEPT,
  DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS,
  DOC_ONLY_EXTENSIONS,
  DOCUMENT_UPLOAD_HELP_TEXT,
  getValidatedDocumentFile,
  validateDocumentFiles
} from "../utils/fileValidation";
import { isSuperUserLikeRole } from "../utils/auth";
import { hasRight } from "../utils/rights";
import "../styles/applicantsDashboard.css";

const DEFAULT_DOCUMENT_ASSET_PATH = "/default-documents/";
const defaultDocumentAssetUrl = (fileName) => `${DEFAULT_DOCUMENT_ASSET_PATH}${encodeURIComponent(fileName)}`;

const DEFAULT_DOCUMENTS = [
  {
    id: "cv_word_format_with_photo",
    name: "CV in word format with photo",
    required: true,
    allowedExtensions: DOC_ONLY_EXTENSIONS,
    uploadHelpText: "Upload DOC or DOCX (Max 5 MB)"
  },
  { id: "experience_reference_document", name: "Experience/reference document", required: false },
  { id: "additional_experience_reference_document", name: "Additional Experience/reference document", required: false },
  {
    id: "passport_scan_standard",
    name: "Passport scan as per the given standard",
    required: true,
    referenceFileName: "Passport copy sample.jpeg",
    referenceUrl: defaultDocumentAssetUrl("Passport copy sample.jpeg")
  },
  {
    id: "passport_photo_scan_standard",
    name: "Photo (passport photo scan as per the given standard)",
    required: true,
    referenceFileName: "Visa_Photo_Requirements.pdf",
    referenceUrl: defaultDocumentAssetUrl("Visa_Photo_Requirements.pdf")
  },
  { id: "education_document", name: "Education document (higher secondary school pass certificate)", required: true },
  { id: "additional_education_document", name: "Additional Education Document", required: false },
  {
    id: "podpis_tujca",
    name: "Podpis Tujca (signed with blue pen)",
    required: true,
    documentToFillFileName: "podpisTujca.PDF",
    documentToFillUrl: defaultDocumentAssetUrl("podpisTujca.PDF"),
    templateFileName: "podpisTujca.PDF",
    templateFileUrl: defaultDocumentAssetUrl("podpisTujca.PDF"),
    referenceFileName: "podpisTujcaReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("podpisTujcaReference.jpeg")
  },
  {
    id: "tax_authorization",
    name: "Tax Authorization",
    required: true,
    documentToFillFileName: "taxAuthorization.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("taxAuthorization.pdf"),
    templateFileName: "taxAuthorization.pdf",
    templateFileUrl: defaultDocumentAssetUrl("taxAuthorization.pdf"),
    referenceFileName: "taxAuthorizationReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("taxAuthorizationReference.jpeg")
  },
  { id: "pan_card", name: "Pan card", required: true },
  {
    id: "application_authorization",
    name: "Application Authorization",
    required: true,
    documentToFillFileName: "applicationAuthorization.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("applicationAuthorization.pdf"),
    templateFileName: "applicationAuthorization.pdf",
    templateFileUrl: defaultDocumentAssetUrl("applicationAuthorization.pdf"),
    referenceFileName: "applicationAuthorizationReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("applicationAuthorizationReference.jpeg")
  },
  {
    id: "appointment_authorization",
    name: "Appointment Authorization",
    required: true,
    documentToFillFileName: "AppointmentAuthorization.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("AppointmentAuthorization.pdf"),
    templateFileName: "AppointmentAuthorization.pdf",
    templateFileUrl: defaultDocumentAssetUrl("AppointmentAuthorization.pdf"),
    referenceFileName: "appointmentAuthorizationReference.jpeg",
    referenceUrl: defaultDocumentAssetUrl("appointmentAuthorizationReference.jpeg")
  },
  {
    id: "medical_certificate",
    name: "Medical certificate",
    required: true,
    documentToFillFileName: "Medical Certificate_01.2026.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("Medical Certificate_01.2026.pdf"),
    templateFileName: "Medical Certificate_01.2026.pdf",
    templateFileUrl: defaultDocumentAssetUrl("Medical Certificate_01.2026.pdf")
  },
  {
    id: "workwear_measurement",
    name: "Workwear measurement",
    required: false,
    documentToFillFileName: "WorkwearMeasurement.pdf",
    documentToFillUrl: defaultDocumentAssetUrl("WorkwearMeasurement.pdf"),
    templateFileName: "WorkwearMeasurement.pdf",
    templateFileUrl: defaultDocumentAssetUrl("WorkwearMeasurement.pdf"),
    referenceFileName: "footwearSize.jpeg",
    referenceUrl: defaultDocumentAssetUrl("footwearSize.jpeg")
  },
  { id: "affidavit", name: "AFFIDAVIT", required: true },
  { id: "pcc", name: "PCC", required: true },
  { id: "additional_document_1", name: "Additional Document", required: false },
  { id: "additional_document_2", name: "Additional Document", required: false },
  { id: "additional_document_3", name: "Additional Document", required: false }
];

const createKey = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function CompanyIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M3 21h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function JobIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1M4 9h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 13h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UploadFileIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16.5a4 4 0 0 0-3.8-4A5.5 5.5 0 0 0 5.7 14 3.5 3.5 0 0 0 6.5 21H18a3 3 0 0 0 2-5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    documentToFillFileName: document.documentToFillFileName || document.fillDocumentFileName || document.templateFileName || "",
    documentToFillUrl: document.documentToFillUrl || document.fillDocumentUrl || document.templateFileUrl || "",
    referenceFileName: document.referenceFileName || document.referenceDocumentFileName || "",
    referenceUrl: document.referenceUrl || document.referenceDocumentUrl || "",
    allowedExtensions: Array.isArray(document.allowedExtensions) && document.allowedExtensions.length
      ? document.allowedExtensions
      : DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS,
    uploadHelpText: document.uploadHelpText || "",
    documentToFillFile: null,
    referenceFile: null
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
  const isSuperUser = isSuperUserLikeRole(user?.role);
  const canDeleteCompany = hasRight(user, "DELETE_COMPANIES");
  const canDeleteJobPosition = hasRight(user, "DELETE_JOB_POSITION");
  const companyDashboardTabs = ["home", "applicants", "companies"];
  const handleDashboardTabChange = (tabKey) => {
    navigate(tabKey === "home" ? "/dashboard" : `/dashboard?tab=${encodeURIComponent(tabKey)}`);
  };
  const [countries, setCountries] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copiedPositionKey, setCopiedPositionKey] = useState("");
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
          getCached("/auth/me", { ttlMs: 120000 }).then((data) => ({ data })),
          getCached("/countries", { ttlMs: 600000 }).then((data) => ({ data })),
          getCached("/employers", { params: { paginated: "false" }, ttlMs: 600000 }).then((data) => ({ data })),
          getCached("/agencies", { params: { paginated: "false" }, ttlMs: 600000 }).then((data) => ({ data })),
          getCached("/companies", {
            params: { paginated: "false" },
            ttlMs: 600000,
            // The company was just updated before this edit page is reopened.
            // Revalidate the HTTP cache so its employer/agency assignments are current.
            force: isEdit
          }).then((data) => ({ data }))
        ]);
        const nextUser = me.data || null;
        setUser(nextUser);
        if (!hasRight(nextUser, "ADD_COMPANIES")) {
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

  const copyAddApplicantLink = async (position) => {
    if (!isEdit) {
      toast.info("Save the company before copying an applicant link.");
      return;
    }

    const jobPositionId = position.id || buildId(position.title, "job_position");
    const params = new URLSearchParams({
      source: "job-position-link",
      countryId: form.countryId,
      companyId: id,
      jobPositionId
    });
    const link = `${window.location.origin}/create-applicant?${params.toString()}`;

    let copied = true;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = link;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      copied = document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    if (!copied) {
      toast.error("Unable to copy the applicant link. Please try again.");
      return;
    }
    setCopiedPositionKey(position.rowKey);
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
    const documentFiles = form.jobPositions
      .flatMap((position) => position.documents.flatMap((document) => [document.documentToFillFile, document.referenceFile]))
      .filter(Boolean);
    const fileValidation = validateDocumentFiles(documentFiles);
    if (!fileValidation.valid) nextErrors.documents = fileValidation.message;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.warning(`Please complete: ${[...new Set(Object.values(nextErrors))].join(", ")}`);
    }
    return Object.keys(nextErrors).length === 0;
  };

  const uploadDocumentTemplates = async (companyId) => {
    for (const position of form.jobPositions) {
      for (const document of position.documents) {
        const uploads = [
          { file: document.documentToFillFile, templateType: "documentToFill" },
          { file: document.referenceFile, templateType: "reference" }
        ];
        for (const upload of uploads) {
          if (!upload.file) continue;
          const body = new FormData();
          body.append("file", upload.file);
          body.append("documentId", document.id || buildId(document.name, "document"));
          body.append("jobPositionId", position.id || buildId(position.title, "job_position"));
          body.append("templateType", upload.templateType);
          await API.post(`/companies/${companyId}/document-template`, body, {
            headers: { "Content-Type": "multipart/form-data" }
          });
        }
      }
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    let companyId = id;
    try {
      window.scrollTo({ top: 0, behavior: "auto" });
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
              templateFileUrl: document.templateFileUrl || "",
              documentToFillFileName: document.documentToFillFileName || document.fillDocumentFileName || document.templateFileName || "",
              documentToFillUrl: document.documentToFillUrl || document.fillDocumentUrl || document.templateFileUrl || "",
              referenceFileName: document.referenceFileName || document.referenceDocumentFileName || "",
              referenceUrl: document.referenceUrl || document.referenceDocumentUrl || "",
              allowedExtensions: Array.isArray(document.allowedExtensions) && document.allowedExtensions.length
                ? document.allowedExtensions
                : DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS,
              uploadHelpText: document.uploadHelpText || ""
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
      companyId = id || response.data?.id;
      if (!companyId) throw new Error("The company was saved but no company id was returned.");
      await uploadDocumentTemplates(companyId);
      invalidateCache("/companies");
      invalidateCache("/agencies");
      invalidateCache("/employers");
      toast.success(isEdit ? "Company updated successfully" : "Company created successfully");
      navigate("/dashboard?tab=companies");
    } catch (error) {
      console.error(error);
      const uploadMessage = error?.response?.data?.message || error?.message || "Unable to save the company. Please try again.";
      if (!isEdit && companyId) {
        invalidateCache("/companies");
        toast.error(`Company was created, but its document could not be uploaded: ${uploadMessage}`);
        navigate(`/companies/${companyId}/edit`);
      } else {
        toast.error(uploadMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!isEdit || !isSuperUser) return;
    try {
      setSaving(true);
      await API.delete(`/companies/${id}`);
      invalidateCache("/companies");
      invalidateCache("/agencies");
      invalidateCache("/employers");
      toast.success("Company and related job positions deleted successfully");
      navigate("/dashboard?tab=companies");
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Unable to delete company");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="page-container">
        <DashboardTopbar
          user={user}
          showTabs={isSuperUser}
          tabs={companyDashboardTabs.map((key) => ({ key, label: key === "home" ? "Home" : key === "applicants" ? "Applicants" : "Companies" }))}
          activeTab="companies"
          onTabChange={handleDashboardTabChange}
        />
        <PageLoader label="Loading company..." />
      </div>
    );
  }

  return (
    <div className="page-container companyFormPage">
      <DashboardTopbar
        user={user}
        showTabs={isSuperUser}
        tabs={companyDashboardTabs.map((key) => ({ key, label: key === "home" ? "Home" : key === "applicants" ? "Applicants" : "Companies" }))}
        activeTab="companies"
        onTabChange={handleDashboardTabChange}
      />
      <BlockingLoader open={saving} label={isEdit ? "Updating company..." : "Creating company..."} />
      <main className="companyFormShell">
        <section className="companyFormCard">
          <div className="companyFormHeader">
            <span className="companyFormIcon"><CompanyIcon /></span>
            <h1>{isEdit ? "Update Company" : "Add Company"}</h1>
            {isEdit && canDeleteCompany ? (
              <div className="companyFormHeaderActions">
                <button type="button" className="companyRemoveButton" onClick={() => setShowDeleteConfirm(true)} disabled={saving}>
                  <TrashIcon />
                  Delete Company
                </button>
              </div>
            ) : null}
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

          <div className="companyPositionsHeader">
            <div>
              <div className="companySectionTitle">
                <span className="companyFormIcon"><JobIcon /></span>
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
                  <div className="companyPositionActions">
                    <button
                      type="button"
                      className="companyCopyApplicantLink"
                      onClick={() => copyAddApplicantLink(position)}
                      disabled={!isEdit}
                      title={isEdit ? "Copy link to Add Applicants" : "Save the company to enable this link"}
                    >
                      {copiedPositionKey === position.rowKey ? "Link Copied" : "Copy link to Add Applicants"}
                    </button>
                    <button
                      type="button"
                      className="companyDeleteIcon"
                      aria-label="Remove job position"
                      disabled={!canDeleteJobPosition}
                      onClick={() => removePosition(position.rowKey)}
                    >
                      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
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
                      <div>Reference Document</div>
                      <div>Actions</div>
                    </div>
                    {position.documents.map((document) => (
                      <div className="companyDocumentsRow" key={document.rowKey}>
                        <div className="companyDocNameCell">
                          <input
                            className="companyFormInput"
                            value={document.name}
                            placeholder="Document name"
                            onChange={(event) => handleDocumentChange(position.rowKey, document.rowKey, { name: event.target.value })}
                          />
                        </div>
                        <label className="companyRequiredToggle">
                          <input
                            type="checkbox"
                            aria-label={`Required ${document.name || "document"}`}
                            checked={Boolean(document.required)}
                            onChange={(event) => handleDocumentChange(position.rowKey, document.rowKey, { required: event.target.checked })}
                          />
                        </label>
                        <div className="companyTemplateCell">
                          <label className="companyDocUploadCard">
                            <input
                              type="file"
                              accept={ALLOWED_DOCUMENT_ACCEPT}
                              onChange={(event) => {
                                const file = getValidatedDocumentFile(event.target.files?.[0] || null, toast.error);
                                handleDocumentChange(position.rowKey, document.rowKey, {
                                  documentToFillFile: file,
                                  documentToFillFileName: file?.name || document.documentToFillFileName || document.templateFileName,
                                  templateFileName: file?.name || document.templateFileName
                                });
                              }}
                            />
                            <span className="companyFileDropIcon"><UploadFileIcon /></span>
                            <span>{document.documentToFillFile?.name || document.documentToFillFileName || "Choose document"}</span>
                          </label>
                          <div className="companyDocFileActions">
                          {document.documentToFillUrl ? (
                            <a className="companyDocFileAction companyDocFileActionView" href={document.documentToFillUrl} target="_blank" rel="noreferrer">
                              <ViewIcon />
                              View
                            </a>
                          ) : null}
                            {document.documentToFillFile || document.documentToFillFileName || document.documentToFillUrl ? (
                              <button
                                type="button"
                                className="companyDocFileAction companyDocFileActionRemove"
                                onClick={() => handleDocumentChange(position.rowKey, document.rowKey, {
                                  documentToFillFile: null,
                                  documentToFillFileName: "",
                                  documentToFillUrl: "",
                                  templateFileName: "",
                                  templateFileUrl: ""
                                })}
                              >
                                <TrashIcon />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="companyTemplateCell">
                          <label className="companyDocUploadCard">
                            <input
                              type="file"
                              accept={ALLOWED_DOCUMENT_ACCEPT}
                              onChange={(event) => {
                                const file = getValidatedDocumentFile(event.target.files?.[0] || null, toast.error);
                                handleDocumentChange(position.rowKey, document.rowKey, {
                                  referenceFile: file,
                                  referenceFileName: file?.name || document.referenceFileName
                                });
                              }}
                            />
                            <span className="companyFileDropIcon"><UploadFileIcon /></span>
                            <span>{document.referenceFile?.name || document.referenceFileName || "Choose document"}</span>
                          </label>
                          <div className="companyDocFileActions">
                            {document.referenceUrl ? (
                              <a className="companyDocFileAction companyDocFileActionView" href={document.referenceUrl} target="_blank" rel="noreferrer">
                                <ViewIcon />
                                View
                              </a>
                            ) : null}
                            {document.referenceFile || document.referenceFileName || document.referenceUrl ? (
                              <button
                                type="button"
                                className="companyDocFileAction companyDocFileActionRemove"
                                onClick={() => handleDocumentChange(position.rowKey, document.rowKey, {
                                  referenceFile: null,
                                  referenceFileName: "",
                                  referenceUrl: ""
                                })}
                              >
                                <TrashIcon />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="companyRemoveButton"
                          onClick={() => removeDocument(position.rowKey, document.rowKey)}
                        >
                          <TrashIcon />
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
      {showDeleteConfirm ? (
        <ConfirmActionModal
          title="Delete Company"
          message="Are you sure you want to delete this company, its job positions, and related document templates? This cannot be undone."
          confirmLabel="Delete Company"
          isBusy={saving}
          onConfirm={handleDeleteCompany}
          onClose={() => !saving && setShowDeleteConfirm(false)}
        />
      ) : null}
    </div>
  );
}

export default CompanyFormPage;

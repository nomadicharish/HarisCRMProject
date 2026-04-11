import React, { useEffect, useMemo, useState } from "react";
import ConfirmActionModal from "../common/ConfirmActionModal";
import Select from "react-select";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import API from "../../services/api";
import "../../styles/forms.css";
import "../../styles/applicantContract.css";

const createSelectStyles = (hasError = false) => ({
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderRadius: 0,
    borderColor: hasError ? "#dc2626" : "#d0d5dd",
    background: "#f8fbff",
    boxShadow: "none",
    "&:hover": {
      borderColor: hasError ? "#dc2626" : "#d0d5dd"
    },
    ...(state.isFocused
      ? {
          borderColor: hasError ? "#dc2626" : "#0052cc",
          boxShadow: "none"
        }
      : null)
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "0 12px"
  }),
  input: (base) => ({
    ...base,
    boxShadow: "none",
    outline: "none",
    border: "none"
  }),
  menu: (base) => ({
    ...base,
    zIndex: 1500
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 0,
    background: "#e9f2ff"
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "#0052cc",
    fontWeight: 500
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#0052cc",
    ":hover": {
      backgroundColor: "#dbeafe",
      color: "#1d4ed8"
    }
  })
});

const TYPE_CONFIG = {
  agency: {
    title: "Add Agency",
    editTitle: "Edit Agency",
    createEndpoint: "/add-agency",
    updateEndpoint: "/agencies",
    nameLabel: "Agency Name"
  },
  company: {
    title: "Add Company",
    editTitle: "Edit Company",
    createEndpoint: "/add-company",
    updateEndpoint: "/companies",
    nameLabel: "Company Name"
  },
  employer: {
    title: "Add Employer",
    editTitle: "Edit Employer",
    createEndpoint: "/add-employer",
    updateEndpoint: "/employers",
    nameLabel: "Employer Name"
  }
};

const INITIAL_FORM = {
  name: "",
  countryId: "",
  companyId: "",
  contactNumber: "",
  address: "",
  email: "",
  employerIds: [],
  assignedCompanyIds: [],
  companyPaymentPerApplicant: ""
};

function TrashIcon() {
  return (
    <svg className="dashboardCountryIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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

function EntityFormModal({
  type,
  countries = [],
  companies = [],
  employers = [],
  editData = null,
  onClose,
  onSaved
}) {
  const config = TYPE_CONFIG[type];
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(INITIAL_FORM);

  const countryOptions = useMemo(
    () => countries.map((country) => ({ value: country.id, label: country.name })),
    [countries]
  );

  const companyOptions = useMemo(
    () =>
      companies
        .filter((company) => !form.countryId || company.countryId === form.countryId)
        .map((company) => ({ value: company.id, label: company.name })),
    [companies, form.countryId]
  );

  const employerOptions = useMemo(
    () =>
      employers.map((employer) => ({
        value: employer.id,
        label: employer.name
      })),
    [employers]
  );

  useEffect(() => {
    if (!editData) {
      setForm(INITIAL_FORM);
      setErrors({});
      return;
    }

    setForm({
      name: editData.name || "",
      countryId: editData.countryId || "",
      companyId: editData.companyId || "",
      contactNumber: editData.contactNumber || "",
      address: editData.address || "",
      email: editData.email || "",
      employerIds: Array.isArray(editData.employerIds) ? editData.employerIds : [],
      assignedCompanyIds: Array.isArray(editData.assignedCompanyIds) ? editData.assignedCompanyIds : [],
      companyPaymentPerApplicant:
        editData.companyPaymentPerApplicant ?? editData.totalEmployerPayment ?? ""
    });
    setErrors({});
  }, [editData]);

  if (!config) return null;

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "countryId" && type === "employer") {
        next.companyId = "";
      }

      return next;
    });

    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.name.trim()) nextErrors.name = `${config.nameLabel} is required`;
    if (type === "company" && !form.countryId) nextErrors.countryId = "Country is required";
    if (type === "employer" && !form.countryId) nextErrors.countryId = "Country is required";
    if (type === "agency" && !form.assignedCompanyIds.length) {
      nextErrors.assignedCompanyIds = "Select at least one company";
    }
    if (type !== "company" && !form.contactNumber) nextErrors.contactNumber = "Contact number is required";
    if (type === "agency" && !form.address.trim()) nextErrors.address = "Address is required";

    if (type !== "company") {
      const email = String(form.email || "").trim();
      if (!email) {
        nextErrors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        nextErrors.email = "Enter a valid email address";
      }
    }

    if (type === "company") {
      const paymentValue = String(form.companyPaymentPerApplicant || "").trim();
      if (!paymentValue) {
        nextErrors.companyPaymentPerApplicant = "Payment for each candidate is required";
      } else if (Number.isNaN(Number(paymentValue)) || Number(paymentValue) < 0) {
        nextErrors.companyPaymentPerApplicant = "Enter a valid amount";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      setSaving(true);

      const payload = {
        name: form.name.trim(),
        countryId: form.countryId || "",
        companyId: form.companyId || "",
        contactNumber: form.contactNumber || "",
        address: form.address.trim(),
        email: String(form.email || "").trim(),
        employerIds: form.employerIds,
        assignedCompanyIds: form.assignedCompanyIds,
        companyPaymentPerApplicant:
          form.companyPaymentPerApplicant === "" ? "" : Number(form.companyPaymentPerApplicant)
      };

      if (editData?.id) {
        await API.patch(`${config.updateEndpoint}/${editData.id}`, payload);
      } else {
        await API.post(config.createEndpoint, payload);
      }

      if (typeof onSaved === "function") {
        await onSaved();
      }

      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      setErrors((prev) => ({
        ...prev,
        form: error?.response?.data?.message || `Failed to save ${type}`
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editData?.id) return;

    try {
      setDeleting(true);
      await API.delete(`${config.updateEndpoint}/${editData.id}`);

      if (typeof onSaved === "function") {
        await onSaved();
      }

      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      setErrors((prev) => ({
        ...prev,
        form: error?.response?.data?.message || `Failed to delete ${type}`
      }));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <div className="contractModalOverlay">
        <div className="contractModalCard dashboardEntityModal">
          <div className="dashboardModalHeader">
            <h3 className="dashboardModalTitle">{editData ? config.editTitle : config.title}</h3>
            <div className="dashboardHeaderActions">
              {editData ? (
                <button
                  type="button"
                  className="dashboardIconBtn"
                  onClick={() => setShowDeleteConfirm(true)}
                  aria-label={`Delete ${type}`}
                  title={`Delete ${type}`}
                >
                  <TrashIcon />
                </button>
              ) : null}
              <button type="button" className="dashboardModalCloseBtn" onClick={onClose}>
                x
              </button>
            </div>
          </div>

          <div className="contractFormGrid dashboardEntityGrid">
            <div className="input-field dashboardEntityFullWidth">
              <label className="contractUploadLabel" htmlFor={`${type}-name`}>
                {config.nameLabel}
              </label>
              <input
                id={`${type}-name`}
                type="text"
                className={errors.name ? "dashboardFieldError" : ""}
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder={`Enter ${type} name`}
              />
              {errors.name ? <div className="dashboardInlineError">{errors.name}</div> : null}
            </div>

            {type !== "agency" ? (
              <div className="input-field">
                <label className="contractUploadLabel">Country</label>
                <Select
                  className="dashboardSelect"
                  classNamePrefix="dashboardSelect"
                  options={countryOptions}
                  value={countryOptions.find((option) => option.value === form.countryId) || null}
                  onChange={(option) => updateField("countryId", option?.value || "")}
                  isSearchable
                  placeholder="Select country"
                  styles={createSelectStyles(Boolean(errors.countryId))}
                />
                {errors.countryId ? <div className="dashboardInlineError">{errors.countryId}</div> : null}
              </div>
            ) : null}

            {type === "employer" ? (
              <div className="input-field">
                <label className="contractUploadLabel">Company</label>
                <Select
                  className="dashboardSelect"
                  classNamePrefix="dashboardSelect"
                  options={companyOptions}
                  value={companyOptions.find((option) => option.value === form.companyId) || null}
                  onChange={(option) => updateField("companyId", option?.value || "")}
                  isSearchable
                  isDisabled={!form.countryId}
                  placeholder={form.countryId ? "Select company" : "Select country first"}
                  styles={createSelectStyles(Boolean(errors.companyId))}
                />
                {errors.companyId ? <div className="dashboardInlineError">{errors.companyId}</div> : null}
              </div>
            ) : null}

            {type === "company" ? (
              <>
                <div className="input-field dashboardEntityFullWidth">
                  <label className="contractUploadLabel">Employer POC</label>
                  <Select
                    isMulti
                    className="dashboardSelect"
                    classNamePrefix="dashboardSelect"
                    options={employerOptions}
                    value={employerOptions.filter((option) => form.employerIds.includes(option.value))}
                    onChange={(selected) => updateField("employerIds", (selected || []).map((option) => option.value))}
                    placeholder="Select employers"
                    styles={createSelectStyles(Boolean(errors.employerIds))}
                  />
                  {errors.employerIds ? <div className="dashboardInlineError">{errors.employerIds}</div> : null}
                </div>

                <div className="input-field">
                  <label className="contractUploadLabel">Payment for each candidate (EUR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={errors.companyPaymentPerApplicant ? "dashboardFieldError" : ""}
                    value={form.companyPaymentPerApplicant}
                    onChange={(event) => updateField("companyPaymentPerApplicant", event.target.value)}
                    placeholder="Enter amount"
                  />
                  {errors.companyPaymentPerApplicant ? (
                    <div className="dashboardInlineError">{errors.companyPaymentPerApplicant}</div>
                  ) : null}
                </div>
              </>
            ) : null}

            {type === "agency" ? (
              <div className="input-field dashboardEntityFullWidth">
                <label className="contractUploadLabel">Companies</label>
                <Select
                  isMulti
                  className="dashboardSelect"
                  classNamePrefix="dashboardSelect"
                  options={companies.map((company) => ({ value: company.id, label: company.name }))}
                  value={companies
                    .filter((company) => form.assignedCompanyIds.includes(company.id))
                    .map((company) => ({ value: company.id, label: company.name }))}
                  onChange={(selected) =>
                    updateField(
                      "assignedCompanyIds",
                      (selected || []).map((option) => option.value)
                    )
                  }
                  placeholder="Select companies"
                  styles={createSelectStyles(Boolean(errors.assignedCompanyIds))}
                />
                {errors.assignedCompanyIds ? (
                  <div className="dashboardInlineError">{errors.assignedCompanyIds}</div>
                ) : null}
              </div>
            ) : null}

            {type !== "company" ? (
              <div className="input-field">
                <label className="contractUploadLabel">Contact Number</label>
                <PhoneInput
                  country="in"
                  value={form.contactNumber}
                  onChange={(value) => updateField("contactNumber", value)}
                  inputClass={`dashboardPhoneInput ${errors.contactNumber ? "dashboardPhoneInputError" : ""}`}
                  buttonClass="dashboardPhoneButton"
                  containerClass="dashboardPhoneWrap"
                />
                {errors.contactNumber ? <div className="dashboardInlineError">{errors.contactNumber}</div> : null}
              </div>
            ) : null}

            {type === "agency" ? (
              <div className="input-field dashboardEntityFullWidth">
                <label className="contractUploadLabel" htmlFor={`${type}-address`}>
                  Address
                </label>
                <input
                  id={`${type}-address`}
                  type="text"
                  className={errors.address ? "dashboardFieldError" : ""}
                  value={form.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  placeholder="Enter address"
                />
                {errors.address ? <div className="dashboardInlineError">{errors.address}</div> : null}
              </div>
            ) : null}

            {type !== "company" ? (
              <div className="input-field">
                <label className="contractUploadLabel" htmlFor={`${type}-email`}>
                  Email
                </label>
                <input
                  id={`${type}-email`}
                  type="email"
                  className={errors.email ? "dashboardFieldError" : ""}
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="Enter email"
                />
                {errors.email ? <div className="dashboardInlineError">{errors.email}</div> : null}
              </div>
            ) : null}
          </div>

          {errors.form ? <div className="dashboardInlineError">{errors.form}</div> : null}

          <div className="contractActionRow">
            <button type="button" className="btn btnSecondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btnPrimary" disabled={saving} onClick={handleSubmit}>
              {saving ? "Saving..." : editData ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm ? (
        <ConfirmActionModal
          title={`Delete ${type === "agency" ? "Agency" : "Employer"}`}
          message={`Are you sure you want to delete this ${type}? This cannot be undone.`}
          confirmLabel="Delete"
          isBusy={deleting}
          onConfirm={handleDelete}
          onClose={() => setShowDeleteConfirm(false)}
        />
      ) : null}
    </>
  );
}

export default EntityFormModal;

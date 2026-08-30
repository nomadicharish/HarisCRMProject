import React from "react";
import Select from "react-select";
import {
  actions,
  btnPrimary,
  btnSecondary,
  errorText,
  getSelectStyles,
  grid,
  label
} from "./formStyles";
import { isSuperUserLikeRole } from "../../utils/auth";

function FieldIcon({ children }) {
  return (
    <span
      style={{
        position: "absolute",
        left: "14px",
        top: "50%",
        transform: "translateY(-50%)",
        color: "#98A2B3",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 1
      }}
    >
      {children}
    </span>
  );
}

function SelectShell({ children, icon }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      {icon ? <FieldIcon>{icon}</FieldIcon> : null}
      <div className="applicantFormSelectShell">{children}</div>
    </div>
  );
}

function ApplicantFormStepTwo({
  user,
  form,
  errors,
  countryOptions,
  companyOptions,
  jobPositionOptions = [],
  handleCountryChange,
  handleCompanyChange,
  handleChange,
  setStep,
  handleSubmit,
  loading,
  editData,
  autoApproveAfterSave,
  showActions = true,
  readOnly = false
}) {
  const customSelectStyles = getSelectStyles();
  const menuPortalTarget = typeof document !== "undefined" ? document.body : null;
  const globeIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
  const buildingIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 21h18M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14M9 9h.01M9 12h.01M9 15h.01M15 9h.01M15 12h.01M15 15h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
  const briefcaseIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1M4 7h16v12H4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
  return (
    <>
      <div style={grid}>
        <div>
          <label style={label}>Country</label>
          <SelectShell icon={globeIcon}>
            <Select
              styles={customSelectStyles}
              options={countryOptions}
              placeholder="Search country..."
              value={countryOptions.find((country) => country.value === form.countryId)}
              onChange={(selected) => handleCountryChange(selected?.value || "")}
              menuPortalTarget={menuPortalTarget}
              menuPosition="fixed"
              isDisabled={readOnly}
            />
          </SelectShell>
          {errors.countryId && <div style={errorText}>{errors.countryId}</div>}
        </div>

        <div>
          <label style={label}>Company</label>
          <SelectShell icon={buildingIcon}>
            <Select
              styles={customSelectStyles}
              options={companyOptions}
              placeholder={form.countryId ? "Search company..." : "Select country first"}
              isDisabled={readOnly || !form.countryId}
              value={companyOptions.find((company) => company.value === form.companyId)}
              onChange={(selected) => handleCompanyChange(selected?.value || "")}
              menuPortalTarget={menuPortalTarget}
              menuPosition="fixed"
            />
          </SelectShell>
          {errors.companyId && <div style={errorText}>{errors.companyId}</div>}
        </div>

        <div>
          <label style={label}>Job Position</label>
          <SelectShell icon={briefcaseIcon}>
            <Select
              styles={customSelectStyles}
              options={jobPositionOptions}
              placeholder={form.companyId ? "Select job position..." : "Select company first"}
              isDisabled={readOnly || !form.companyId}
              value={jobPositionOptions.find((position) => position.value === form.jobPositionId)}
              onChange={(selected) => handleChange("jobPositionId", selected?.value || "")}
              menuPortalTarget={menuPortalTarget}
              menuPosition="fixed"
            />
          </SelectShell>
          {errors.jobPositionId && <div style={errorText}>{errors.jobPositionId}</div>}
        </div>

      </div>

      {showActions ? (
        <div style={actions}>
          <button style={btnSecondary} onClick={() => setStep(1)}>
            {"<- Back"}
          </button>
          <button
            style={{
              ...btnPrimary,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer"
            }}
            disabled={loading}
            onClick={handleSubmit}
          >
            {loading
              ? editData
                ? "Updating..."
                : "Creating..."
              : editData
              ? isSuperUserLikeRole(user?.role) && autoApproveAfterSave
                ? "Approve Profile"
                : "Update Profile"
              : "Create Profile"}
          </button>
        </div>
      ) : null}
    </>
  );
}

export default ApplicantFormStepTwo;

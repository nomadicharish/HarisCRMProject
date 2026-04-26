import React from "react";
import Select from "react-select";
import {
  THEME,
  actions,
  btnPrimary,
  btnSecondary,
  errorText,
  getSelectStyles,
  grid,
  handleBlur,
  handleFocus,
  input,
  label
} from "./formStyles";

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

function InputShell({ children, icon, muted = false }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      {icon ? <FieldIcon>{icon}</FieldIcon> : null}
      <div className={muted ? "applicantFormFieldShell applicantFormFieldShellMuted" : "applicantFormFieldShell"}>{children}</div>
    </div>
  );
}

function ApplicantFormStepTwo({
  user,
  form,
  errors,
  countryOptions,
  companyOptions,
  agencyOptions,
  handleCountryChange,
  handleCompanyChange,
  handleChange,
  setStep,
  handleSubmit,
  loading,
  editData,
  autoApproveAfterSave,
  showActions = true,
  totalInrNeeded = "0"
}) {
  const customSelectStyles = getSelectStyles();
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
  const euroIcon = <span style={{ fontSize: 16, fontWeight: 700 }}>EUR</span>;
  const inrIcon = <span style={{ fontSize: 18, fontWeight: 700 }}>&#8377;</span>;

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
              isDisabled={!form.countryId}
              value={companyOptions.find((company) => company.value === form.companyId)}
              onChange={(selected) => handleCompanyChange(selected?.value || "")}
            />
          </SelectShell>
          {errors.companyId && <div style={errorText}>{errors.companyId}</div>}
        </div>

        {user?.role === "SUPER_USER" && (
          <div>
            <label style={label}>Agency</label>
            <SelectShell icon={buildingIcon}>
              <Select
                styles={customSelectStyles}
                options={agencyOptions}
                placeholder="Search agency..."
                value={agencyOptions.find((agency) => agency.value === form.agencyId)}
                onChange={(selected) => handleChange("agencyId", selected?.value || "")}
              />
            </SelectShell>
            {errors.agencyId && <div style={errorText}>{errors.agencyId}</div>}
          </div>
        )}

        {user?.role === "SUPER_USER" && (
          <div>
            <label style={label}>Total Amount (EUR)</label>
            <InputShell icon={euroIcon}>
              <input
                style={{ ...input, paddingLeft: "54px", border: errors.totalAmount ? `1px solid ${THEME.error}` : input.border }}
                value={form.totalAmount || ""}
                onFocus={handleFocus}
                placeholder="Total Amount"
                onBlur={(event) => handleBlur(event, errors.totalAmount)}
                onChange={(event) => handleChange("totalAmount", event.target.value)}
              />
            </InputShell>
            {errors.totalAmount && <div style={errorText}>{errors.totalAmount}</div>}
          </div>
        )}

        <div>
          <label style={label}>Initial Paid Amount (INR)</label>
          <InputShell icon={inrIcon}>
            <input
              style={{ ...input, paddingLeft: "44px", border: errors.paidAmount ? `1px solid ${THEME.error}` : input.border }}
              value={form.paidAmount || ""}
              onFocus={handleFocus}
              placeholder="Initial Paid Amount"
              onBlur={(event) => handleBlur(event, errors.paidAmount)}
              onChange={(event) => handleChange("paidAmount", event.target.value)}
            />
          </InputShell>
          {errors.paidAmount && <div style={errorText}>{errors.paidAmount}</div>}
        </div>

        <div> 
          <label style={label}>Total Amount to Pay (INR)</label>
          <InputShell icon={inrIcon} muted>
            <input
              style={{ ...input, paddingLeft: "44px", background: "#f8fafc", color: "#374151", fontWeight: 600 }}
              value={totalInrNeeded || "0"}
              readOnly
              tabIndex={-1}
            />
          </InputShell>
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
              ? user?.role === "SUPER_USER" && autoApproveAfterSave
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


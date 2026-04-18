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
  autoApproveAfterSave
}) {
  const customSelectStyles = getSelectStyles();

  return (
    <>
      <div style={grid}>
        <div>
          <label style={label}>Country</label>
          <Select
            styles={customSelectStyles}
            options={countryOptions}
            placeholder="Search country..."
            value={countryOptions.find((country) => country.value === form.countryId)}
            onChange={(selected) => handleCountryChange(selected.value)}
          />
          {errors.countryId && <div style={errorText}>{errors.countryId}</div>}
        </div>

        <div>
          <label style={label}>Company</label>
          <Select
            styles={customSelectStyles}
            options={companyOptions}
            placeholder={form.countryId ? "Search company..." : "Select country first"}
            isDisabled={!form.countryId}
            value={companyOptions.find((company) => company.value === form.companyId)}
            onChange={(selected) => handleCompanyChange(selected.value)}
          />
          {errors.companyId && <div style={errorText}>{errors.companyId}</div>}
        </div>

        {user?.role === "SUPER_USER" && (
          <div>
            <label style={label}>Agency</label>
            <Select
              styles={customSelectStyles}
              options={agencyOptions}
              placeholder="Search agency..."
              value={agencyOptions.find((agency) => agency.value === form.agencyId)}
              onChange={(selected) => handleChange("agencyId", selected.value)}
            />
            {errors.agencyId && <div style={errorText}>{errors.agencyId}</div>}
          </div>
        )}

        {user?.role === "SUPER_USER" && (
          <div>
            <label style={label}>Total Amount in Euro</label>
            <input
              style={{ ...input, border: errors.totalAmount ? `1px solid ${THEME.error}` : input.border }}
              value={form.totalAmount || ""}
              onFocus={handleFocus}
              placeholder="Total Amount"
              onBlur={(event) => handleBlur(event, errors.totalAmount)}
              onChange={(event) => handleChange("totalAmount", event.target.value)}
            />
            {errors.totalAmount && <div style={errorText}>{errors.totalAmount}</div>}
          </div>
        )}

        <div>
          <label style={label}>Initial Paid Amount</label>
          <input
            style={{ ...input, border: errors.paidAmount ? `1px solid ${THEME.error}` : input.border }}
            value={form.paidAmount || ""}
            onFocus={handleFocus}
            placeholder="Initial Paid Amount"
            onBlur={(event) => handleBlur(event, errors.paidAmount)}
            onChange={(event) => handleChange("paidAmount", event.target.value)}
          />
          {errors.paidAmount && <div style={errorText}>{errors.paidAmount}</div>}
        </div>
      </div>

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
    </>
  );
}

export default ApplicantFormStepTwo;

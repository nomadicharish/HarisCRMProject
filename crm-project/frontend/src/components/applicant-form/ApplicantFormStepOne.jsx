import React from "react";
import DatePicker from "react-datepicker";
import PhoneInput from "react-phone-input-2";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import {
  THEME,
  actionsRight,
  btnPrimary,
  errorText,
  grid,
  handleBlur,
  handleFocus,
  input,
  label
} from "./formStyles";

const CustomDateInput = React.forwardRef(({ value, onClick, placeholder, error }, ref) => (
  <div style={{ position: "relative", width: "100%" }}>
    <input
      ref={ref}
      value={value || ""}
      onClick={onClick}
      placeholder={placeholder}
      readOnly
      style={{
        ...input,
        width: "100%",
        paddingRight: "40px",
        border: error ? "1px solid red" : "1px solid #ddd",
        cursor: "pointer"
      }}
    />
    <span
      onClick={onClick}
      style={{
        position: "absolute",
        right: "12px",
        top: "50%",
        transform: "translateY(-50%)",
        pointerEvents: "none",
        fontSize: "16px",
        color: "#666"
      }}
    >
      cal
    </span>
  </div>
));

CustomDateInput.displayName = "CustomDateInput";
const PHONE_COUNTRY_CODES = new Set(getCountries().map((code) => code.toUpperCase()));

function ApplicantFormStepOne({
  form,
  errors,
  dob,
  setDob,
  setForm,
  handleChange,
  calculateAge,
  onNext
}) {
  return (
    <>
      <div style={grid}>
        <div>
          <label style={label}>First name as in passport</label>
          <input
            style={{ ...input, border: errors.firstName ? `1px solid ${THEME.error}` : input.border }}
            value={form.firstName || ""}
            onFocus={handleFocus}
            onBlur={(event) => handleBlur(event, errors.firstName)}
            onChange={(event) => handleChange("firstName", event.target.value)}
            placeholder="First Name"
          />
          {errors.firstName && <div style={errorText}>{errors.firstName}</div>}
        </div>

        <div>
          <label style={label}>Surname as in passport</label>
          <input
            style={{ ...input, border: errors.lastName ? `1px solid ${THEME.error}` : input.border }}
            onFocus={handleFocus}
            onBlur={(event) => handleBlur(event, errors.lastName)}
            onChange={(event) => handleChange("lastName", event.target.value)}
            placeholder="Surname"
            value={form.lastName || ""}
          />
          {errors.lastName && <div style={errorText}>{errors.lastName}</div>}
        </div>

        <div>
          <label style={label}>Date of Birth</label>
          <DatePicker
            selected={dob}
            onChange={(date) => {
              setDob(date);
              handleChange("dob", date);
              handleChange("age", calculateAge(date));
            }}
            dateFormat="dd/MM/yyyy"
            maxDate={new Date()}
            showMonthDropdown
            showYearDropdown
            dropdownMode="select"
            customInput={<CustomDateInput placeholder="Select DOB" error={errors.dob} />}
          />
          {errors.dob && <div style={errorText}>{errors.dob}</div>}
        </div>

        <div>
          <label style={label}>Age</label>
          <input
            style={{ ...input, border: errors.age ? `1px solid ${THEME.error}` : input.border }}
            value={form.age || ""}
            onFocus={handleFocus}
            placeholder="Age"
            onBlur={(event) => handleBlur(event, errors.age)}
            onChange={(event) => handleChange("age", event.target.value)}
            readOnly
          />
          {errors.age && <div style={errorText}>{errors.age}</div>}
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <label style={label}>Address as in passport</label>
          <input
            style={{ ...input, border: errors.address ? `1px solid ${THEME.error}` : input.border }}
            value={form.address || ""}
            onFocus={handleFocus}
            onBlur={(event) => handleBlur(event, errors.address)}
            onChange={(event) => handleChange("address", event.target.value)}
            placeholder="Address"
          />
          {errors.address && <div style={errorText}>{errors.address}</div>}
        </div>

        <div>
          <label style={label}>Phone</label>
          <div className="dashboardPhoneSplitWrap">
            <PhoneInput
              country={
                PHONE_COUNTRY_CODES.has(String(form.phoneCountry || "IN").toUpperCase())
                  ? String(form.phoneCountry).toLowerCase()
                  : "in"
              }
              value={String(getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.phoneCountry || "IN").toUpperCase()) ? String(form.phoneCountry || "IN").toUpperCase() : "IN"))}
              inputProps={{ readOnly: true }}
              countryCodeEditable={false}
              enableSearch
              disableSearchIcon
              onChange={(_, countryData) => {
                const nextCountry = String(countryData?.countryCode || "in").toUpperCase();
                setForm((prev) => ({ ...prev, phoneCountry: PHONE_COUNTRY_CODES.has(nextCountry) ? nextCountry : "IN" }));
              }}
              containerClass="dashboardPhoneCodeWrap"
              buttonClass="dashboardPhoneCodeButton"
              inputClass={`dashboardPhoneCodeValue ${errors.phone ? "dashboardPhoneInputError" : ""}`}
            />
            <input
              style={{ ...input, border: errors.phone ? `1px solid ${THEME.error}` : input.border }}
              value={form.phone || ""}
              onFocus={handleFocus}
              onBlur={(event) => handleBlur(event, errors.phone)}
              onChange={(event) => handleChange("phone", event.target.value.replace(/[^\d]/g, ""))}
              placeholder="Enter phone number"
            />
          </div>
          {errors.phone && <div style={errorText}>{errors.phone}</div>}
        </div>

        <div>
          <label style={label}>Marital Status</label>
          <select
            style={{ ...input, border: errors.maritalStatus ? `1px solid ${THEME.error}` : input.border }}
            value={form.maritalStatus || ""}
            onFocus={handleFocus}
            onBlur={(event) => handleBlur(event, errors.maritalStatus)}
            onChange={(event) => handleChange("maritalStatus", event.target.value)}
          >
            <option value="">Select Marital Status</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
          </select>
          {errors.maritalStatus && <div style={errorText}>{errors.maritalStatus}</div>}
        </div>
      </div>

      <div style={actionsRight}>
        <button style={btnPrimary} onClick={onNext}>
          {"Next ->"}
        </button>
      </div>
    </>
  );
}

export default ApplicantFormStepOne;

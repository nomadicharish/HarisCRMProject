import React from "react";
import DatePicker from "react-datepicker";
import PhoneInput from "react-phone-input-2";
import "react-datepicker/dist/react-datepicker.css";
import "react-phone-input-2/lib/style.css";
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

function FieldIcon({ children, right = false }) {
  return (
    <span
      style={{
        position: "absolute",
        [right ? "right" : "left"]: "14px",
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

function InputShell({ children, icon, trailingIcon, error = false }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%"
      }}
    >
      {icon ? <FieldIcon>{icon}</FieldIcon> : null}
      {trailingIcon ? <FieldIcon right>{trailingIcon}</FieldIcon> : null}
      <div className={error ? "applicantFormFieldShell applicantFormFieldShellError" : "applicantFormFieldShell"}>{children}</div>
    </div>
  );
}

const CustomDateInput = React.forwardRef(({ value, onClick, placeholder, error }, ref) => (
  <InputShell
    error={error}
    icon={
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    }
  >
    <input
      ref={ref}
      value={value || ""}
      onClick={onClick}
      placeholder={placeholder}
      readOnly
      style={{
        ...input,
        width: "100%",
        paddingLeft: "44px",
        border: error ? "1px solid red" : input.border,
        cursor: "pointer"
      }}
    />
  </InputShell>
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
  onNext,
  showActions = true,
  readOnly = false
}) {
  const resolvedPhoneCountry = PHONE_COUNTRY_CODES.has(String(form.phoneCountry || "IN").toUpperCase())
    ? String(form.phoneCountry || "IN").toUpperCase()
    : "IN";
  const resolvedWhatsappCountry = PHONE_COUNTRY_CODES.has(String(form.whatsappCountry || "IN").toUpperCase())
    ? String(form.whatsappCountry || "IN").toUpperCase()
    : "IN";
  const personIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
  const locationIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
  const ageIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 10.5h3M7.5 13.5h2M14.5 10.2l2.8 3.6M17.3 10.2l-2.8 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
  const phoneIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.78 19.78 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.78 19.78 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.64 2.62a2 2 0 0 1-.45 2.11L8.03 9.97a16 16 0 0 0 6 6l1.52-1.27a2 2 0 0 1 2.11-.45c.84.31 1.72.52 2.62.64A2 2 0 0 1 22 16.92Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const whatsappIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.15 1.6 5.96L0 24l6.31-1.65a11.85 11.85 0 0 0 5.75 1.47h.01c6.56 0 11.89-5.33 11.89-11.9 0-3.18-1.24-6.17-3.44-8.44Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M16.93 14.96c-.22.62-1.1 1.13-1.81 1.21-.48.05-1.09.08-3.16-.78-2.64-1.1-4.34-3.79-4.47-3.96-.13-.17-1.07-1.43-1.07-2.73s.68-1.94.92-2.2c.24-.26.53-.33.7-.33h.5c.16 0 .38-.06.59.46.22.52.74 1.79.8 1.92.07.13.11.29.02.46-.09.17-.13.28-.26.42-.13.15-.27.33-.38.44-.13.13-.27.27-.12.53.15.26.67 1.1 1.43 1.78.99.88 1.83 1.15 2.09 1.28.26.13.41.11.56-.07.15-.17.66-.77.84-1.03.17-.26.35-.22.59-.13.24.09 1.53.72 1.79.85.26.13.44.2.5.31.07.11.07.64-.15 1.26Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const emailIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const passportIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M9 7h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 11h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
  const educationIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3 2 8l10 5 10-5-10-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 10.5V16c0 1.2 2.7 3 6 3s6-1.8 6-3v-5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );

  return (
    <>
      <div style={grid}>
        <div className="applicantFormTwoRow">
          <div>
            <label style={label}>First name as in passport</label>
            <InputShell icon={personIcon} error={Boolean(errors.firstName)}>
              <input
                style={{ ...input, paddingLeft: "44px", border: errors.firstName ? `1px solid ${THEME.error}` : input.border }}
                value={form.firstName || ""}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.firstName)}
                onChange={(event) => handleChange("firstName", event.target.value)}
                placeholder="First Name"
                disabled={readOnly}
              />
            </InputShell>
            {errors.firstName && <div style={errorText}>{errors.firstName}</div>}
          </div>

          <div>
            <label style={label}>Surname as in passport</label>
            <InputShell icon={personIcon} error={Boolean(errors.lastName)}>
              <input
                style={{ ...input, paddingLeft: "44px", border: errors.lastName ? `1px solid ${THEME.error}` : input.border }}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.lastName)}
                onChange={(event) => handleChange("lastName", event.target.value)}
                placeholder="Surname"
                value={form.lastName || ""}
                disabled={readOnly}
              />
            </InputShell>
            {errors.lastName && <div style={errorText}>{errors.lastName}</div>}
          </div>
        </div>

        <div className="applicantFormThreeRow">
          <div>
            <label style={label}>Email</label>
            <InputShell icon={emailIcon} error={Boolean(errors.email)}>
              <input
                type="email"
                style={{ ...input, paddingLeft: "44px", border: errors.email ? `1px solid ${THEME.error}` : input.border }}
                value={form.email || ""}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.email)}
                onChange={(event) => handleChange("email", event.target.value)}
                placeholder="Enter email address"
                disabled={readOnly}
              />
            </InputShell>
            {errors.email && <div style={errorText}>{errors.email}</div>}
          </div>

          <div>
            <label style={label}>Passport Number</label>
            <InputShell icon={passportIcon} error={Boolean(errors.passportNumber)}>
              <input
                style={{ ...input, paddingLeft: "44px", border: errors.passportNumber ? `1px solid ${THEME.error}` : input.border }}
                value={form.passportNumber || ""}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.passportNumber)}
                onChange={(event) => handleChange("passportNumber", event.target.value)}
                placeholder="Enter passport number"
                disabled={readOnly}
              />
            </InputShell>
            {errors.passportNumber && <div style={errorText}>{errors.passportNumber}</div>}
          </div>

          <div>
            <label style={label}>Place of Birth</label>
            <InputShell icon={locationIcon} error={Boolean(errors.placeOfBirth)}>
              <input
                style={{ ...input, paddingLeft: "44px", border: errors.placeOfBirth ? `1px solid ${THEME.error}` : input.border }}
                value={form.placeOfBirth || ""}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.placeOfBirth)}
                onChange={(event) => handleChange("placeOfBirth", event.target.value)}
                placeholder="Enter place of birth"
                disabled={readOnly}
              />
            </InputShell>
            {errors.placeOfBirth && <div style={errorText}>{errors.placeOfBirth}</div>}
          </div>
        </div>

        <div className="applicantFormThreeRow">
          <div>
            <label style={label}>Date of Birth</label>
            <DatePicker
              selected={dob}
              disabled={readOnly}
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
            <InputShell icon={ageIcon} error={Boolean(errors.age)}>
              <input
                style={{ ...input, paddingLeft: "44px", border: errors.age ? `1px solid ${THEME.error}` : input.border }}
                value={form.age || ""}
                onFocus={handleFocus}
                placeholder="Age"
                onBlur={(event) => handleBlur(event, errors.age)}
                onChange={(event) => handleChange("age", event.target.value)}
                readOnly
                disabled={readOnly}
              />
            </InputShell>
            {errors.age && <div style={errorText}>{errors.age}</div>}
          </div>

          <div>
            <label style={label}>Education</label>
            <InputShell
              icon={educationIcon}
              error={Boolean(errors.education)}
              trailingIcon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            >
              <select
                style={{
                  ...input,
                  paddingLeft: "44px",
                  paddingRight: "44px",
                  border: errors.education ? `1px solid ${THEME.error}` : input.border,
                  appearance: "none"
                }}
                value={form.education || ""}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.education)}
                onChange={(event) => handleChange("education", event.target.value)}
                disabled={readOnly}
              >
                <option value="">Select Education</option>
                <option value="High School Diploma">High School Diploma</option>
                <option value="Vocational / Technical Certificate">Vocational / Technical Certificate</option>
                <option value="Diploma">Diploma</option>
                <option value="Bachelor's Degree">Bachelor's Degree</option>
                <option value="Master's Degree">Master's Degree</option>
                <option value="Professional Degree">Professional Degree</option>
                <option value="Doctorate (Ph.D.)">Doctorate (Ph.D.)</option>
                <option value="No Formal Education">No Formal Education</option>
                <option value="Others">Others</option>
              </select>
            </InputShell>
            {errors.education && <div style={errorText}>{errors.education}</div>}
          </div>
        </div>

        {form.education === "Others" ? (
          <div>
            <label style={label}>Enter education</label>
            <InputShell icon={educationIcon} error={Boolean(errors.customEducation)}>
              <input
                style={{
                  ...input,
                  paddingLeft: "44px",
                  border: errors.customEducation ? `1px solid ${THEME.error}` : input.border
                }}
                value={form.customEducation || ""}
                onFocus={handleFocus}
                onBlur={(event) => handleBlur(event, errors.customEducation)}
                onChange={(event) => handleChange("customEducation", event.target.value)}
                placeholder="Enter education"
                disabled={readOnly}
              />
            </InputShell>
            {errors.customEducation && <div style={errorText}>{errors.customEducation}</div>}
          </div>
        ) : null}

        <div className="applicantFormAddressEnrollmentRow">
          <div>
          <label style={label}>Address as in passport</label>
          <InputShell icon={locationIcon} error={Boolean(errors.address)}>
            <input
              style={{ ...input, paddingLeft: "44px", border: errors.address ? `1px solid ${THEME.error}` : input.border }}
              value={form.address || ""}
              onFocus={handleFocus}
              onBlur={(event) => handleBlur(event, errors.address)}
              onChange={(event) => handleChange("address", event.target.value)}
              placeholder="Address"
              disabled={readOnly}
            />
          </InputShell>
          {errors.address && <div style={errorText}>{errors.address}</div>}
          </div>
          <div>
            <label style={{ ...label, display: "flex", alignItems: "center", gap: "6px" }}>
              Enrollment Date
              <button
                type="button"
                title="Date on which the Applicant has been selected."
                aria-label="Enrollment Date information"
                onClick={() => window.alert("Date on which the Applicant has been selected.")}
                style={{ minHeight: "19px", height: "19px", border: 0, background: "transparent", color: "#667085", padding: 0, cursor: "pointer", fontSize: "15px", lineHeight: 1 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 10.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="7.5" r="1" fill="currentColor" /></svg>
              </button>
            </label>
            <DatePicker
              selected={form.enrollmentDate instanceof Date ? form.enrollmentDate : form.enrollmentDate ? new Date(form.enrollmentDate) : null}
              disabled={readOnly}
              onChange={(date) => handleChange("enrollmentDate", date)}
              dateFormat="dd/MM/yyyy"
              maxDate={new Date()}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              customInput={<CustomDateInput placeholder="Select enrollment date" />}
            />
          </div>
        </div>

        <div className="applicantFormContactRow">
          <div>
            <label style={label}>Contact number</label>
            <div className="dashboardPhoneSplitWrap applicantFormPhoneSplitWrap">
              <PhoneInput
                country={resolvedPhoneCountry.toLowerCase()}
                value={String(getCountryCallingCode(resolvedPhoneCountry))}
                inputProps={{ readOnly: true }}
                countryCodeEditable={false}
                enableSearch
                disableSearchIcon
                disabled={readOnly}
                onChange={(_, countryData) => {
                  const nextCountry = String(countryData?.countryCode || "in").toUpperCase();
                  setForm((prev) => {
                    const normalizedCountry = PHONE_COUNTRY_CODES.has(nextCountry) ? nextCountry : "IN";
                    return {
                      ...prev,
                      phoneCountry: normalizedCountry,
                      ...(prev.isWhatsappSameAsPhone
                        ? { whatsappCountry: normalizedCountry, whatsappNumber: String(prev.phone || "") }
                        : {})
                    };
                  });
                }}
                containerClass="dashboardPhoneCodeWrap"
                buttonClass="dashboardPhoneCodeButton"
                inputClass={`dashboardPhoneCodeValue ${errors.phone ? "dashboardPhoneInputError" : ""}`}
              />
              <InputShell trailingIcon={phoneIcon} error={Boolean(errors.phone)}>
                <input
                  style={{ ...input, paddingRight: "44px", border: errors.phone ? `1px solid ${THEME.error}` : input.border }}
                  value={form.phone || ""}
                  onFocus={handleFocus}
                  onBlur={(event) => handleBlur(event, errors.phone)}
                  onChange={(event) => handleChange("phone", event.target.value.replace(/[^\d]/g, ""))}
                  maxLength={resolvedPhoneCountry === "IN" ? 10 : undefined}
                  placeholder="Enter phone number"
                  disabled={readOnly}
                />
              </InputShell>
            </div>
            {errors.phone && <div style={errorText}>{errors.phone}</div>}
          </div>

          <div>
            <label style={label}>WhatsApp Number</label>
            <div className="dashboardPhoneSplitWrap applicantFormPhoneSplitWrap">
              <PhoneInput
                country={resolvedWhatsappCountry.toLowerCase()}
                value={String(getCountryCallingCode(resolvedWhatsappCountry))}
                inputProps={{ readOnly: true }}
                countryCodeEditable={false}
                enableSearch
                disableSearchIcon
                disabled={readOnly}
                onChange={(_, countryData) => {
                  const nextCountry = String(countryData?.countryCode || "in").toUpperCase();
                  setForm((prev) => ({
                    ...prev,
                    whatsappCountry: PHONE_COUNTRY_CODES.has(nextCountry) ? nextCountry : "IN"
                  }));
                }}
                containerClass="dashboardPhoneCodeWrap"
                buttonClass="dashboardPhoneCodeButton"
                inputClass={`dashboardPhoneCodeValue ${errors.whatsappNumber ? "dashboardPhoneInputError" : ""}`}
              />
              <InputShell trailingIcon={whatsappIcon} error={Boolean(errors.whatsappNumber)}>
                <input
                  style={{ ...input, paddingRight: "44px", border: errors.whatsappNumber ? `1px solid ${THEME.error}` : input.border }}
                  value={form.whatsappNumber || ""}
                  onFocus={handleFocus}
                  onBlur={(event) => handleBlur(event, errors.whatsappNumber)}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^\d]/g, "");
                    handleChange("whatsappNumber", next);
                    if (next !== (form.phone || "")) {
                      handleChange("isWhatsappSameAsPhone", false);
                    }
                  }}
                  maxLength={resolvedWhatsappCountry === "IN" ? 10 : undefined}
                  placeholder="Enter WhatsApp number"
                  disabled={readOnly}
                />
              </InputShell>
            </div>
            {errors.whatsappNumber && <div style={errorText}>{errors.whatsappNumber}</div>}
            <label className="dashboardMiniCheckbox" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={Boolean(form.isWhatsappSameAsPhone)}
                disabled={readOnly}
                onChange={(event) => {
                  const checked = Boolean(event.target.checked);
                  handleChange("isWhatsappSameAsPhone", checked);
                  if (checked) {
                    handleChange("whatsappCountry", resolvedPhoneCountry);
                    handleChange("whatsappNumber", form.phone || "");
                  } else {
                    handleChange("whatsappNumber", "");
                  }
                }}
              />
              Same as contact number
            </label>
          </div>
        </div>

      </div>

      {showActions ? (
        <div style={actionsRight}>
          <button style={btnPrimary} onClick={onNext}>
            {"Next ->"}
          </button>
        </div>
      ) : null}
    </>
  );
}

export default ApplicantFormStepOne;

import React, { useEffect, useState } from "react";
import API from "../../services/api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Select from "react-select";
import { useNavigate } from "react-router-dom";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const THEME = {
  primary: "#0052CC",
  border: "#DFE1E6",
  error: "red"
};

const handleFocus = (event) => {
  event.target.style.border = `1px solid ${THEME.primary}`;
};

const handleBlur = (event, hasError) => {
  event.target.style.border = hasError
    ? `1px solid ${THEME.error}`
    : `1px solid ${THEME.border}`;
};

const toDisplayValue = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return "";
};

const getApplicantTotalAmount = (editData) =>
  toDisplayValue(
    editData?.payment?.total,
    editData?.paymentsSummary?.applicant?.total,
    editData?.totalApplicantPayment,
    editData?.totalAmount,
    editData?.totalPayment
  );

const getApplicantPaidAmount = (editData) =>
  toDisplayValue(
    editData?.payment?.paid,
    editData?.paymentsSummary?.applicant?.paid,
    editData?.paidAmount,
    editData?.amountPaid,
    editData?.initialPaidAmount,
    editData?.payment?.paidAmount,
    editData?.payment?.amountPaid
  );

const calculateAge = (date) => {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }

  return age;
};

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
      📅
    </span>
  </div>
));

CustomDateInput.displayName = "CustomDateInput";

function ApplicantFormModal({
  onClose,
  onSaved,
  editData,
  onApproveStage,
  autoApproveAfterSave = false
}) {
  const [companies, setCompanies] = useState([]);
  const [countries, setCountries] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [user, setUser] = useState(null);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [dob, setDob] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    age: "",
    address: "",
    phone: "",
    phoneCountry: "in",
    maritalStatus: "",
    companyId: "",
    countryId: "",
    agencyId: "",
    totalAmount: "",
    paidAmount: ""
  });

  const navigate = useNavigate();

  const validateAge = () => {
    if (!form.age) return "Age is required";

    const age = Number(form.age);
    if (Number.isNaN(age)) return "Age must be a valid number";
    if (age < 16) return "Age must be at least 16 years old";
    if (age > 120) return "Please enter a valid age";
    return null;
  };

  const validatePhone = () => {
    if (!form.phone) return "Phone number is required";

    try {
      const phoneNumber = parsePhoneNumberFromString(`+${form.phone}`);
      if (!phoneNumber || !phoneNumber.isValid()) {
        return `Invalid phone number for ${form.phoneCountry.toUpperCase()}`;
      }

      return null;
    } catch {
      return "Invalid phone number";
    }
  };

  const validateTotalAmount = () => {
    if (user?.role !== "SUPER_USER") return null;
    if (!form.totalAmount) return "Total amount is required";

    const totalAmount = Number(form.totalAmount);
    if (Number.isNaN(totalAmount)) return "Total amount must be a valid number";
    if (totalAmount <= 0) return "Total amount must be greater than 0";
    if (totalAmount > 999999) return "Total amount exceeds maximum limit";
    return null;
  };

  const validatePaidAmount = () => {
    if (!form.paidAmount) return "Initial paid amount is required";

    const paidAmount = Number(form.paidAmount);
    if (Number.isNaN(paidAmount)) return "Paid amount must be a valid number";
    if (paidAmount < 0) return "Paid amount cannot be negative";
    if (paidAmount > 999999) return "Paid amount exceeds maximum limit";

    if (form.totalAmount) {
      const totalAmount = Number(form.totalAmount);
      if (!Number.isNaN(totalAmount) && paidAmount > totalAmount) {
        return "Paid amount cannot exceed total amount";
      }
    }

    return null;
  };

  const validateStep1 = () => {
    const newErrors = {};

    if (!form.firstName) newErrors.firstName = "First name is required";
    if (!form.lastName) newErrors.lastName = "Surname is required";
    if (!form.dob) newErrors.dob = "Date of birth is required";
    if (!form.address) newErrors.address = "Address is required";
    if (!form.maritalStatus) newErrors.maritalStatus = "Select marital status";

    const ageError = validateAge();
    if (ageError) newErrors.age = ageError;

    const phoneError = validatePhone();
    if (phoneError) newErrors.phone = phoneError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};

    if (!form.countryId) newErrors.countryId = "Select country";
    if (!form.companyId) newErrors.companyId = "Select company";
    if (user?.role === "SUPER_USER" && !form.agencyId) newErrors.agencyId = "Select agency";

    const totalAmountError = validateTotalAmount();
    if (totalAmountError) newErrors.totalAmount = totalAmountError;

    const paidAmountError = validatePaidAmount();
    if (paidAmountError) newErrors.paidAmount = paidAmountError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setForm({
      firstName: "",
      lastName: "",
      dob: "",
      age: "",
      address: "",
      phone: "",
      phoneCountry: "in",
      maritalStatus: "",
      companyId: "",
      countryId: "",
      agencyId: "",
      totalAmount: "",
      paidAmount: ""
    });
    setErrors({});
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCountryChange = (value) => {
    setForm((prev) => ({
      ...prev,
      countryId: value,
      companyId: ""
    }));

    const filtered = companies.filter((company) => company.countryId === value);
    setFilteredCompanies(filtered);
  };

  const handleCompanyChange = (value) => {
    const selectedCompany = companies.find((company) => company.id === value);

    setForm((prev) => ({
      ...prev,
      companyId: value,
      totalAmount:
        user?.role === "SUPER_USER" && selectedCompany
          ? selectedCompany.companyPaymentPerApplicant ?? ""
          : prev.totalAmount
    }));
  };

  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [companyRes, countryRes, agencyRes] = await Promise.all([
          API.get("/companies"),
          API.get("/countries"),
          API.get("/agencies")
        ]);

        setCompanies(companyRes.data || []);
        setCountries(countryRes.data || []);
        setAgencies(agencyRes.data || []);
      } catch (err) {
        console.error(err);
      }
    }

    async function loadUser() {
      try {
        const res = await API.get("/auth/me");
        setUser(res.data);
      } catch (err) {
        console.error(err);
      }
    }

    loadDropdowns();
    loadUser();
  }, []);

  useEffect(() => {
    if (!editData) {
      resetForm();
      setDob(null);
      setStep(1);
      return;
    }

    const nameParts =
      editData.fullName?.trim()?.split(" ") ||
      `${editData.firstName || ""} ${editData.lastName || ""}`.trim().split(" ");
    const parsedDob =
      editData.dob || editData.personalDetails?.dob
        ? (() => {
            const raw = editData.dob || editData.personalDetails?.dob;
            return raw && raw.toDate ? raw.toDate() : new Date(raw);
          })()
        : null;
    const resolvedCountryId = editData.countryId || "";
    const resolvedCompanyId = editData.companyId || "";
    const selectedCompany = companies.find((company) => company.id === resolvedCompanyId);
    const resolvedTotalAmount = getApplicantTotalAmount(editData);
    const hasResolvedTotalAmount =
      resolvedTotalAmount !== null &&
      resolvedTotalAmount !== undefined &&
      String(resolvedTotalAmount).trim() !== "" &&
      Number(resolvedTotalAmount) > 0;

    setForm({
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      dob: parsedDob || "",
      age: parsedDob ? calculateAge(parsedDob) : editData.age || editData.personalDetails?.age || "",
      address: editData.address || editData.personalDetails?.address || "",
      phone: editData.personalDetails?.phone || editData.phone || "",
      phoneCountry: "in",
      maritalStatus: editData.maritalStatus || editData.personalDetails?.maritalStatus || "",
      countryId: resolvedCountryId,
      companyId: resolvedCompanyId,
      agencyId: editData.agencyId || "",
      totalAmount:
        hasResolvedTotalAmount
          ? resolvedTotalAmount
          : user?.role === "SUPER_USER"
          ? selectedCompany?.companyPaymentPerApplicant ?? ""
          : "",
      paidAmount: getApplicantPaidAmount(editData)
    });

    setDob(parsedDob);
    setStep(1);

    if (resolvedCountryId) {
      const filtered = companies.filter((company) => company.countryId === resolvedCountryId);
      setFilteredCompanies(filtered);
    }
  }, [editData, companies, user?.role]);

  const handleSubmit = async () => {
    if (!validateStep2()) {
      return;
    }

    try {
      setLoading(true);

      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        personalDetails: {
          firstName: form.firstName,
          lastName: form.lastName,
          dob: form.dob,
          age: form.age,
          phone: form.phone,
          maritalStatus: form.maritalStatus,
          address: form.address
        },
        companyId: form.companyId,
        countryId: form.countryId,
        agencyId: user?.role === "SUPER_USER" ? form.agencyId : user?.agencyId,
        totalApplicantPayment: form.totalAmount,
        totalAmount: form.totalAmount ? Number(form.totalAmount) : 0,
        amountPaid: form.paidAmount ? Number(form.paidAmount) : 0,
        paidAmount: form.paidAmount ? Number(form.paidAmount) : 0
      };

      if (editData) {
        await API.patch(`/applicants/${editData.id}`, payload);
      } else {
        await API.post("/applicants/create", payload);
      }

      if (!editData) {
        resetForm();
      }

      const shouldAutoApprove =
        autoApproveAfterSave && typeof onApproveStage === "function" && Boolean(editData);

      if (shouldAutoApprove) {
        try {
          await onApproveStage();
        } catch (approveError) {
          console.error(approveError);
          return;
        }
      }

      if (typeof onSaved === "function") {
        await onSaved();
      }

      if (typeof onClose === "function") onClose();

      if (typeof onSaved !== "function") {
        setTimeout(() => {
          navigate("/applicants");
        }, 1200);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      padding: "2px",
      borderRadius: 0,
      border: `1px solid ${THEME.border}`,
      boxShadow: "none",
      minHeight: "44px",
      "&:hover": {
        border: `1px solid ${THEME.primary}`
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
    })
  };

  const countryOptions = countries.map((country) => ({
    value: country.id,
    label: country.name
  }));

  const companyOptions = filteredCompanies.map((company) => ({
    value: company.id,
    label: company.name
  }));

  const agencyOptions = agencies.map((agency) => ({
    value: agency.id,
    label: agency.name
  }));

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <h3 style={{ margin: 0 }}>{editData ? "Edit Applicant" : "Add Applicant"}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: "18px" }}>
            ✕
          </button>
        </div>

        <div style={stepText}>Step {step} of 2</div>

        {step === 1 && (
          <>
            <div style={grid}>
              <div>
                <label style={label}>First name as in passport</label>
                <input
                  style={{
                    ...input,
                    border: errors.firstName ? `1px solid ${THEME.error}` : input.border
                  }}
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
                  style={{
                    ...input,
                    border: errors.lastName ? `1px solid ${THEME.error}` : input.border
                  }}
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
                  style={{
                    ...input,
                    border: errors.age ? `1px solid ${THEME.error}` : input.border
                  }}
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
                  style={{
                    ...input,
                    border: errors.address ? `1px solid ${THEME.error}` : input.border
                  }}
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
                <PhoneInput
                  country={form.phoneCountry || "in"}
                  value={form.phone || ""}
                  placeholder="Enter phone number"
                  countryCodeEditable={false}
                  onChange={(phone, country) => {
                    setForm((prev) => ({
                      ...prev,
                      phone,
                      phoneCountry: country.countryCode
                    }));
                  }}
                  containerStyle={{ width: "100%" }}
                  inputStyle={{
                    width: "100%",
                    height: "38px",
                    paddingLeft: "60px",
                    borderRadius: 0,
                    border: errors.phone ? `1px solid ${THEME.error}` : input.border,
                    fontSize: "14px"
                  }}
                  buttonStyle={{
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderRight: "1px solid #ddd",
                    padding: "0 10px"
                  }}
                  dropdownStyle={{ zIndex: 9999 }}
                  enableSearch
                />
                {errors.phone && <div style={errorText}>{errors.phone}</div>}
              </div>

              <div>
                <label style={label}>Marital Status</label>
                <select
                  style={{
                    ...input,
                    border: errors.maritalStatus ? `1px solid ${THEME.error}` : input.border
                  }}
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
              <button
                style={btnPrimary}
                onClick={() => {
                  if (validateStep1()) setStep(2);
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
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
                    style={{
                      ...input,
                      border: errors.totalAmount ? `1px solid ${THEME.error}` : input.border
                    }}
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
                  style={{
                    ...input,
                    border: errors.paidAmount ? `1px solid ${THEME.error}` : input.border
                  }}
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
                ← Back
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
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "10px",
  zIndex: 1000
};

const modal = {
  background: "#fff",
  borderRadius: 0,
  width: "100%",
  maxWidth: "600px",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: "20px"
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  width: "100%"
};

const input = {
  width: "100%",
  padding: "6px",
  borderRadius: 0,
  border: `1px solid ${THEME.border}`,
  background: "#FAFBFC",
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none",
  transition: "border 0.2s ease"
};

const actions = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "20px"
};

const actionsRight = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "20px"
};

const btnPrimary = {
  background: "#0052CC",
  color: "#fff",
  border: "none",
  padding: "8px 12px",
  borderRadius: 0,
  cursor: "pointer",
  fontWeight: "500"
};

const btnSecondary = {
  background: "transparent",
  border: "1px solid #ccc",
  padding: "8px 12px",
  borderRadius: 0,
  cursor: "pointer",
  color: "#333"
};

const stepText = {
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "15px",
  fontFamily: "Inter, sans-serif"
};

const label = {
  fontSize: "13px",
  marginBottom: "5px",
  display: "block",
  color: "#6B778C",
  fontWeight: "500"
};

const errorText = {
  color: "red",
  fontSize: "12px",
  marginTop: "3px"
};

export default ApplicantFormModal;

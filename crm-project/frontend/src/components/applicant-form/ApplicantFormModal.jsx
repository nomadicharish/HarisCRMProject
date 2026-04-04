import React, { useState, useEffect } from "react";
import API from "../../services/api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Select from "react-select";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const THEME = {
  primary: "#2f80ed",
  border: "#ddd",
  error: "red"
};

const handleFocus = (e) => {
  e.target.style.border = `1px solid ${THEME.primary}`;
};

const handleBlur = (e, hasError) => {
  e.target.style.border = hasError
    ? `1px solid ${THEME.error}`
    : `1px solid ${THEME.border}`;
};

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

  const validateAge = () => {
    if (!form.age) {
      return "Age is required";
    }

    const age = Number(form.age);

    if (isNaN(age)) {
      return "Age must be a valid number";
    }

    if (age < 16) {
      return "Age must be at least 16 years old";
    }

    if (age > 120) {
      return "Please enter a valid age";
    }

    return null;
  };

  const validateStep1 = () => {
  const newErrors = {};

  if (!form.firstName) newErrors.firstName = "First name is required";
  if (!form.lastName) newErrors.lastName = "Surname is required";
  if (!form.dob) newErrors.dob = "Date of birth is required";
  
  const ageError = validateAge();
  if (ageError) {
    newErrors.age = ageError;
  }

  if (!form.address) newErrors.address = "Address is required";
  if (!form.maritalStatus) newErrors.maritalStatus = "Select marital status";
  
  const phoneError = validatePhone();
  if (phoneError) {
    newErrors.phone = phoneError;
  }

  setErrors(newErrors); 
  return Object.keys(newErrors).length === 0;
};

  const validatePhone = () => {
      if (!form.phone) {
        return "Phone number is required";
      }

      try {
        const phoneNumber = parsePhoneNumberFromString(
          "+" + form.phone // important
        );

        if (!phoneNumber || !phoneNumber.isValid()) {
          return `Invalid phone number for  ${form.phoneCountry.toUpperCase()}`;
        }

        return null;

      } catch {
        return "Invalid phone number";
      }
    };

  const validateTotalAmount = () => {
    if (user?.role !== "SUPER_USER") {
      return null;
    }

    if (!form.totalAmount) {
      return "Total amount is required";
    }

    const totalAmount = Number(form.totalAmount);

    if (isNaN(totalAmount)) {
      return "Total amount must be a valid number";
    }

    if (totalAmount <= 0) {
      return "Total amount must be greater than 0";
    }

    if (totalAmount > 999999) {
      return "Total amount exceeds maximum limit";
    }

    return null;
  };

  const validatePaidAmount = () => {
    if (!form.paidAmount) {
      return "Initial paid amount is required";
    }

    const paidAmount = Number(form.paidAmount);

    if (isNaN(paidAmount)) {
      return "Paid amount must be a valid number";
    }

    if (paidAmount < 0) {
      return "Paid amount cannot be negative";
    }

    if (paidAmount > 999999) {
      return "Paid amount exceeds maximum limit";
    }

    // Validate paid amount against total amount if both exist
    if (form.totalAmount) {
      const totalAmount = Number(form.totalAmount);
      if (!isNaN(totalAmount) && paidAmount > totalAmount) {
        return "Paid amount cannot exceed total amount";
      }
    }

    return null;
  };

  const validateStep2 = () => {
  const newErrors = {};

  if (!form.countryId) newErrors.countryId = "Select country";
  if (!form.companyId) newErrors.companyId = "Select company";
  if (user?.role === "SUPER_USER" && !form.agencyId)
    newErrors.agencyId = "Select agency";

  const totalAmountError = validateTotalAmount();
  if (totalAmountError) {
    newErrors.totalAmount = totalAmountError;
  }

  const paidAmountError = validatePaidAmount();
  if (paidAmountError) {
    newErrors.paidAmount = paidAmountError;
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

 
  const loadDropdowns = async () => {
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
    };

    const loadUser = async () => {
      try {
        const res = await API.get("/auth/me");
        setUser(res.data);
      } catch (err) {
        console.error(err);
      }
    };

   const handleCountryChange = (value) => {
      setForm((prev) => ({
        ...prev,
        countryId: value,
        companyId: "" // reset company
      }));

      const filtered = companies.filter(
        (c) => c.countryId === value
      );

      setFilteredCompanies(filtered);
    };

     useEffect(() => {
        loadDropdowns();
        loadUser();
      }, []); 


      useEffect(() => {
        if (editData) {
          console.log("Prefilling form...");

          const nameParts =
            editData.fullName?.trim()?.split(" ") ||
            `${editData.firstName || ""} ${editData.lastName || ""}`
              .trim()
              .split(" ");

          const parsedDob =
            editData.dob || editData.personalDetails?.dob
              ? (() => {
                  const raw = editData.dob || editData.personalDetails?.dob;
                  return raw && raw.toDate ? raw.toDate() : new Date(raw);
                })()
              : null;

          const resolvedCountryId = editData.countryId || "";
          const resolvedCompanyId = editData.companyId || "";

          setForm({
            firstName: nameParts[0] || "",
            lastName: nameParts.slice(1).join(" ") || "",
            dob: parsedDob || "",
            age: parsedDob ? calculateAge(parsedDob) : editData.age || "",
            address:
              editData.address || editData.personalDetails?.address || "",
            phone: 
              editData.personalDetails?.phone || "",
              phoneCountry: "in", // default fallback
            maritalStatus:
              editData.maritalStatus || editData.personalDetails?.maritalStatus || "",
            countryId: resolvedCountryId,
            companyId: resolvedCompanyId,
            agencyId: editData.agencyId || "",
            totalAmount:
              editData.totalAmount || editData.totalPayment || editData.totalApplicantPayment || "",
            paidAmount:
              editData.paidAmount ||
              editData.amountPaid ||
              editData.payment?.paid ||
              editData.payment?.paidAmount ||
              editData.payment?.amountPaid ||
              ""
          });

          setDob(parsedDob);
          setStep(1);

          if (resolvedCountryId) {
            const filtered = companies.filter((c) => c.countryId === resolvedCountryId);
            setFilteredCompanies(filtered);
          }
        } else {
          resetForm();
          setDob(null);
          setStep(1);
        }
      }, [editData, companies]);


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

  const resetForm = () => {
    setForm({
      firstName: "",
      lastName: "",
      dob: "",
      age: "",
      address: "",
      phone: "",
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

 const handleSubmit = async () => {
        if (!validateStep2()) {
          toast.error("Please fill all required fields");
          return;
        }

        // 🔥 Dynamic loading message
        const toastId = toast.loading(
          editData ? "Updating applicant..." : "Creating applicant..."
        );

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
            agencyId:
              user?.role === "SUPER_USER"
                ? form.agencyId
                : user?.agencyId,
            totalApplicantPayment: form.totalAmount,
            amountPaid: form.paidAmount ? Number(form.paidAmount) : 0,
            paidAmount: form.paidAmount ? Number(form.paidAmount) : 0
          };

          if (editData) {
            // 🔥 UPDATE API
            await API.patch(`/applicants/${editData.id}`, payload);
          } else {
            // 🔥 CREATE API
            await API.post("/applicants/create", payload);
          }

          // ✅ SUCCESS TOAST
          toast.update(toastId, {
            render: editData
              ? "Applicant updated successfully"
              : "Applicant created successfully",
            type: "success",
            isLoading: false,
            autoClose: 2000
          });

          // ✅ RESET FORM (ONLY FOR CREATE)
          if (!editData) {
            resetForm();
          }

          // ✅ CLOSE MODAL
          const shouldAutoApprove =
            autoApproveAfterSave && typeof onApproveStage === "function" && Boolean(editData);

          if (shouldAutoApprove) {
            try {
              await onApproveStage();
            } catch (approveError) {
              console.error(approveError);
              toast.update(toastId, {
                render: "Profile updated, but stage approval failed",
                type: "error",
                isLoading: false,
                autoClose: 3000
              });
              return;
            }
          }

          if (typeof onClose === "function") onClose();

          // ✅ REFRESH TABLE
          if (typeof onSaved === "function") {
            onSaved();
          }

          // ✅ REDIRECT fallback (if not in table context)
          if (typeof onSaved !== "function") {
            setTimeout(() => {
              navigate("/applicants");
            }, 1200);
          }

        } catch (err) {
          console.error(err);

          toast.update(toastId, {
            render:
              err?.response?.data?.message ||
              (editData
                ? "Failed to update applicant"
                : "Failed to create applicant"),
            type: "error",
            isLoading: false,
            autoClose: 3000
          });

        } finally {
          setLoading(false);
        }
      };

const calculateAge = (date) => {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();

  const monthDiff = today.getMonth() - date.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < date.getDate())
  ) {
    age--;
  }

  return age;
};

const CustomDateInput = React.forwardRef(
  ({ value, onClick, placeholder, error }, ref) => (
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

      {/* 📅 ICON */}
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
  )
);

const customSelectStyles = {
  control: (base) => ({
    ...base,
    padding: "2px",
    borderRadius: "10px",
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
    borderRadius: "10px",
    zIndex: 9999
  }),

  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#f0f6ff" : "#fff",
    color: "#333",
    cursor: "pointer"
  })
};

const countryOptions = countries.map(c => ({
  value: c.id,
  label: c.name
}));

const companyOptions = filteredCompanies.map(c => ({
  value: c.id,
  label: c.name
}));

const agencyOptions = agencies.map(a => ({
  value: a.id,
  label: a.name
}));



  return (
    <div style={overlay}>
      <div style={modal}>

        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <h3 style={{ margin: 0 }}>{editData ? "Edit Applicant" : "Add Applicant"}</h3>

          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: "18px" }}>
            ✕
          </button>
        </div>
        <div style={stepText}>Step {step} of 2</div>

        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div style={grid}>

              <div>
                <label style={label}>First name as in passport</label>
                <input
                    style={{
                      ...input,
                      border: errors.firstName
                        ? `1px solid ${THEME.error}`
                        : input.border
                    }}
                    value={form.firstName || ""}
                    onFocus={handleFocus}
                    onBlur={(e) => handleBlur(e, errors.firstName)}
                    onChange={(e) => handleChange("firstName", e.target.value)}
                    placeholder="First Name"
                  />

                {errors.firstName && (
                  <div style={errorText}>{errors.firstName}</div>
                )}
              </div>

              <div>
                <label style={label}>Surname as in passport</label>
                <input
                    style={{
                      ...input,
                      border: errors.lastName
                        ? `1px solid ${THEME.error}`
                        : input.border
                    }}
                    onFocus={handleFocus}
                    onBlur={(e) => handleBlur(e, errors.lastName)}
                    onChange={(e) => handleChange("lastName", e.target.value)}
                    placeholder="Surname"
                    value={form.lastName || ""}
                  />

                {errors.lastName && (
                  <div style={errorText}>{errors.lastName}</div>
                )}
              </div>

              <div>
                  <label style={label}>Date of Birth</label>

                  <DatePicker
                    selected={dob}
                    onChange={(date) => {
                      setDob(date);
                      handleChange("dob", date);

                      const age = calculateAge(date);
                      handleChange("age", age);
                    }}
                    dateFormat="dd/MM/yyyy"
                    maxDate={new Date()}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"

                    customInput={
                      <CustomDateInput
                        placeholder="Select DOB"
                        error={errors.dob}
                      />
                    }
                  />

                  {errors.dob && (
                    <div style={errorText}>{errors.dob}</div>
                  )}
                </div>

              <div>
                <label style={label}>Age</label>
                <input
                    style={{
                      ...input,
                      border: errors.age
                        ? `1px solid ${THEME.error}`
                        : input.border
                    }}
                    value={form.age || ""}
                    onFocus={handleFocus}
                    placeholder="Age"
                    onBlur={(e) => handleBlur(e, errors.age)}
                    onChange={(e) => handleChange("age", e.target.value)}
                    readOnly
                  />
                {errors.age && (
                  <div style={errorText}>{errors.age}</div>
                )}
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={label}>Address as in passport</label>
                <input
                    style={{
                      ...input,
                      border: errors.address
                        ? `1px solid ${THEME.error}`
                        : input.border
                    }}
                    value={form.address || ""}
                    onFocus={handleFocus}
                    onBlur={(e) => handleBlur(e, errors.address)}
                    onChange={(e) => handleChange("address", e.target.value)}
                    placeholder="Address"
                  />

                {errors.address && (
                  <div style={errorText}>{errors.address}</div>
                )}
              </div>

              <div>
                <label style={label}>Phone</label>

                <PhoneInput
                      country={form.phoneCountry || "in"}
                      value={form.phone || ""}
                      placeholder="Enter phone number"

                      onChange={(phone, country) => {
                        setForm(prev => ({
                          ...prev,
                          phone,
                          phoneCountry: country.countryCode
                        }))
                      }}

                      containerStyle={{
                        width: "100%"
                      }}

                      inputStyle={{
                        width: "100%",
                        height: "45px",
                        paddingLeft: "60px", // 🔥 KEY FIX (space for flag + code)
                        borderRadius: "8px",
                        border: errors.phone
                          ? `1px solid ${THEME.error}`
                          : input.border,
                        fontSize: "14px"
                      }}

                      buttonStyle={{
                        borderTopLeftRadius: "8px",
                        borderBottomLeftRadius: "8px",
                        borderRight: "1px solid #ddd",
                        padding: "0 10px"
                      }}

                      dropdownStyle={{
                        zIndex: 9999
                      }}

                      enableSearch={true} // 🔥 nice UX
                    />

                {errors.phone && (
                  <div style={errorText}>{errors.phone}</div>
                )}
              </div>

              <div>
                <label style={label}>Marital Status</label>
                <select
                    style={{
                      ...input,
                      border: errors.maritalStatus
                        ? `1px solid ${THEME.error}`
                        : input.border
                    }}
                    value={form.maritalStatus || ""}
                    onFocus={handleFocus}
                    onBlur={(e) => handleBlur(e, errors.maritalStatus)}
                    onChange={(e) => handleChange("maritalStatus", e.target.value)}
                  >
                    <option value="">Select Marital Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                  </select>
                {errors.maritalStatus && (
                  <div style={errorText}>{errors.maritalStatus}</div>
                )}
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

        {/* STEP 2 */}
        {step === 2 && (
          <>
            <div style={grid}>

            <div>
                <label style={label}>Country</label>

                <Select
                  styles={customSelectStyles}
                  options={countryOptions}
                  placeholder="Search country..."

                  value={countryOptions.find(
                    (c) => c.value === form.countryId
                  )}

                  onChange={(selected) => {
                    handleCountryChange(selected.value);
                  }}
                />

                {errors.countryId && (
                  <div style={errorText}>{errors.countryId}</div>
                )}
              </div>
           
            <div>
                <label style={label}>Company</label>

                <Select
                  styles={customSelectStyles}
                  options={companyOptions}
                  placeholder={
                    form.countryId
                      ? "Search company..."
                      : "Select country first"
                  }

                  isDisabled={!form.countryId}

                  value={companyOptions.find(
                    (c) => c.value === form.companyId
                  )}

                  onChange={(selected) =>
                    handleChange("companyId", selected.value)
                  }
                />

                {errors.companyId && (
                  <div style={errorText}>{errors.companyId}</div>
                )}
              </div>
              
                {user?.role === "SUPER_USER" && (
                    <div>
                      <label style={label}>Agency</label>

                      <Select
                        styles={customSelectStyles}
                        options={agencyOptions}
                        placeholder="Search agency..."

                        value={agencyOptions.find(
                          (a) => a.value === form.agencyId
                        )}

                        onChange={(selected) =>
                          handleChange("agencyId", selected.value)
                        }
                      />

                      {errors.agencyId && (
                        <div style={errorText}>{errors.agencyId}</div>
                      )}
                    </div>
                  )}
              {user?.role === "SUPER_USER" && (
              <div>
                <label style={label}>Total Amount in Euro</label>
                <input
                  style={{
                    ...input,
                    border: errors.totalAmount  
                      ? `1px solid ${THEME.error}`
                      : input.border
                  }}
                  value={form.totalAmount || ""}
                  onFocus={handleFocus}
                  placeholder="Total Amount"
                  onBlur={(e) => handleBlur(e, errors.totalAmount)}
                  onChange={(e) => handleChange("totalAmount", e.target.value)}
                />
                
                  {errors.totalAmount && <div style={errorText}>{errors.totalAmount}</div>}
              </div> )}

              <div>
                <label style={label}>Initial Paid Amount</label>
                 <input
                  style={{
                    ...input,
                    border: errors.paidAmount  
                      ? `1px solid ${THEME.error}`
                      : input.border
                  }}
                  value={form.paidAmount || ""}
                  onFocus={handleFocus}
                  placeholder="Initial Paid Amount"
                  onBlur={(e) => handleBlur(e, errors.paidAmount)}
                  onChange={(e) => handleChange("paidAmount", e.target.value)}
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
  padding: "10px", // 🔥 important for mobile spacing
  zIndex: 1000
};

const modal = {
  background: "#fff",
  borderRadius: "12px",
  width: "100%",
  maxWidth: "600px", // desktop limit
  maxHeight: "90vh", // 🔥 prevents overflow
  overflowY: "auto", // 🔥 scroll inside modal
  padding: "20px"
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  width: "100%" // 🔥 IMPORTANT
};

const input = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: `1px solid ${THEME.border}`,
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none", // 🔥 removes black outline
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
  background: "#2f80ed",
  color: "#fff",
  border: "none",
  padding: "10px 18px",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: "500"
};

const btnSecondary = {
  background: "transparent",
  border: "1px solid #ccc",
  padding: "10px 18px",
  borderRadius: "8px",
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
  color: "#374151",
  fontWeight: "500"
};

const errorText = {
  color: "red",
  fontSize: "12px",
  marginTop: "3px"
};
export default ApplicantFormModal;

import React, { useEffect, useState } from "react";
import "react-datepicker/dist/react-datepicker.css";
import "react-phone-input-2/lib/style.css";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";
import { getCached } from "../../services/cachedApi";
import "../../styles/applicantsDashboard.css";
import ApplicantFormStepOne from "./ApplicantFormStepOne";
import ApplicantFormStepTwo from "./ApplicantFormStepTwo";
import { modal, overlay, stepText } from "./formStyles";
import {
  EMPTY_FORM,
  calculateAge,
  getApplicantPaidAmount,
  getApplicantTotalAmount,
  validateAge,
  validatePaidAmount,
  validatePhone,
  validateTotalAmount
} from "./formUtils";

function ApplicantFormModal({
  onClose,
  onSaved,
  editData,
  user: userProp = null,
  onApproveStage,
  autoApproveAfterSave = false
}) {
  const [companies, setCompanies] = useState([]);
  const [countries, setCountries] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [user, setUser] = useState(userProp);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [dob, setDob] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);

  const navigate = useNavigate();

  const validateStep1 = () => {
    const newErrors = {};
    if (!form.firstName) newErrors.firstName = "First name is required";
    if (!form.lastName) newErrors.lastName = "Surname is required";
    if (!form.dob) newErrors.dob = "Date of birth is required";
    if (!form.address) newErrors.address = "Address is required";
    if (!form.maritalStatus) newErrors.maritalStatus = "Select marital status";

    const ageError = validateAge(form.age);
    if (ageError) newErrors.age = ageError;
    const phoneError = validatePhone(form.phone, form.phoneCountry);
    if (phoneError) newErrors.phone = phoneError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};
    if (!form.countryId) newErrors.countryId = "Select country";
    if (!form.companyId) newErrors.companyId = "Select company";
    if (user?.role === "SUPER_USER" && !form.agencyId) newErrors.agencyId = "Select agency";

    const totalAmountError = validateTotalAmount(form.totalAmount, user?.role);
    if (totalAmountError) newErrors.totalAmount = totalAmountError;
    const paidAmountError = validatePaidAmount(form.paidAmount);
    if (paidAmountError) newErrors.paidAmount = paidAmountError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCountryChange = (value) => {
    setForm((prev) => ({ ...prev, countryId: value, companyId: "" }));
    setFilteredCompanies(companies.filter((company) => company.countryId === value));
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
        const [companiesData, countriesData, agenciesData] = await Promise.all([
          getCached("/companies", { ttlMs: 60000 }),
          getCached("/countries", { ttlMs: 120000 }),
          getCached("/agencies", { ttlMs: 60000 })
        ]);
        setCompanies(companiesData || []);
        setCountries(countriesData || []);
        setAgencies(agenciesData || []);
      } catch (err) {
        console.error(err);
      }
    }

    async function loadUser() {
      if (userProp) {
        setUser(userProp);
        return;
      }
      try {
        const data = await getCached("/auth/me", { ttlMs: 120000 });
        setUser(data);
      } catch (err) {
        console.error(err);
      }
    }

    loadDropdowns();
    loadUser();
  }, [userProp]);

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
      setFilteredCompanies(companies.filter((company) => company.countryId === resolvedCountryId));
    }
  }, [editData, companies, user?.role]);

  const handleSubmit = async () => {
    if (!validateStep2()) return;

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
        if (typeof onSaved === "function") {
          await onSaved({ operation: "update", id: editData.id, payload });
        }
      } else {
        const response = await API.post("/applicants/create", payload);
        if (typeof onSaved === "function") {
          await onSaved({ operation: "create", id: response?.data?.applicantId || "", payload });
        }
        resetForm();
      }

      const shouldAutoApprove = autoApproveAfterSave && typeof onApproveStage === "function" && Boolean(editData);
      if (shouldAutoApprove) {
        try {
          await onApproveStage();
        } catch (approveError) {
          console.error(approveError);
          return;
        }
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

  const countryOptions = countries.map((country) => ({ value: country.id, label: country.name }));
  const companyOptions = filteredCompanies.map((company) => ({ value: company.id, label: company.name }));
  const agencyOptions = agencies.map((agency) => ({ value: agency.id, label: agency.name }));

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <h3 style={{ margin: 0 }}>{editData ? "Edit Applicant" : "Add Applicant"}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: "18px" }}>
            x
          </button>
        </div>

        <div style={stepText}>Step {step} of 2</div>

        {step === 1 ? (
          <ApplicantFormStepOne
            form={form}
            errors={errors}
            dob={dob}
            setDob={setDob}
            setForm={setForm}
            handleChange={handleChange}
            calculateAge={calculateAge}
            onNext={() => {
              if (validateStep1()) setStep(2);
            }}
          />
        ) : (
          <ApplicantFormStepTwo
            user={user}
            form={form}
            errors={errors}
            countryOptions={countryOptions}
            companyOptions={companyOptions}
            agencyOptions={agencyOptions}
            handleCountryChange={handleCountryChange}
            handleCompanyChange={handleCompanyChange}
            handleChange={handleChange}
            setStep={setStep}
            handleSubmit={handleSubmit}
            loading={loading}
            editData={editData}
            autoApproveAfterSave={autoApproveAfterSave}
          />
        )}
      </div>
    </div>
  );
}

export default ApplicantFormModal;

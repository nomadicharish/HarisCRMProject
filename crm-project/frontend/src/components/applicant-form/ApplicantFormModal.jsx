import React, { useEffect, useState } from "react";
import "react-datepicker/dist/react-datepicker.css";
import "react-phone-input-2/lib/style.css";
import { useNavigate } from "react-router-dom";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";
import API from "../../services/api";
import { getCached } from "../../services/cachedApi";
import "../../styles/applicantsDashboard.css";
import ApplicantFormStepOne from "./ApplicantFormStepOne";
import ApplicantFormStepTwo from "./ApplicantFormStepTwo";
import { actions, btnPrimary, btnSecondary, modal, overlay, stepText } from "./formStyles";
import BlockingLoader from "../common/BlockingLoader";
import { formatIndianNumberInput, parseIndianNumberInput } from "../../utils/numberFormat";
import {
  EMPTY_FORM,
  calculateAge,
  getApplicantPaidAmount,
  getApplicantTotalAmount,
  validateAge,
  validateOptionalPhone,
  validatePaidAmount,
  validatePhone,
  validateTotalAmount
} from "./formUtils";

const PHONE_COUNTRY_CODES = new Set(getCountries().map((code) => code.toUpperCase()));

const sanitizeAmountInput = formatIndianNumberInput;
const parseAmountInput = parseIndianNumberInput;
const DEFAULT_EXCHANGE_RATE = 90;

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function roundTo2(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function ApplicantFormModal({
  onClose,
  onSaved,
  editData,
  user: userProp = null,
  onApproveStage,
  autoApproveAfterSave = false,
  asPage = false
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
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE);

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
    const whatsappError = validateOptionalPhone(form.whatsappNumber, form.whatsappCountry || form.phoneCountry);
    if (whatsappError) newErrors.whatsappNumber = whatsappError;

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
    if (key === "totalAmount" || key === "paidAmount") {
      setForm((prev) => ({ ...prev, [key]: sanitizeAmountInput(value) }));
      return;
    }
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "phone" && prev.isWhatsappSameAsPhone) {
        next.whatsappNumber = String(value || "");
      }
      if (key === "phoneCountry" && prev.isWhatsappSameAsPhone) {
        next.whatsappCountry = String(value || "IN");
      }
      if (key === "isWhatsappSameAsPhone" && !value) {
        next.whatsappNumber = "";
        next.whatsappCountry = next.phoneCountry || "IN";
      }
      return next;
    });
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
      totalAmount: selectedCompany
        ? user?.role === "SUPER_USER"
          ? sanitizeAmountInput(selectedCompany.companyPaymentPerApplicant ?? "")
          : sanitizeAmountInput(prev.totalAmount || selectedCompany.companyPaymentPerApplicant || "")
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
        setCompanies(normalizeListResponse(companiesData));
        setCountries(normalizeListResponse(countriesData));
        setAgencies(normalizeListResponse(agenciesData));
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
      setExchangeRate(DEFAULT_EXCHANGE_RATE);
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
      phone: (() => {
        const rawPhone = editData.personalDetails?.phone || editData.phone || "";
        const parsedPhone = parsePhoneNumberFromString(rawPhone);
        return parsedPhone?.nationalNumber || String(rawPhone || "").replace(/[^\d]/g, "");
      })(),
      phoneCountry: (() => {
        const rawPhone = editData.personalDetails?.phone || editData.phone || "";
        const parsedPhone = parsePhoneNumberFromString(rawPhone);
        const country = String(parsedPhone?.country || "IN").toUpperCase();
        return PHONE_COUNTRY_CODES.has(country) ? country : "IN";
      })(),
      whatsappNumber: (() => {
        const rawWhatsapp =
          editData.personalDetails?.whatsappNumber ||
          editData.personalDetails?.whatsapp ||
          editData.whatsappNumber ||
          "";
        const parsedWhatsapp = parsePhoneNumberFromString(rawWhatsapp);
        return parsedWhatsapp?.nationalNumber || String(rawWhatsapp || "").replace(/[^\d]/g, "");
      })(),
      whatsappCountry: (() => {
        const rawWhatsapp =
          editData.personalDetails?.whatsappNumber ||
          editData.personalDetails?.whatsapp ||
          editData.whatsappNumber ||
          "";
        const parsedWhatsapp = parsePhoneNumberFromString(rawWhatsapp);
        const country = String(parsedWhatsapp?.country || "IN").toUpperCase();
        return PHONE_COUNTRY_CODES.has(country) ? country : "IN";
      })(),
      isWhatsappSameAsPhone: (() => {
        const rawPhone = editData.personalDetails?.phone || editData.phone || "";
        const rawWhatsapp =
          editData.personalDetails?.whatsappNumber ||
          editData.personalDetails?.whatsapp ||
          editData.whatsappNumber ||
          "";
        const parsedPhone = parsePhoneNumberFromString(rawPhone);
        const parsedWhatsapp = parsePhoneNumberFromString(rawWhatsapp);
        if (!rawWhatsapp) return false;
        return (
          String(parsedPhone?.nationalNumber || rawPhone).replace(/[^\d]/g, "") ===
          String(parsedWhatsapp?.nationalNumber || rawWhatsapp).replace(/[^\d]/g, "")
        );
      })(),
      maritalStatus: editData.maritalStatus || editData.personalDetails?.maritalStatus || "",
      countryId: resolvedCountryId,
      companyId: resolvedCompanyId,
      agencyId: editData.agencyId || "",
      totalAmount:
        hasResolvedTotalAmount
          ? sanitizeAmountInput(resolvedTotalAmount)
          : user?.role === "SUPER_USER"
          ? sanitizeAmountInput(selectedCompany?.companyPaymentPerApplicant ?? "")
          : "",
      paidAmount: sanitizeAmountInput(getApplicantPaidAmount(editData))
    });

    setDob(parsedDob);
    setStep(1);
    setExchangeRate(
      Number(
        editData?.payment?.exchangeRate ||
          editData?.paymentsSummary?.exchangeRate ||
          editData?.paymentSummary?.exchangeRate ||
          editData?.exchangeRate ||
          DEFAULT_EXCHANGE_RATE
      ) || DEFAULT_EXCHANGE_RATE
    );

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
          phone: `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.phoneCountry || "IN").toUpperCase()) ? String(form.phoneCountry || "IN").toUpperCase() : "IN")}${String(form.phone || "").replace(/[^\d]/g, "")}`,
          whatsappNumber: form.whatsappNumber
            ? `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.whatsappCountry || "IN").toUpperCase()) ? String(form.whatsappCountry || "IN").toUpperCase() : "IN")}${String(form.whatsappNumber || "").replace(/[^\d]/g, "")}`
            : "",
          whatsapp: form.whatsappNumber
            ? `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.whatsappCountry || "IN").toUpperCase()) ? String(form.whatsappCountry || "IN").toUpperCase() : "IN")}${String(form.whatsappNumber || "").replace(/[^\d]/g, "")}`
            : "",
          maritalStatus: form.maritalStatus,
          address: form.address
        },
        whatsappNumber: form.whatsappNumber
          ? `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.whatsappCountry || "IN").toUpperCase()) ? String(form.whatsappCountry || "IN").toUpperCase() : "IN")}${String(form.whatsappNumber || "").replace(/[^\d]/g, "")}`
          : "",
        companyId: form.companyId,
        countryId: form.countryId,
        agencyId: user?.role === "SUPER_USER" ? form.agencyId : user?.agencyId,
        totalApplicantPayment: form.totalAmount ? parseAmountInput(form.totalAmount) : 0,
        totalAmount: form.totalAmount ? parseAmountInput(form.totalAmount) : 0,
        amountPaid: form.paidAmount ? parseAmountInput(form.paidAmount) : 0,
        paidAmount: form.paidAmount ? parseAmountInput(form.paidAmount) : 0
      };
      const selectedCompany = companies.find((company) => company.id === form.companyId);
      const savedPayload = {
        ...payload,
        companyName: selectedCompany?.name || ""
      };

      if (editData) {
        await API.patch(`/applicants/${editData.id}`, payload);
        if (typeof onSaved === "function") {
          await onSaved({ operation: "update", id: editData.id, payload: savedPayload });
        }
      } else {
        const response = await API.post("/applicants/create", payload);
        if (typeof onSaved === "function") {
          await onSaved({ operation: "create", id: response?.data?.applicantId || "", payload: savedPayload });
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
  const selectedCompany = companies.find((company) => company.id === form.companyId);
  const totalInrNeeded = (() => {
    const totalEur = (() => {
      const parsed = parseAmountInput(form.totalAmount);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      const companyAmount = Number(selectedCompany?.companyPaymentPerApplicant || 0);
      return Number.isFinite(companyAmount) && companyAmount > 0 ? companyAmount : 0;
    })();
    if (!Number.isFinite(totalEur) || totalEur <= 0) return "0";
    return sanitizeAmountInput(roundTo2(totalEur * exchangeRate));
  })();
  const pageSubmitLabel = loading
    ? editData
      ? "Updating..."
      : "Creating..."
    : editData
    ? user?.role === "SUPER_USER" && autoApproveAfterSave
      ? "Approve Profile"
      : "Update Profile"
    : "Create Profile";
  const pageCancelHandler = () => {
    if (typeof onClose === "function") onClose();
    else navigate(-1);
  };
  const handlePageSubmit = () => {
    const validStep1 = validateStep1();
    const validStep2 = validateStep2();
    if (!validStep1 || !validStep2) return;
    handleSubmit();
  };

  if (asPage) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div style={{ ...modal, maxWidth: "980px", margin: "0 auto", position: "relative" }}>
            <BlockingLoader open={loading} label={editData ? "Updating profile..." : "Creating profile..."} />
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{editData ? "Edit Applicant" : "Add Applicant"}</h3>
              <button onClick={pageCancelHandler} style={{ border: "none", background: "none", fontSize: "18px" }}>
                x
              </button>
            </div>

            <div style={{ ...stepText, marginTop: 2 }}>Fill all applicant details below</div>

            <ApplicantFormStepOne
              form={form}
              errors={errors}
              dob={dob}
              setDob={setDob}
              setForm={setForm}
              handleChange={handleChange}
              calculateAge={calculateAge}
              onNext={() => {}}
              showActions={false}
            />

            <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 18, paddingTop: 18 }}>
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
                showActions={false}
                totalInrNeeded={totalInrNeeded}
              />
            </div>

            <div style={actions}>
              <button style={btnSecondary} onClick={pageCancelHandler}>
                Cancel
              </button>
              <button
                style={{
                  ...btnPrimary,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "not-allowed" : "pointer"
                }}
                disabled={loading}
                onClick={handlePageSubmit}
              >
                {pageSubmitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay}>
      <div style={{ ...modal, position: "relative" }}>
        <BlockingLoader open={loading} label={editData ? "Updating profile..." : "Creating profile..."} />
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
            totalInrNeeded={totalInrNeeded}
          />
        )}
      </div>
    </div>
  );
}

export default ApplicantFormModal;

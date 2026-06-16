import React, { Suspense, lazy, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";
import API from "../../services/api";
import { getCached } from "../../services/cachedApi";
import "../../styles/applicantsDashboard.css";
import { actions, btnPrimary, btnSecondary, modal, overlay, stepText } from "./formStyles";
import BlockingLoader from "../common/BlockingLoader";
import DashboardTopbar from "../common/DashboardTopbar";
import { formatIndianNumberInput, parseIndianNumberInput } from "../../utils/numberFormat";
import { normalizeCurrency } from "../../utils/currency";
import { isSuperUserLikeRole } from "../../utils/auth";
import {
  EMPTY_FORM,
  calculateAge,
  getApplicantPaidAmount,
  getApplicantTotalAmount,
  validateAge,
  validateEmail,
  validateOptionalPhone,
  validatePhone,
  validateTotalAmount
} from "./formUtils";

const ApplicantFormStepOne = lazy(() => import("./ApplicantFormStepOne"));
const ApplicantFormStepTwo = lazy(() => import("./ApplicantFormStepTwo"));
const PHONE_COUNTRY_CODES = new Set(getCountries().map((code) => code.toUpperCase()));

const sanitizeAmountInput = formatIndianNumberInput;
const parseAmountInput = parseIndianNumberInput;
const STEP_FALLBACK = <div className="routeSkeleton">Loading form...</div>;
const EDUCATION_OPTIONS = [
  "High School Diploma",
  "Vocational / Technical Certificate",
  "Diploma",
  "Bachelor's Degree",
  "Master's Degree",
  "Professional Degree",
  "Doctorate (Ph.D.)",
  "No Formal Education"
];

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function ApplicantFormModal({
  onClose,
  onSaved,
  editData,
  user: userProp = null,
  onApproveStage,
  autoApproveAfterSave = false,
  asPage = false,
  readOnly = false
}) {
  const [companies, setCompanies] = useState([]);
  const [countries, setCountries] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [user, setUser] = useState(userProp);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [dob, setDob] = useState(null);
  const [, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);

  const navigate = useNavigate();

  const getStep1Errors = () => {
    const newErrors = {};
    if (!form.firstName) newErrors.firstName = "First name is required";
    if (!form.lastName) newErrors.lastName = "Surname is required";
    if (!form.dob) newErrors.dob = "Date of birth is required";
    if (!form.placeOfBirth) newErrors.placeOfBirth = "Place of birth is required";
    if (!form.passportNumber) newErrors.passportNumber = "Passport number is required";
    if (!form.address) newErrors.address = "Address is required";
    if (!form.education) newErrors.education = "Select education";
    if (form.education === "Others" && !String(form.customEducation || "").trim()) {
      newErrors.customEducation = "Enter education";
    }

    const ageError = validateAge(form.age);
    if (ageError) newErrors.age = ageError;
    const emailError = validateEmail(form.email);
    if (emailError) newErrors.email = emailError;
    const phoneError = validatePhone(form.phone, form.phoneCountry);
    if (phoneError) newErrors.phone = phoneError;
    const whatsappError = validateOptionalPhone(form.whatsappNumber, form.whatsappCountry || form.phoneCountry);
    if (whatsappError) newErrors.whatsappNumber = whatsappError;

    return newErrors;
  };

  const getStep2Errors = () => {
    const newErrors = {};
    if (!form.countryId) newErrors.countryId = "Select country";
    if (!form.companyId) newErrors.companyId = "Select company";
    if (!form.jobPositionId) newErrors.jobPositionId = "Select job position";
    const isSuperUser = isSuperUserLikeRole(user?.role);
    if (isSuperUser && !form.agencyId) newErrors.agencyId = "Select agency";

    const totalAmountError = validateTotalAmount(
      form.totalAmount,
      isSuperUser && Boolean(editData) ? "SUPER_USER" : user?.role
    );
    if (totalAmountError) newErrors.totalAmount = totalAmountError;
    return newErrors;
  };

  const validateStep2 = () => {
    const newErrors = getStep2Errors();
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
      return next;
    });
  };

  const handleCountryChange = (value) => {
    setForm((prev) => ({ ...prev, countryId: value, companyId: "", jobPositionId: "" }));
    setFilteredCompanies(companies.filter((company) => company.countryId === value));
  };

  const handleCompanyChange = (value) => {
    setForm((prev) => ({
      ...prev,
      companyId: value,
      jobPositionId: ""
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
    const resolvedEducation = editData.education || editData.personalDetails?.education || "";
    const isKnownEducation = EDUCATION_OPTIONS.includes(resolvedEducation);
    const resolvedTotalAmount = getApplicantTotalAmount(editData);
    const hasResolvedTotalAmount =
      resolvedTotalAmount !== null &&
      resolvedTotalAmount !== undefined &&
      String(resolvedTotalAmount).trim() !== "" &&
      Number(resolvedTotalAmount) > 0;

    setForm({
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email: editData.email || editData.personalDetails?.email || "",
      dob: parsedDob || "",
      age: parsedDob ? calculateAge(parsedDob) : editData.age || editData.personalDetails?.age || "",
      education: resolvedEducation && !isKnownEducation ? "Others" : resolvedEducation,
      customEducation: resolvedEducation && !isKnownEducation ? resolvedEducation : "",
      address: editData.address || editData.personalDetails?.address || "",
      placeOfBirth: editData.placeOfBirth || editData.personalDetails?.placeOfBirth || "",
      passportNumber: editData.passportNumber || editData.personalDetails?.passportNumber || "",
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
      countryId: resolvedCountryId,
      companyId: resolvedCompanyId,
      jobPositionId: editData.jobPositionId || "",
      agencyId: editData.agencyId || "",
      paymentCurrency: normalizeCurrency(
        editData.paymentCurrency ||
          editData.currency ||
          editData?.payment?.currency ||
          editData?.paymentSummary?.applicant?.currency
      ),
      totalAmount:
        hasResolvedTotalAmount
          ? sanitizeAmountInput(resolvedTotalAmount)
          : "",
      paidAmount: sanitizeAmountInput(getApplicantPaidAmount(editData))
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
      const selectedCompany = companies.find((company) => company.id === form.companyId);
      const companyJobPositions = Array.isArray(selectedCompany?.jobPositions) && selectedCompany.jobPositions.length
        ? selectedCompany.jobPositions
        : selectedCompany?.jobSpecifications || [];
      const selectedJobPosition = companyJobPositions.find((position) => position.id === form.jobPositionId);
      const resolvedEducationValue =
        form.education === "Others" ? String(form.customEducation || "").trim() : form.education;
      const applicantPayload = {
        firstName: form.firstName,
        lastName: form.lastName,
        education: resolvedEducationValue,
        personalDetails: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: String(form.email || "").trim().toLowerCase(),
          dob: form.dob,
          age: form.age,
          education: resolvedEducationValue,
          phone: `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.phoneCountry || "IN").toUpperCase()) ? String(form.phoneCountry || "IN").toUpperCase() : "IN")}${String(form.phone || "").replace(/[^\d]/g, "")}`,
          whatsappNumber: form.whatsappNumber
            ? `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.whatsappCountry || "IN").toUpperCase()) ? String(form.whatsappCountry || "IN").toUpperCase() : "IN")}${String(form.whatsappNumber || "").replace(/[^\d]/g, "")}`
            : "",
          whatsapp: form.whatsappNumber
            ? `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.whatsappCountry || "IN").toUpperCase()) ? String(form.whatsappCountry || "IN").toUpperCase() : "IN")}${String(form.whatsappNumber || "").replace(/[^\d]/g, "")}`
            : "",
          address: form.address,
          placeOfBirth: form.placeOfBirth,
          passportNumber: form.passportNumber
        },
        whatsappNumber: form.whatsappNumber
          ? `+${getCountryCallingCode(PHONE_COUNTRY_CODES.has(String(form.whatsappCountry || "IN").toUpperCase()) ? String(form.whatsappCountry || "IN").toUpperCase() : "IN")}${String(form.whatsappNumber || "").replace(/[^\d]/g, "")}`
          : "",
        email: String(form.email || "").trim().toLowerCase(),
        companyId: form.companyId,
        jobPositionId: form.jobPositionId,
        jobPositionName: selectedJobPosition?.title || selectedJobPosition?.name || "",
        countryId: form.countryId,
        agencyId: isSuperUserLikeRole(user?.role) ? form.agencyId : user?.agencyId,
        totalApplicantPayment: form.totalAmount ? parseAmountInput(form.totalAmount) : 0,
        totalAmount: form.totalAmount ? parseAmountInput(form.totalAmount) : 0,
        paymentCurrency: normalizeCurrency(form.paymentCurrency),
        currency: normalizeCurrency(form.paymentCurrency)
      };
      const savedPayload = {
        ...applicantPayload,
        companyName: selectedCompany?.name || "",
        jobPositionName: selectedJobPosition?.title || selectedJobPosition?.name || ""
      };

      if (editData) {
        await API.patch(`/applicants/${editData.id}`, applicantPayload);
        const shouldAutoApprove = autoApproveAfterSave && typeof onApproveStage === "function";
        if (shouldAutoApprove) {
          await onApproveStage();
        }
        if (typeof onSaved === "function") {
          await onSaved({ operation: "update", id: editData.id, payload: savedPayload });
        }
      } else {
        const response = await API.post("/applicants/create", applicantPayload);
        if (typeof onSaved === "function") {
          await onSaved({ operation: "create", id: response?.data?.applicantId || "", payload: savedPayload });
        }
        resetForm();
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
  const selectedCompanyForPositions = companies.find((company) => company.id === form.companyId);
  const jobPositionOptions = (
    Array.isArray(selectedCompanyForPositions?.jobPositions) && selectedCompanyForPositions.jobPositions.length
      ? selectedCompanyForPositions.jobPositions
      : selectedCompanyForPositions?.jobSpecifications || []
  ).map((position) => ({
    value: position.id,
    label: position.title || position.name || position.label || "Job Position",
    documents: Array.isArray(position.documents) ? position.documents : Array.isArray(position.documentsNeeded) ? position.documentsNeeded : []
  }));
  const pageSubmitLabel = loading
    ? editData
      ? "Updating..."
      : "Creating..."
    : editData
    ? isSuperUserLikeRole(user?.role) && autoApproveAfterSave
      ? "Approve Profile"
      : "Update Profile"
    : "Create Profile";
  const pageCancelHandler = () => {
    if (typeof onClose === "function") onClose();
    else navigate(-1);
  };
  const handlePageSubmit = () => {
    if (readOnly) return;
    const step1Errors = getStep1Errors();
    const step2Errors = getStep2Errors();
    const combinedErrors = { ...step1Errors, ...step2Errors };
    setErrors(combinedErrors);
    if (Object.keys(combinedErrors).length > 0) return;
    handleSubmit();
  };

  if (asPage) {
    return (
      <div className="page-container">
        <DashboardTopbar user={user} />
        <div className="page-content">
          <div
            style={{
              ...modal,
              maxWidth: "980px",
              margin: "0 auto",
              position: "relative",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 16px 44px rgba(15,23,42,0.12)",
              maxHeight: "none",
              overflowY: "visible"
            }}
          >
            <BlockingLoader open={loading} label={editData ? "Updating profile..." : "Creating profile..."} />
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#101828" }}>
                  {editData ? "Applicant Details" : "Add Applicant Details"}
                </h2>
                <div style={{ ...stepText, marginBottom: 0, marginTop: 4 }}>Update the applicant details below</div>
              </div>
              <button
                type="button"
                onClick={pageCancelHandler}
                aria-label="Close"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  lineHeight: 1,
                  color: "#344054",
                  cursor: "pointer"
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                border: "1px solid #e6eaf2",
                borderRadius: 12,
                overflow: "visible",
                background: "#ffffff"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  borderLeft: "4px solid #0052CC",
                  borderBottom: "1px solid #eef2f7",
                  background: "#fbfdff"
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"
                    stroke="#0052CC"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="#0052CC"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0052CC" }}>Personal Information</div>
              </div>
              <div style={{ padding: 16 }}>
                <Suspense fallback={STEP_FALLBACK}>
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
                    readOnly={readOnly}
                  />
                </Suspense>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                border: "1px solid #e6eaf2",
                borderRadius: 12,
                overflow: "visible",
                background: "#ffffff"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  borderLeft: "4px solid #0052CC",
                  borderBottom: "1px solid #eef2f7",
                  background: "#fbfdff"
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 21h18M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14"
                    stroke="#0052CC"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M9 9h6M9 12h6M9 15h6"
                    stroke="#0052CC"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0052CC" }}>Application Details</div>
              </div>
              <div style={{ padding: 16 }}>
                <Suspense fallback={STEP_FALLBACK}>
                  <ApplicantFormStepTwo
                    user={user}
                    form={form}
                    errors={errors}
                    countryOptions={countryOptions}
                    companyOptions={companyOptions}
                    jobPositionOptions={jobPositionOptions}
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
                    readOnly={readOnly}
                  />
                </Suspense>
              </div>
            </div>

            {!readOnly ? (
              <div style={actions}>
                <button style={btnSecondary} onClick={pageCancelHandler} disabled={loading}>
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
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay}>
      <div
        style={{
          ...modal,
          maxWidth: "980px",
          margin: "0 auto",
          position: "relative",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 16px 44px rgba(15,23,42,0.12)"
        }}
      >
        <BlockingLoader open={loading} label={editData ? "Updating profile..." : "Creating profile..."} />
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#101828" }}>
              {editData ? "Applicant Details" : "Add Applicant Details"}
            </h2>
            <div style={{ ...stepText, marginBottom: 0, marginTop: 4 }}>Update the applicant details below</div>
          </div>
          <button
            type="button"
            onClick={pageCancelHandler}
            aria-label="Close"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              lineHeight: 1,
              color: "#344054",
              cursor: "pointer"
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            border: "1px solid #e6eaf2",
            borderRadius: 12,
            overflow: "visible",
            background: "#ffffff"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderLeft: "4px solid #0052CC",
              borderBottom: "1px solid #eef2f7",
              background: "#fbfdff"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"
                stroke="#0052CC"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                stroke="#0052CC"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0052CC" }}>Personal Information</div>
          </div>
          <div style={{ padding: 16 }}>
            <Suspense fallback={STEP_FALLBACK}>
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
                readOnly={readOnly}
              />
            </Suspense>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            border: "1px solid #e6eaf2",
            borderRadius: 12,
            overflow: "visible",
            background: "#ffffff"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderLeft: "4px solid #0052CC",
              borderBottom: "1px solid #eef2f7",
              background: "#fbfdff"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 21h18M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14"
                stroke="#0052CC"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M9 9h6M9 12h6M9 15h6"
                stroke="#0052CC"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0052CC" }}>Application Details</div>
          </div>
          <div style={{ padding: 16 }}>
            <Suspense fallback={STEP_FALLBACK}>
              <ApplicantFormStepTwo
                user={user}
                form={form}
                errors={errors}
                countryOptions={countryOptions}
                companyOptions={companyOptions}
                jobPositionOptions={jobPositionOptions}
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
                readOnly={readOnly}
              />
            </Suspense>
          </div>
        </div>

        {!readOnly ? (
          <div style={actions}>
            <button style={btnSecondary} onClick={pageCancelHandler} disabled={loading}>
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
        ) : null}
      </div>
    </div>
  );
}

export default ApplicantFormModal;

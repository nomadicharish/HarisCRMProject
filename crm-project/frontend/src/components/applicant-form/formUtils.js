import { getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  dob: "",
  age: "",
  address: "",
  phone: "",
  whatsappNumber: "",
  whatsappCountry: "IN",
  isWhatsappSameAsPhone: false,
  phoneCountry: "IN",
  maritalStatus: "",
  companyId: "",
  countryId: "",
  agencyId: "",
  totalAmount: "",
  paidAmount: ""
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

const validateAge = (ageValue) => {
  if (!ageValue) return "Age is required";
  const age = Number(ageValue);
  if (Number.isNaN(age)) return "Age must be a valid number";
  if (age < 16) return "Age must be at least 16 years old";
  if (age > 120) return "Please enter a valid age";
  return null;
};

const validatePhone = (phone, phoneCountry) => {
  if (!phone) return "Phone number is required";
  try {
    const normalizedPhone = String(phone || "").replace(/[^\d]/g, "");
    const countryIso = String(phoneCountry || "IN").toUpperCase();
    if (!countryIso) return "Invalid country code";
    if (countryIso === "IN" && normalizedPhone.length !== 10) {
      return "Contact number must be exactly 10 digits for IN";
    }
    const dialCode = getCountryCallingCode(countryIso);
    const phoneNumber = parsePhoneNumberFromString(`+${dialCode}${normalizedPhone}`, countryIso);
    if (!phoneNumber || !phoneNumber.isPossible() || !phoneNumber.isValid()) {
      return `Invalid phone number for ${countryIso}`;
    }
    return null;
  } catch {
    return "Invalid phone number";
  }
};

const validateOptionalPhone = (phone, phoneCountry) => {
  if (!String(phone || "").trim()) return null;
  return validatePhone(phone, phoneCountry);
};

const validateEmail = (emailValue) => {
  const normalizedEmail = String(emailValue || "").trim().toLowerCase();
  if (!normalizedEmail) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "Enter a valid email address";
  }
  return null;
};

const validateTotalAmount = (totalAmount, userRole) => {
  if (userRole !== "SUPER_USER") return null;
  if (!totalAmount) return "Total amount is required";
  const value = Number(String(totalAmount).replace(/,/g, ""));
  if (Number.isNaN(value)) return "Total amount must be a valid number";
  if (value <= 0) return "Total amount must be greater than 0";
  if (value > 999999) return "Total amount exceeds maximum limit";
  return null;
};

const validatePaidAmount = (paidAmount) => {
  if (!paidAmount) return "Initial paid amount is required";
  const value = Number(String(paidAmount).replace(/,/g, ""));
  if (Number.isNaN(value)) return "Paid amount must be a valid number";
  if (value < 0) return "Paid amount cannot be negative";
  if (value > 999999) return "Paid amount exceeds maximum limit";
  return null;
};

export {
  EMPTY_FORM,
  getApplicantTotalAmount,
  getApplicantPaidAmount,
  calculateAge,
  validateAge,
  validateEmail,
  validatePhone,
  validateOptionalPhone,
  validateTotalAmount,
  validatePaidAmount
};

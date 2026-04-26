import React from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import "../styles/applicantProfile.css";

function toDisplayValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return "-";
}

function Field({ label, value }) {
  return (
    <div className="applicantInfoField">
      <div className="applicantInfoFieldLabel">{label}</div>
      <div className="applicantInfoFieldValue">{value ?? "-"}</div>
    </div>
  );
}

function formatPhoneWithSeparator(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  try {
    const parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw}`);
    if (!parsed) return raw;
    return `+${parsed.countryCallingCode}-${parsed.nationalNumber}`;
  } catch {
    return raw;
  }
}

function ApplicantDetailsModal({ applicant, open, onClose, showPaymentDetails = true, agencyName = "", countryName = "" }) {
  if (!open || !applicant) return null;

  const personalDetails = applicant.personalDetails || {};
  const fullName =
    applicant.fullName ||
    [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
    "-";
  const email = applicant.email || personalDetails.email || "-";

  const totalAmount = toDisplayValue(
    applicant?.payment?.total,
    applicant?.paymentsSummary?.applicant?.total,
    applicant?.totalApplicantPayment,
    applicant?.totalAmount,
    applicant?.totalPayment
  );

  const paidAmount = toDisplayValue(
    applicant?.payment?.paid,
    applicant?.paymentsSummary?.applicant?.paid,
    applicant?.paidAmount,
    applicant?.amountPaid,
    applicant?.initialPaidAmount,
    applicant?.payment?.paidAmount,
    applicant?.payment?.amountPaid
  );

  return (
    <div className="contractModalOverlay applicantInfoModalOverlay">
      <div className="contractModalCard applicantInfoModalCard">
        <div className="applicantInfoModalHeader">
          <div className="applicantInfoModalHeroIcon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="applicantInfoModalHeaderText">
            <h3 className="dashboardModalTitle">Applicant Details</h3>
            <div className="applicantInfoModalSubtitle">View profile, contact and application details.</div>
          </div>
          <button onClick={onClose} className="dashboardModalCloseBtn applicantInfoModalCloseBtn" type="button">
            x
          </button>
        </div>

        <div className="applicantInfoSection">
          <div className="applicantInfoSectionHeader">Profile Details</div>
          <div className="applicantInfoGrid">
            <Field label="Full Name" value={fullName} />
            <Field label="Date of Birth" value={personalDetails.dob ? String(personalDetails.dob).slice(0, 10) : applicant?.dob} />
            <Field label="Age" value={personalDetails.age ?? applicant.age} />
            <Field label="Marital Status" value={personalDetails.maritalStatus ?? applicant.maritalStatus} />
            <Field label="Address" value={personalDetails.address ?? applicant.address} />
          </div>
        </div>

        <div className="applicantInfoSection">
          <div className="applicantInfoSectionHeader">Contact Details</div>
          <div className="applicantInfoGrid">
            <Field label="Contact Number" value={formatPhoneWithSeparator(personalDetails.phone ?? applicant.phone)} />
            <Field
              label="WhatsApp Number"
              value={formatPhoneWithSeparator(personalDetails.whatsappNumber ?? personalDetails.whatsapp ?? applicant.whatsappNumber)}
            />
            <Field label="Email" value={email} />
          </div>
        </div>

        <div className="applicantInfoSection">
          <div className="applicantInfoSectionHeader">Application Details</div>
          <div className="applicantInfoGrid">
            <Field label="Country" value={countryName || applicant.countryName || applicant.country} />
            <Field label="Employer" value={applicant.companyName} />
            {agencyName ? <Field label="Agency" value={agencyName} /> : null}
            {showPaymentDetails ? <Field label="Total Amount" value={totalAmount} /> : null}
            {showPaymentDetails ? <Field label="Initial Paid Amount" value={paidAmount} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApplicantDetailsModal;

import React from "react";

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
    <div style={field}>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} value={value ?? "-"} readOnly />
    </div>
  );
}

function ApplicantDetailsModal({ applicant, open, onClose, showPaymentDetails = true, agencyName = "", countryName = "" }) {
  if (!open || !applicant) return null;

  const personalDetails = applicant.personalDetails || {};
  const fullName =
    applicant.fullName ||
    [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
    "-";

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
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <h3 style={{ margin: 0 }}>Applicant Details</h3>
          <button onClick={onClose} style={closeButton} type="button">
            x
          </button>
        </div>
        <div style={grid}>
          <Field label="Full Name" value={fullName} />
          <Field label="Date of Birth" value={personalDetails.dob ? String(personalDetails.dob).slice(0, 10) : applicant?.dob} />
          <Field label="Age" value={personalDetails.age ?? applicant.age} />
          <Field label="Marital Status" value={personalDetails.maritalStatus ?? applicant.maritalStatus} />
          <Field label="Phone" value={personalDetails.phone ?? applicant.phone} />
          <Field label="Address" value={personalDetails.address ?? applicant.address} />
          <Field label="Country" value={countryName || applicant.countryName || applicant.country} />
          <Field label="Employer" value={applicant.companyName} />
          {agencyName ? <Field label="Agency" value={agencyName} /> : null}
          {showPaymentDetails ? <Field label="Total Amount" value={totalAmount} /> : null}
          {showPaymentDetails ? <Field label="Initial Paid Amount" value={paidAmount} /> : null}
        </div>
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
  borderRadius: "12px",
  width: "100%",
  maxWidth: "600px",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: "20px"
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "10px"
};

const closeButton = {
  border: "none",
  background: "none",
  fontSize: "18px",
  cursor: "pointer"
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  width: "100%"
};

const field = {
  display: "flex",
  flexDirection: "column",
  gap: "5px"
};

const labelStyle = {
  fontSize: "13px",
  color: "#374151",
  fontWeight: "500"
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  fontSize: "14px",
  boxSizing: "border-box",
  background: "#f8fafc",
  color: "#111827"
};

export default ApplicantDetailsModal;

import React from "react";

function Field({ label, value }) {
  return (
    <div className="kv">
      <div className="k">{label}</div>
      <div className="v">{value ?? "-"}</div>
    </div>
  );
}

function toDisplayValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return "-";
}

function ApplicantDetailsView({ applicant, showPaymentDetails = true }) {
  const pd = applicant?.personalDetails || {};

  const fullName =
    applicant?.fullName ||
    [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ").trim() ||
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
    <div className="card">
      <div className="cardTitleRow">
        <h3>Applicant Details</h3>
      </div>

      <div className="detailsGrid">
        <Field label="Full Name" value={fullName} />
        <Field label="Date of Birth" value={pd.dob ? String(pd.dob).slice(0, 10) : applicant?.dob} />
        <Field label="Age" value={pd.age ?? applicant?.age} />
        <Field label="Marital Status" value={pd.maritalStatus ?? applicant?.maritalStatus} />
        <Field label="Phone" value={pd.phone ?? applicant?.phone} />
        <Field label="Address" value={pd.address ?? applicant?.address} />
        <Field label="Country" value={applicant?.countryName} />
        <Field label="Employer" value={applicant?.companyName} />
        {showPaymentDetails ? <Field label="Total Amount" value={totalAmount} /> : null}
        {showPaymentDetails ? <Field label="Initial Paid Amount" value={paidAmount} /> : null}
      </div>
    </div>
  );
}

export default ApplicantDetailsView;

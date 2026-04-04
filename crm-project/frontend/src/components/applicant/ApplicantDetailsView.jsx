import React from "react";

function Field({ label, value }) {
  return (
    <div className="kv">
      <div className="k">{label}</div>
      <div className="v">{value ?? "-"}</div>
    </div>
  );
}

function ApplicantDetailsView({ applicant }) {
  const pd = applicant?.personalDetails || {};

  const fullName =
    applicant?.fullName ||
    [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ").trim() ||
    "-";

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
      </div>
    </div>
  );
}

export default ApplicantDetailsView;


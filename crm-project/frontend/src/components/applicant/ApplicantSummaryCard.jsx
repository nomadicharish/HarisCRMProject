import React from "react";

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function formatCreatedAt(createdAt) {
  if (!createdAt) return null;
  try {
    const date = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    const formatted = date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    return `Created on ${formatted}`;
  } catch {
    return null;
  }
}

function ApplicantSummaryCard({ applicant, pendingAmount, onEdit, canEdit, onViewMore }) {
  const fullName =
    applicant?.fullName ||
    [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ").trim() ||
    "-";

  const age = applicant?.age ?? applicant?.personalDetails?.age;
  const createdText = formatCreatedAt(applicant?.createdAt);

  const phone = applicant?.phone || applicant?.personalDetails?.phone || "";
  const address = applicant?.address || applicant?.personalDetails?.address || "-";
  const employer = applicant?.companyName || "-";
  const employerPoc =
    applicant?.employerPoc ||
    applicant?.companyPoc ||
    applicant?.companyPocName ||
    applicant?.employerPOC ||
    "-";

  const phoneDigits = phone ? String(phone).replace(/[^\d]/g, "") : "";
  const waLink = phoneDigits ? `https://wa.me/${phoneDigits}` : null;

  return (
    <div className="applicantSideCard">
      <div className="sideTop">
        <div className="sideAvatar" aria-hidden="true">
          {getInitials(fullName)}
        </div>
        <div className="sideTopMeta">
          <div className="sideName">{fullName}</div>
          <div className="sideAge">Age {age ?? "-"}</div>
          {createdText ? <div className="sideCreated">{createdText}</div> : null}
        </div>

        {canEdit ? (
          <button className="iconBtn" type="button" onClick={onEdit} aria-label="Edit applicant">
            ✎
          </button>
        ) : null}
      </div>

      <div className="sideSection">
        <div className="sideLabelRow">
          <div className="sideLabel">Phone No:</div>
        </div>
        <div className="sideValue">{phone || "-"}</div>
      </div>

      <div className="sideSection">
        <div className="sideLabel">Address</div>
        <div className="sideValue">{address}</div>
      </div>

      <div className="sideSection">
        <div className="sideLabel">Employer</div>
        <div className="sideValue">{employer}</div>
      </div>

      <div className="sideSection">
        <div className="sideLabel">Employer POC</div>
        <div className="sideValue">{employerPoc}</div>
      </div>

      <button className="viewMoreBtn" type="button" onClick={onViewMore}>
        View more <span aria-hidden="true">›</span>
      </button>

      <div className="pendingBox">
        <div className="pendingLabel">Pending Amount</div>
        <div className="pendingValue">INR {pendingAmount ?? 0}</div>
        <div className="pendingChevron" aria-hidden="true">
          ›
        </div>
      </div>
    </div>
  );
}

export default ApplicantSummaryCard;


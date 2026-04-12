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

function ApplicantSummaryCard({
  applicant,
  pendingAmount,
  pendingDisplayValue,
  onEdit,
  canEdit,
  onPendingClick,
  agencyName: agencyNameOverride,
  countryName: countryNameOverride,
  showAgency = false,
  showPendingAmount = true
}) {
  const fullName =
    applicant?.fullName ||
    [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ").trim() ||
    "-";

  const age = applicant?.age ?? applicant?.personalDetails?.age;
  const createdText = formatCreatedAt(applicant?.createdAt);

  const phone = applicant?.phone || applicant?.personalDetails?.phone || "";
  const address = applicant?.address || applicant?.personalDetails?.address || "-";
  const employer = applicant?.companyName || "-";
  const country = countryNameOverride || applicant?.countryName || applicant?.country || "";
  const employerDisplay = country ? `${employer}, ${country}` : employer;
  const agency =
    agencyNameOverride ||
    applicant?.agencyName ||
    applicant?.agency?.name ||
    applicant?.agencyId ||
    "";

  const PendingContainer = onPendingClick ? "button" : "div";

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
            Edit
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
        <div className="sideLabel">Company</div>
        <div className="sideValue">{employerDisplay}</div>
      </div>

      {showAgency && agency ? (
        <div className="sideSection">
          <div className="sideLabel">Agency</div>
          <div className="sideValue">{agency}</div>
        </div>
      ) : null}

      {showPendingAmount ? (
        <PendingContainer
          className={`pendingBox ${onPendingClick ? "pendingBoxActionable" : ""}`}
          {...(onPendingClick ? { type: "button", onClick: onPendingClick } : {})}
        >
          <div className="pendingText">
            <div className="pendingLabel">Pending Amount</div>
            <div className="pendingValue">{pendingDisplayValue || `INR ${pendingAmount ?? 0}`}</div>
          </div>
          <div className="pendingChevron" aria-hidden="true">
            &gt;
          </div>
        </PendingContainer>
      ) : null}
    </div>
  );
}

export default ApplicantSummaryCard;

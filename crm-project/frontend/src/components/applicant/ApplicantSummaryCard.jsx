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
  const whatsappRaw =
    applicant?.whatsappNumber ||
    applicant?.personalDetails?.whatsappNumber ||
    applicant?.personalDetails?.whatsapp ||
    "";
  const whatsappDigits = String(whatsappRaw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  const whatsappLink = whatsappDigits ? `https://wa.me/${whatsappDigits}` : "";
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
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="waBtn"
              aria-label="Open WhatsApp"
              title="Open WhatsApp"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.15 1.6 5.96L0 24l6.31-1.65a11.85 11.85 0 0 0 5.75 1.47h.01c6.56 0 11.89-5.33 11.89-11.9 0-3.18-1.24-6.17-3.44-8.44ZM12.07 21.8h-.01a9.86 9.86 0 0 1-5.02-1.37l-.36-.22-3.74.98.99-3.64-.24-.38a9.85 9.85 0 0 1-1.51-5.27c0-5.45 4.43-9.89 9.9-9.89a9.84 9.84 0 0 1 7.01 2.9 9.81 9.81 0 0 1 2.89 6.99c0 5.45-4.44 9.9-9.9 9.9Zm5.43-7.42c-.3-.15-1.77-.87-2.05-.97-.28-.1-.49-.15-.69.15-.2.3-.79.97-.97 1.16-.18.2-.36.22-.66.07-.3-.15-1.29-.47-2.45-1.49-.9-.8-1.5-1.78-1.68-2.08-.18-.3-.02-.46.14-.61.13-.13.3-.33.45-.5.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.69-1.66-.95-2.28-.25-.6-.5-.52-.69-.53h-.59c-.2 0-.52.08-.8.37-.28.3-1.05 1.03-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.22 5.08 4.51.71.31 1.27.49 1.7.62.72.23 1.37.2 1.88.12.57-.08 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.41-.08-.13-.28-.2-.58-.35Z" />
              </svg>
            </a>
          ) : (
            <span className="waBtn waBtnDisabled" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.15 1.6 5.96L0 24l6.31-1.65a11.85 11.85 0 0 0 5.75 1.47h.01c6.56 0 11.89-5.33 11.89-11.9 0-3.18-1.24-6.17-3.44-8.44Z" />
              </svg>
            </span>
          )}
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

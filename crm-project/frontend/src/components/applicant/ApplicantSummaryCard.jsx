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
  const email = applicant?.email || applicant?.personalDetails?.email || "-";
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
  const InfoIcon = ({ type }) => {
    if (type === "phone") {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.78 19.78 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.78 19.78 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.64 2.62a2 2 0 0 1-.45 2.11L8.03 9.97a16 16 0 0 0 6 6l1.52-1.27a2 2 0 0 1 2.11-.45c.84.31 1.72.52 2.62.64A2 2 0 0 1 22 16.92Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    if (type === "email") {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.7" />
          <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    if (type === "address") {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    }
    if (type === "company") {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 21h18M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14M9 9h.01M9 12h.01M9 15h.01M15 9h.01M15 12h.01M15 15h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  };
  const ActionGlyph = ({ type }) => (
    <span className="sideActionGlyph" aria-hidden="true">
      <InfoIcon type={type} />
    </span>
  );

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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 12h.01M19 12h.01M5 12h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="sideSection sideSectionCard">
        <div className="sideLabelRow">
          <div className="sideSectionIcon"><InfoIcon type="phone" /></div>
          <div className="sideSectionMeta">
            <div className="sideLabel">Phone No.</div>
            <div className="sideValue">{phone || "-"}</div>
          </div>
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="waBtn"
              aria-label="Open WhatsApp"
              title="Open WhatsApp"
            >
              <ActionGlyph type="phone" />
            </a>
          ) : (
            <span className="waBtn waBtnDisabled" aria-hidden="true">
              <ActionGlyph type="phone" />
            </span>
          )}
        </div>
      </div>

      <div className="sideSection sideSectionCard">
        <div className="sideLabelRow">
          <div className="sideSectionIcon"><InfoIcon type="email" /></div>
          <div className="sideSectionMeta">
            <div className="sideLabel">Email</div>
            <div className="sideValue">{email}</div>
          </div>
          <span className="waBtn waBtnDisabled" aria-hidden="true">
            <ActionGlyph type="email" />
          </span>
        </div>
      </div>

      <div className="sideSection sideSectionCard">
        <div className="sideLabelRow">
          <div className="sideSectionIcon"><InfoIcon type="address" /></div>
          <div className="sideSectionMeta">
            <div className="sideLabel">Address</div>
            <div className="sideValue">{address}</div>
          </div>
        </div>
      </div>

      <div className="sideSection sideSectionCard">
        <div className="sideLabelRow">
          <div className="sideSectionIcon"><InfoIcon type="company" /></div>
          <div className="sideSectionMeta">
            <div className="sideLabel">Company</div>
            <div className="sideValue">{employerDisplay}</div>
          </div>
        </div>
      </div>

      {showAgency && agency ? (
        <div className="sideSection sideSectionCard">
          <div className="sideLabelRow">
            <div className="sideSectionIcon"><InfoIcon type="agency" /></div>
            <div className="sideSectionMeta">
              <div className="sideLabel">Agency</div>
              <div className="sideValue">{agency}</div>
            </div>
          </div>
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

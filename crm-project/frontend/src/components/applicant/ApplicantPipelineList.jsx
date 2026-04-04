import React from "react";

const PIPELINE_ITEMS = [
  { id: 1, key: "CREATED", title: "Candidate Created" },
  { id: 2, key: "DOCS", title: "Upload Documents" },
  { id: 3, key: "DISPATCH", title: "Dispatch Documents" },
  { id: 4, key: "CONTRACT", title: "Issue of the Contract" },
  { id: 5, key: "EMBASSY_APPOINTMENT_INITIATED", title: "Embassy Appointment Initiated" },
  { id: 6, key: "EMBASSY_APPOINTMENT_COMPLETED", title: "Embassy Appointment Completed" },
  { id: 7, key: "EMBASSY_INTERVIEW_INITIATED", title: "Embassy Interview Initiated" },
  { id: 8, key: "EMBASSY_INTERVIEW_COMPLETED", title: "Embassy Interview Completed" },
  { id: 9, key: "VISA_COLLECTION_INITIATED", title: "Visa Collection Initiated" },
  { id: 10, key: "VISA_COLLECTION_COMPLETED", title: "Visa Collection Completed" },
  { id: 11, key: "CANDIDATE_ARRIVED", title: "Candidate Arrived" }
];

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M16.667 5.833 8.333 14.167 3.333 9.167"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6.667 9.167V6.667A3.333 3.333 0 0 1 10 3.333a3.333 3.333 0 0 1 3.333 3.334v2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5.833 9.167h8.334c.92 0 1.666.746 1.666 1.666v5c0 .92-.746 1.667-1.666 1.667H5.833c-.92 0-1.666-.747-1.666-1.667v-5c0-.92.746-1.666 1.666-1.666Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m7.5 15 5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StatusIcon({ status }) {
  if (status === "warning") {
    return (
      <span className="pipeIcon pipeIconWarning" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
          <path d="M10 5.5v4.75M10 13.75h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (status === "danger") {
    return (
      <span className="pipeIcon pipeIconDanger" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
          <path d="M10 5.5v4.75M10 13.75h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span className="pipeIcon pipeIconCompleted" aria-hidden="true">
        <IconCheck />
      </span>
    );
  }

  if (status === "active") {
    return <span className="pipeIcon pipeIconActive" aria-hidden="true" />;
  }

  return (
    <span className="pipeIcon pipeIconLocked" aria-hidden="true">
      <IconLock />
    </span>
  );
}

function ApplicantPipelineList({
  currentStep = 1,
  totalSteps = 11,
  onUploadDocuments,
  canUploadDocuments,
  onCandidateAccountCreation,
  onHeaderAction,
  headerActionLabel = "",
  canHeaderAction = true,
  uploadButtonLabel = "Upload Documents",
  documentRowSubtitle = "",
  bannerText = "Complete the document uploading for admin to approve the candidate",
  documentRowStatus = ""
}) {
  return (
    <div className="pipelineCard">
      <div className="pipelineBanner">
        <div className="pipelineBannerLeft">
          <div className="pipelineStepPill">
            {Math.min(Number(currentStep) || 1, totalSteps)}/{totalSteps}
          </div>
          <div className="pipelineBannerText">{bannerText}</div>
        </div>

        {headerActionLabel ? (
          <button
            className="btn bannerBtn"
            type="button"
            onClick={onHeaderAction}
            disabled={!canHeaderAction}
          >
            {headerActionLabel}
          </button>
        ) : null}
      </div>

      <div className="pipelineHeaderRow">
        <h3 className="pipelineTitle">Complete pipeline</h3>
      </div>

      <div className="pipelineList">
        {PIPELINE_ITEMS.map((item) => {
          const status =
            item.id < currentStep ? "completed" : item.id === currentStep ? "active" : "locked";
          const resolvedStatus = item.id === 2 && documentRowStatus ? documentRowStatus : status;
          const showRowButton =
            item.id === 2 &&
            Number(currentStep) >= 2 &&
            resolvedStatus !== "completed" &&
            canUploadDocuments &&
            Boolean(uploadButtonLabel) &&
            typeof onUploadDocuments === "function";
          const isCandidateRow = item.id === 1;
          const canCandidateClick = typeof onCandidateAccountCreation === "function";
          const resolvedSubtitle = item.id === 2 ? documentRowSubtitle : "";

          return (
            <div key={item.key} className={`pipeRow pipeRow-${resolvedStatus}`}>
              <div className="pipeLeft">
                <StatusIcon status={resolvedStatus} />
                <div className="pipeText">
                  <div className="pipeTitle">{item.title}</div>
                  {resolvedSubtitle ? (
                    <div className={`pipeMeta pipeMeta-${resolvedStatus}`}>{resolvedSubtitle}</div>
                  ) : null}
                </div>
              </div>

              <div className="pipeRight">
                {showRowButton && (
                  <button className="btn btnPrimary btnSm" type="button" onClick={onUploadDocuments}>
                    {uploadButtonLabel}
                  </button>
                )}
                {isCandidateRow && canCandidateClick ? (
                  <button
                    className="pipeChevronBtn"
                    type="button"
                    onClick={onCandidateAccountCreation}
                    aria-label="Edit candidate account creation"
                  >
                    <IconChevron />
                  </button>
                ) : (
                  <span className="pipeChevron" aria-hidden="true">
                    <IconChevron />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ApplicantPipelineList;

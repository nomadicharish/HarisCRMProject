import React from "react";

const PIPELINE_ITEMS = [
  { id: 1, key: "CREATED", title: "Candidate account creation" },
  { id: 2, key: "DOCS", title: "Upload relevant documents for admin approval" },
  { id: 3, key: "DISPATCH", title: "Dispatch the documents" },
  { id: 4, key: "EMBASSY_TICKET", title: "Upload the embassy ticket" },
  { id: 5, key: "BIOMETRIC_1", title: "Upload the biometric strip" },
  { id: 6, key: "BIOMETRIC_2", title: "Upload the biometric strip" },
  { id: 7, key: "BIOMETRIC_3", title: "Upload the biometric strip" }
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
  totalSteps = 7,
  onUploadDocuments,
  canUploadDocuments,
  onCandidateAccountCreation
}) {
  return (
    <div className="pipelineCard">
      <div className="pipelineBanner">
        <div className="pipelineBannerLeft">
          <div className="pipelineStepPill">
            {Math.min(Number(currentStep) || 1, totalSteps)}/{totalSteps}
          </div>
          <div className="pipelineBannerText">Complete the document uploading for admin to approve the candidate</div>
        </div>

        <button
          className="btn bannerBtn"
          type="button"
          onClick={onUploadDocuments}
          disabled={!canUploadDocuments}
        >
          Upload Documents
        </button>
      </div>

      <div className="pipelineHeaderRow">
        <h3 className="pipelineTitle">Complete pipeline</h3>
        <button className="pipelineLink" type="button" onClick={onUploadDocuments}>
          View all Documents
        </button>
      </div>

      <div className="pipelineList">
        {PIPELINE_ITEMS.map((item) => {
          const status =
            item.id < currentStep ? "completed" : item.id === currentStep ? "active" : "locked";
          const showRowButton = item.id === 2 && status !== "completed";
          const isCandidateRow = item.id === 1;
          const canCandidateClick = typeof onCandidateAccountCreation === "function";

          return (
            <div key={item.key} className={`pipeRow pipeRow-${status}`}>
              <div className="pipeLeft">
                <StatusIcon status={status} />
                <div className="pipeText">
                  <div className="pipeTitle">{item.title}</div>
                </div>
              </div>

              <div className="pipeRight">
                {showRowButton && (
                  <button className="btn btnPrimary btnSm" type="button" onClick={onUploadDocuments}>
                    Upload Documents
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

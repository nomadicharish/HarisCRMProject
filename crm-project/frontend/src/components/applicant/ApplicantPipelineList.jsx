import React from "react";

const PIPELINE_ITEMS = [
  { id: 1, key: "CREATED", title: "Candidate Created" },
  { id: 2, key: "DOCS", title: "Upload Documents" },
  { id: 3, key: "DISPATCH", title: "Dispatch Documents" },
  { id: 4, key: "CONTRACT", title: "Issue of the Contract" },
  { id: 5, key: "EMBASSY_APPOINTMENT_INITIATED", title: "Embassy Appointment Initiated" },
  { id: 6, key: "EMBASSY_APPOINTMENT_COMPLETED", title: "Embassy Appointment Completed" },
  { id: 7, key: "EMBASSY_INTERVIEW_INITIATED", title: "Initiate Embassy Interview" },
  { id: 8, key: "EMBASSY_INTERVIEW_COMPLETED", title: "Embassy Interview Completed" },
  { id: 9, key: "VISA_COLLECTION_INITIATED", title: "Visa Collection Initiated" },
  { id: 10, key: "VISA_COLLECTION_COMPLETED", title: "Visa Collection Completed" },
  { id: 11, key: "CANDIDATE_ARRIVED", title: "Candidate Arrived" }
];

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M16.667 5.833 8.333 14.167 3.333 9.167" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6.667 8.333V6.667a3.333 3.333 0 1 1 6.666 0v1.666M5.833 8.333h8.334c.46 0 .833.373.833.834v5.833a.833.833 0 0 1-.833.833H5.833A.833.833 0 0 1 5 15V9.167c0-.461.373-.834.833-.834Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m7.5 15 5-5-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function StatusIcon({ status }) {
  if (status === "warning") {
    return (
      <span className="pipeIcon pipeIconActive" aria-hidden="true">
        <img src="/mdi_tick-circle.png" alt="" className="pipeIconImg" />
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
    return (
      <span className="pipeIcon pipeIconActive" aria-hidden="true">
        <img src="/mdi_tick-circle.png" alt="" className="pipeIconImg" />
      </span>
    );
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
  onCandidateAccountCreation,
  onDispatchDocuments,
  onContractAction,
  onEmbassyAppointmentAction,
  onBiometricSlipAction,
  onEmbassyInterviewAction,
  onInterviewCompletionAction,
  onVisaCollectionAction,
  onVisaCompletionAction,
  onCandidateArrivalAction,
  onHeaderAction,
  headerActionLabel = "",
  canHeaderAction = true,
  activeStepActionLabel = "",
  canActiveStepAction = true,
  documentRowSubtitle = "",
  dispatchRowTitle = "Dispatch Documents",
  contractRowTitle = "Issue of the Contract",
  contractRowSubtitle = "",
  contractRowStatus = "",
  embassyAppointmentRowTitle = "Embassy Appointment Initiated",
  embassyAppointmentCompletedRowTitle = "Embassy Appointment Completed",
  embassyAppointmentCompletedRowSubtitle = "",
  embassyAppointmentCompletedRowStatus = "",
  embassyInterviewRowTitle = "Initiate Embassy Interview",
  embassyInterviewRowSubtitle = "",
  embassyInterviewCompletedRowTitle = "Embassy Interview Completed",
  embassyInterviewCompletedRowSubtitle = "",
  embassyInterviewCompletedRowStatus = "",
  visaCollectionRowTitle = "Initiate Visa Collection",
  visaCollectionRowSubtitle = "",
  visaCollectionRowStatus = "",
  visaCollectionCompletedRowTitle = "Visa Collection Completed",
  visaCollectionCompletedRowSubtitle = "",
  visaCollectionCompletedRowStatus = "",
  candidateArrivalRowTitle = "Arrival of Candidate",
  candidateArrivalRowSubtitle = "",
  bannerText = "Complete the document uploading for admin to approve the candidate",
  documentRowStatus = ""
}) {
  const resolvedCurrentStep = Number(currentStep || 1);

  return (
    <div className="pipelineCard">
      <div className="pipelineBannerCard">
        <div className="pipelineBanner">
          <div className="pipelineBannerLeft">
            <div className="pipelineStepPill">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="pipelineBannerText">{bannerText}</div>
          </div>

          {headerActionLabel ? (
            <button className="btn bannerBtn" type="button" onClick={onHeaderAction} disabled={!canHeaderAction}>
              {headerActionLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="pipelineHeaderRow">
        <h3 className="pipelineTitle">Application Pipeline</h3>
      </div>

      <div className="pipelineListCard">
        <div className="pipelineList">
        {PIPELINE_ITEMS.map((item) => {
          const status =
            item.id < resolvedCurrentStep ? "completed" : item.id === resolvedCurrentStep ? "active" : "locked";
          const resolvedStatus =
            item.id === 2 && documentRowStatus
              ? documentRowStatus
              : item.id === 4 && contractRowStatus
              ? contractRowStatus
              : item.id === 6 && embassyAppointmentCompletedRowStatus
              ? embassyAppointmentCompletedRowStatus
              : item.id === 8 && embassyInterviewCompletedRowStatus
              ? embassyInterviewCompletedRowStatus
              : item.id === 9 && visaCollectionRowStatus
              ? visaCollectionRowStatus
              : item.id === 10 && visaCollectionCompletedRowStatus
              ? visaCollectionCompletedRowStatus
              : status;
          const rowAction =
            item.id === 1
              ? onCandidateAccountCreation
              : item.id === 2
              ? onUploadDocuments
              : item.id === 3
              ? onDispatchDocuments
              : item.id === 4
              ? onContractAction
              : item.id === 5
              ? onEmbassyAppointmentAction
              : item.id === 6
              ? onBiometricSlipAction
              : item.id === 7
              ? onEmbassyInterviewAction
              : item.id === 8
              ? onInterviewCompletionAction
              : item.id === 9
              ? onVisaCollectionAction
              : item.id === 10
              ? onVisaCompletionAction
              : item.id === 11
              ? onCandidateArrivalAction
              : undefined;
          const canRowClick = typeof rowAction === "function";
          const isCompletedRow = resolvedStatus === "completed";
          const isActiveRow = item.id === resolvedCurrentStep;
          const resolvedSubtitle =
            item.id === 2
              ? documentRowSubtitle
              : item.id === 4
              ? contractRowSubtitle
              : item.id === 6
              ? embassyAppointmentCompletedRowSubtitle
              : item.id === 7
              ? embassyInterviewRowSubtitle
              : item.id === 8
              ? embassyInterviewCompletedRowSubtitle
              : item.id === 9
              ? visaCollectionRowSubtitle
              : item.id === 10
              ? visaCollectionCompletedRowSubtitle
              : item.id === 11
              ? candidateArrivalRowSubtitle
              : "";
          const resolvedTitle =
            item.id === 3
              ? dispatchRowTitle
              : item.id === 4
              ? contractRowTitle
              : item.id === 5
              ? embassyAppointmentRowTitle
              : item.id === 6
              ? embassyAppointmentCompletedRowTitle
              : item.id === 7
              ? embassyInterviewRowTitle
              : item.id === 8
              ? embassyInterviewCompletedRowTitle
              : item.id === 9
              ? visaCollectionRowTitle
              : item.id === 10
              ? visaCollectionCompletedRowTitle
              : item.id === 11
              ? candidateArrivalRowTitle
              : item.title;
          const showActiveButton =
            isActiveRow &&
            activeStepActionLabel &&
            typeof onHeaderAction === "function" &&
            Boolean(canActiveStepAction);
          const showCompletedArrow = isCompletedRow && canRowClick;
          const isLastRow = item.id === totalSteps;

          return (
            <div key={item.key} className={`pipeRow pipeRow-${resolvedStatus}`}>
              <div className="pipeRail" aria-hidden="true">
                <div className="pipeStepNumber">{item.id}</div>
                {!isLastRow ? <div className={`pipeConnector pipeConnector-${resolvedStatus}`} /> : null}
              </div>

              <div className="pipeLeft">
                <StatusIcon status={resolvedStatus} />
                <div className="pipeText">
                  <div className="pipeTitle">{resolvedTitle}</div>
                  {resolvedSubtitle ? (
                    <div className={`pipeMeta pipeMeta-${resolvedStatus}`}>{resolvedSubtitle}</div>
                  ) : null}
                </div>
              </div>

              <div className="pipeRight">
                {showActiveButton ? (
                  <button className="btn bannerBtn btnSm pipeStageActionBtn" type="button" onClick={onHeaderAction}>
                    {activeStepActionLabel}
                  </button>
                ) : null}

                {showCompletedArrow ? (
                  <button
                    className="pipeChevronBtn"
                    type="button"
                    onClick={rowAction}
                    aria-label={`Open ${resolvedTitle}`}
                  >
                    <IconChevron />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

export default ApplicantPipelineList;

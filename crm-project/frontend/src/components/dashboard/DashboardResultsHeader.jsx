import React from "react";

function DashboardResultsHeader({
  headerText,
  isRefreshing,
  showHeaderAction,
  onOpenCurrentAction,
  currentActionLabel,
  showBulkDispatchAction = false,
  onOpenBulkDispatch,
  showContractUploadAction = false,
  onOpenContractUpload,
  showExportApplicantsAction = false,
  onExportApplicants,
  isExportingApplicants = false,
  showViewAllApplicants = false,
  onViewAllApplicants
}) {
  const hasRightActions = showHeaderAction || showBulkDispatchAction || showContractUploadAction || showExportApplicantsAction || showViewAllApplicants;

  return (
    <div className="dashboardResultsHeader">
      <div>
        <div className="dashboardResultsCount">
          <span>{headerText}</span>
        </div>
        {isRefreshing ? <div className="dashboardResultsSync">Syncing latest data...</div> : null}
      </div>

      {hasRightActions ? (
        <div className={showHeaderAction ? "dashboardActionGroup" : "dashboardHeaderSoloAction"}>
          {showViewAllApplicants ? (
            <button
              type="button"
              className="dashboardViewAllApplicants"
              onClick={onViewAllApplicants}
            >
              View All Applicants
            </button>
          ) : null}

          {showHeaderAction ? (
            <button type="button" className="dashboardSecondaryBtn" onClick={onOpenCurrentAction}>
              + {currentActionLabel}
            </button>
          ) : null}

          {showBulkDispatchAction ? (
            <button type="button" className="dashboardSecondaryBtn" onClick={onOpenBulkDispatch}>
              Add Bulk Dispatch
            </button>
          ) : null}

          {showContractUploadAction ? (
            <button type="button" className="dashboardSecondaryBtn" onClick={onOpenContractUpload}>
              Contract Upload
            </button>
          ) : null}

          {showExportApplicantsAction ? (
            <button type="button" className="dashboardSecondaryBtn" onClick={onExportApplicants} disabled={isExportingApplicants}>
              {isExportingApplicants ? "Exporting..." : "Export to Excel"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default DashboardResultsHeader;

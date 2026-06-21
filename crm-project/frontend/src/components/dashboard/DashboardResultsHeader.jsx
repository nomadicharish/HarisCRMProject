import React from "react";

function DashboardResultsHeader({
  headerText,
  isRefreshing,
  showHeaderAction,
  onOpenCurrentAction,
  currentActionLabel,
  showExportAction,
  onExport,
  exportLoading,
  showViewAllApplicants = false,
  onViewAllApplicants
}) {
  const hasRightActions = showHeaderAction || showViewAllApplicants;

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
              View all applicants
            </button>
          ) : null}

          {showHeaderAction ? (
            <button type="button" className="dashboardSecondaryBtn" onClick={onOpenCurrentAction}>
              + {currentActionLabel}
            </button>
          ) : null}

          {showHeaderAction && showExportAction ? (
            <button type="button" className="dashboardPrimaryBtn" onClick={onExport} disabled={exportLoading}>
              {exportLoading ? "Exporting..." : "Export to Excel"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default DashboardResultsHeader;

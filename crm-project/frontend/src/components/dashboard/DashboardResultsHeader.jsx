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
  return (
    <div className="dashboardResultsHeader">
      <div>
        <div className="dashboardResultsCount">
          <span>{headerText}</span>
          {showViewAllApplicants ? (
            <button
              type="button"
              className="dashboardViewAllApplicants"
              onClick={onViewAllApplicants}
            >
              View all applicants
            </button>
          ) : null}
        </div>
        {isRefreshing ? <div className="dashboardResultsSync">Syncing latest data...</div> : null}
      </div>

      {showHeaderAction ? (
        <div className="dashboardActionGroup">
          <button type="button" className="dashboardSecondaryBtn" onClick={onOpenCurrentAction}>
            + {currentActionLabel}
          </button>

          {showExportAction ? (
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

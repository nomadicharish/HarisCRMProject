import React from "react";

function DashboardResultsHeader({
  headerText,
  isRefreshing,
  showHeaderAction,
  activeTab,
  isSuperUser,
  onShowCountryManager,
  onOpenCurrentAction,
  currentActionLabel,
  showExportAction,
  onExport,
  exportLoading
}) {
  return (
    <div className="dashboardResultsHeader">
      <div>
        <div className="dashboardResultsCount">{headerText}</div>
        {isRefreshing ? <div className="dashboardResultsSync">Syncing latest data...</div> : null}
      </div>

      {showHeaderAction ? (
        <div className="dashboardActionGroup">
          {activeTab === "companies" && isSuperUser ? (
            <button
              type="button"
              className="dashboardSecondaryBtn"
              onClick={onShowCountryManager}
            >
              Add/Update Country
            </button>
          ) : null}

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

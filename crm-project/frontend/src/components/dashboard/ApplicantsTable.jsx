import React from "react";
import VirtualizedRows from "./VirtualizedRows";

function ApplicantsTable({
  rows = [],
  isEmployer = false,
  onOpenApplicant,
  formatPendingAmount
}) {
  const gridTemplateColumns = isEmployer ? "2fr 2fr 2fr" : "2fr 2fr 1.5fr 1.5fr";

  if (!rows.length) {
    return (
      <table className="dashboardTable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Company</th>
            {!isEmployer ? <th>Payment Status</th> : null}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={isEmployer ? 3 : 4} className="dashboardEmptyState">
              No applicants found for the selected filters.
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (rows.length < 40) {
    return (
      <table className="dashboardTable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Company</th>
            {!isEmployer ? <th>Payment Status</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((applicant) => {
            const fullName =
              applicant.fullName ||
              [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
              "Applicant";

            return (
              <tr
                key={applicant.id}
                className="dashboardTableRow"
                onClick={() => onOpenApplicant(applicant.id)}
              >
                <td>
                  <div className="dashboardNameCell">
                    <span className="dashboardNameText">{fullName}</span>
                    {applicant.attentionRequired ? <span className="dashboardWarningIcon">!</span> : null}
                  </div>
                </td>
                <td>
                  <span className="dashboardStatusPill">
                    {applicant.statusText || applicant.stageLabel || "Candidate Created"}
                  </span>
                </td>
                <td>{applicant.companyName || "-"}</td>
                {!isEmployer ? (
                  <td>
                    {applicant.payment?.pendingInr > 0
                      ? `Pending ${formatPendingAmount(applicant.payment.pendingInr)}`
                      : "Completed"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="dashboardVirtualTable">
      <div className="dashboardVirtualHeader" style={{ gridTemplateColumns }}>
        <div>Name</div>
        <div>Status</div>
        <div>Company</div>
        {!isEmployer ? <div>Payment Status</div> : null}
      </div>
      <VirtualizedRows
        items={rows}
        rowHeight={58}
        height={460}
        renderItem={(applicant) => {
          const fullName =
            applicant.fullName ||
            [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
            "Applicant";
          return (
            <div
              className="dashboardVirtualRow"
              style={{ gridTemplateColumns }}
              onClick={() => onOpenApplicant(applicant.id)}
              role="button"
              tabIndex={0}
            >
              <div className="dashboardNameCell">
                <span className="dashboardNameText">{fullName}</span>
                {applicant.attentionRequired ? <span className="dashboardWarningIcon">!</span> : null}
              </div>
              <div>
                <span className="dashboardStatusPill">
                  {applicant.statusText || applicant.stageLabel || "Candidate Created"}
                </span>
              </div>
              <div>{applicant.companyName || "-"}</div>
              {!isEmployer ? (
                <div>
                  {applicant.payment?.pendingInr > 0
                    ? `Pending ${formatPendingAmount(applicant.payment.pendingInr)}`
                    : "Completed"}
                </div>
              ) : null}
            </div>
          );
        }}
      />
    </div>
  );
}

export default ApplicantsTable;

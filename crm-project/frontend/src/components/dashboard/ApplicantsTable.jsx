import React from "react";
import VirtualizedRows from "./VirtualizedRows";

export function resolveApplicantWorkflowMeta(applicant = {}) {
  const statusText = applicant.statusText || applicant.applicantBannerStatus || applicant.stageLabel || "Candidate Created";
  const parts = String(statusText).split(".").map((item) => item.trim()).filter(Boolean);
  const workflowStatus = String(applicant.workflowStatus || applicant.stageStatus || "").toLowerCase();
  const completed = workflowStatus === "completed" || Number(applicant.stage || 0) >= 13;
  const attentionRequired = Boolean(applicant.attentionRequired) || workflowStatus === "attention_required";

  return {
    title: parts[0] || statusText,
    subtitle: parts.slice(1).join(". ") || "",
    pillLabel: completed ? "Completed" : attentionRequired ? "Attention Required" : "In Progress",
    pillClass: completed
      ? "dashboardStatusPillSuccess"
      : attentionRequired
      ? "dashboardStatusPillWarning"
      : "dashboardStatusPillInfo",
    completed,
    attentionRequired
  };
}

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
            const workflow = resolveApplicantWorkflowMeta(applicant);
            const pendingAmount = applicant.payment?.pendingInr ?? applicant.payment?.pending ?? 0;
            const paymentPending = Number(pendingAmount || 0) > 0;
            const isCandidateApprovalPending =
              Number(applicant.stage || 1) === 1 && String(applicant.approvalStatus || "").toLowerCase() !== "approved";

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
                  <div className="dashboardStatusCell">
                    <span className={`dashboardStatusPill ${workflow.pillClass}`}>
                      {workflow.pillLabel}
                    </span>
                    <span className="dashboardStatusMetaTitle">{workflow.title}</span>
                    {workflow.subtitle ? <span className="dashboardStatusMetaSubtitle">{workflow.subtitle}</span> : null}
                  </div>
                </td>
                <td>{applicant.companyName || "-"}</td>
                {!isEmployer ? (
                  <td>
                    {isCandidateApprovalPending ? (
                      "-"
                    ) : (
                      <div className="dashboardStatusCell">
                        <span className={`dashboardStatusPill ${paymentPending ? "dashboardPaymentPillPending" : "dashboardPaymentPillSuccess"}`}>
                          {paymentPending ? "Pending" : "Completed"}
                        </span>
                        {paymentPending ? (
                          <span className="dashboardPaymentAmount">
                            {formatPendingAmount(pendingAmount, applicant.payment?.currency)}
                          </span>
                        ) : null}
                      </div>
                    )}
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
          const workflow = resolveApplicantWorkflowMeta(applicant);
          const pendingAmount = applicant.payment?.pendingInr ?? applicant.payment?.pending ?? 0;
          const paymentPending = Number(pendingAmount || 0) > 0;
          const isCandidateApprovalPending =
            Number(applicant.stage || 1) === 1 && String(applicant.approvalStatus || "").toLowerCase() !== "approved";
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
              <div className="dashboardStatusCell">
                <span className={`dashboardStatusPill ${workflow.pillClass}`}>
                  {workflow.pillLabel}
                </span>
                <span className="dashboardStatusMetaTitle">{workflow.title}</span>
                {workflow.subtitle ? <span className="dashboardStatusMetaSubtitle">{workflow.subtitle}</span> : null}
              </div>
              <div>{applicant.companyName || "-"}</div>
              {!isEmployer ? (
                <div className="dashboardStatusCell">
                  {isCandidateApprovalPending ? (
                    "-"
                  ) : (
                    <>
                      <span className={`dashboardStatusPill ${paymentPending ? "dashboardPaymentPillPending" : "dashboardPaymentPillSuccess"}`}>
                        {paymentPending ? "Pending" : "Completed"}
                      </span>
                      {paymentPending ? (
                        <span className="dashboardPaymentAmount">
                          {formatPendingAmount(pendingAmount, applicant.payment?.currency)}
                        </span>
                      ) : null}
                    </>
                  )}
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

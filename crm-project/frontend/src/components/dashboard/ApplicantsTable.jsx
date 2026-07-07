import React from "react";
import VirtualizedRows from "./VirtualizedRows";

export function resolveApplicantWorkflowMeta(applicant = {}) {
  const statusText =
    applicant.applicantBannerStatus ||
    applicant.statusText ||
    applicant.stageLabel ||
    "Candidate Created";
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
  showAgencyColumn = false,
  onOpenApplicant,
  onQuickPrint,
  formatPendingAmount
}) {
  const gridTemplateColumns = isEmployer
    ? "2fr 2fr 2fr 1fr"
    : showAgencyColumn
    ? "2fr 2fr 1.4fr 1.2fr 1.5fr"
    : "2fr 2fr 1.5fr 1.5fr";
  const tableColumnCount = isEmployer ? 4 : showAgencyColumn ? 5 : 4;

  if (!rows.length) {
    return (
      <table className="dashboardTable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Company</th>
            {showAgencyColumn ? <th>Agent</th> : null}
            {isEmployer ? <th>Actions</th> : null}
            {!isEmployer ? <th>Payment Status</th> : null}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={tableColumnCount} className="dashboardEmptyState">
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
              {showAgencyColumn ? <th>Agent</th> : null}
              {isEmployer ? <th>Actions</th> : null}
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
            const verificationPending =
              Boolean(applicant.payment?.hasPendingAcknowledgement) ||
              Boolean(applicant.payment?.hasPendingConfirmation);
            const verificationText =
              applicant.payment?.hasPendingAcknowledgement && applicant.payment?.hasPendingConfirmation
                ? "Acknowledgement & confirmation pending"
                : applicant.payment?.hasPendingAcknowledgement
                ? "Acknowledgement pending"
                : applicant.payment?.hasPendingConfirmation
                ? "Confirmation pending"
                : "";
            const isCandidateApprovalPending =
              Number(applicant.stage || 1) === 1 && String(applicant.approvalStatus || "").toLowerCase() !== "approved";
            const canQuickPrint =
              isEmployer &&
              Number(applicant.stage || 1) === 12 &&
              String(workflow.title || "").toLowerCase() === "candidate arrival pending";

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
                {showAgencyColumn ? <td>{applicant.agencyName || "-"}</td> : null}
                {isEmployer ? (
                  <td>
                    {canQuickPrint ? (
                      <button
                        type="button"
                        className="dashboardQuickPrintBtn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onQuickPrint?.(applicant);
                        }}
                      >
                        Quick Print
                      </button>
                    ) : "-"}
                  </td>
                ) : null}
                {!isEmployer ? (
                  <td>
                    {isCandidateApprovalPending ? (
                      "-"
                    ) : (
                      <div className="dashboardStatusCell">
                        <span className={`dashboardStatusPill ${paymentPending || verificationPending ? "dashboardPaymentPillPending" : "dashboardPaymentPillSuccess"}`}>
                          {verificationPending ? "Review Pending" : paymentPending ? "Pending" : "Completed"}
                        </span>
                        {paymentPending ? (
                          <span className="dashboardPaymentAmount">
                            {formatPendingAmount(pendingAmount, applicant.payment?.currency)}
                          </span>
                        ) : null}
                        {verificationText ? <span className="dashboardPaymentAmount">{verificationText}</span> : null}
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
        {showAgencyColumn ? <div>Agent</div> : null}
        {isEmployer ? <div>Actions</div> : null}
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
          const verificationPending =
            Boolean(applicant.payment?.hasPendingAcknowledgement) ||
            Boolean(applicant.payment?.hasPendingConfirmation);
          const verificationText =
            applicant.payment?.hasPendingAcknowledgement && applicant.payment?.hasPendingConfirmation
              ? "Acknowledgement & confirmation pending"
              : applicant.payment?.hasPendingAcknowledgement
              ? "Acknowledgement pending"
              : applicant.payment?.hasPendingConfirmation
              ? "Confirmation pending"
              : "";
          const isCandidateApprovalPending =
            Number(applicant.stage || 1) === 1 && String(applicant.approvalStatus || "").toLowerCase() !== "approved";
          const canQuickPrint =
            isEmployer &&
            Number(applicant.stage || 1) === 12 &&
            String(workflow.title || "").toLowerCase() === "candidate arrival pending";
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
              {showAgencyColumn ? <div>{applicant.agencyName || "-"}</div> : null}
              {isEmployer ? (
                <div>
                  {canQuickPrint ? (
                    <button
                      type="button"
                      className="dashboardQuickPrintBtn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onQuickPrint?.(applicant);
                      }}
                    >
                      Quick Print
                    </button>
                  ) : "-"}
                </div>
              ) : null}
              {!isEmployer ? (
                <div className="dashboardStatusCell">
                  {isCandidateApprovalPending ? (
                    "-"
                  ) : (
                    <>
                      <span className={`dashboardStatusPill ${paymentPending || verificationPending ? "dashboardPaymentPillPending" : "dashboardPaymentPillSuccess"}`}>
                        {verificationPending ? "Review Pending" : paymentPending ? "Pending" : "Completed"}
                      </span>
                      {paymentPending ? (
                        <span className="dashboardPaymentAmount">
                          {formatPendingAmount(pendingAmount, applicant.payment?.currency)}
                        </span>
                      ) : null}
                      {verificationText ? <span className="dashboardPaymentAmount">{verificationText}</span> : null}
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

import React from "react";
import "../../styles/applicantContract.css";
import "../../styles/applicantsDashboard.css";

function ConfirmActionModal({
  title,
  message,
  confirmLabel = "Delete",
  isBusy = false,
  busyLabel = "Deleting...",
  confirmClassName = "btn btnDanger",
  onConfirm,
  onClose
}) {
  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard dashboardConfirmModal">
        <div className="dashboardModalHeader">
          <h3 className="dashboardModalTitle">{title}</h3>
          <button type="button" className="dashboardModalCloseBtn appCloseButton" onClick={onClose}>
            X
          </button>
        </div>

        <div className="dashboardConfirmMessage">{message}</div>

        <div className="contractActionRow dashboardConfirmActions">
          <button type="button" className="btn btnSecondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          <button type="button" className={confirmClassName} onClick={onConfirm} disabled={isBusy}>
            {isBusy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmActionModal;

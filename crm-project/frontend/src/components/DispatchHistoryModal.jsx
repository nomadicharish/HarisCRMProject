import React from "react";
import DispatchSection from "./DispatchSection";
import "../styles/applicantContract.css";

function DispatchHistoryModal({ applicantId, open, onClose }) {
  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard dispatchHistoryModalCard">
        <div className="workflowModalTopBar">
          <div className="workflowModalTopBarTitle">Dispatch History</div>
          <button type="button" className="workflowModalCloseBtn" onClick={onClose}>
            x
          </button>
        </div>

        <DispatchSection
          applicantId={applicantId}
          canEdit={false}
          showTitle={false}
          compact={true}
          truncateTrackingUrl={true}
        />
      </div>
    </div>
  );
}

export default DispatchHistoryModal;

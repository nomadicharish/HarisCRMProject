import React from "react";
import DispatchSection from "./DispatchSection";
import "../styles/applicantContract.css";

function DispatchHistoryModal({ applicantId, open, onClose }) {
  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard dispatchHistoryModalCard">
        <div className="dispatchModalHero">
          <div className="dispatchModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M3 7h11v8H3zM14 10h3l4 4v1h-7zM7.5 19a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3ZM17.5 19a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="dispatchModalHeroText">
            <h3 className="dashboardModalTitle">Dispatch History</h3>
            <div className="dispatchModalSubtitle">View all dispatch notes and tracking details.</div>
          </div>
          <button type="button" className="dashboardModalCloseBtn dispatchModalCloseBtn" onClick={onClose}>
            x
          </button>
        </div>

        <DispatchSection
          applicantId={applicantId}
          canEdit={false}
          showTitle={false}
          compact={true}
          truncateTrackingUrl={true}
          showHistoryHeader={false}
        />

        <div className="dispatchModalFooter">
          <button type="button" className="btn btnSecondary dispatchModalFooterBtn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DispatchHistoryModal;

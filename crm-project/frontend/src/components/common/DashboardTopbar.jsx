import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../../utils/auth";
import "../../styles/applicantsDashboard.css";

const DOWN_ICON_SRC = "/down.png";
const HAND_ICON_SRC = "/hand.png";

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "U";
  return parts.map((part) => part[0]).join("").toUpperCase();
}

function DashboardTopbar({ user, showTabs = false, tabs = [], activeTab = "", onTabChange }) {
  const navigate = useNavigate();
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const userInitials = useMemo(() => getInitials(user?.name || "User"), [user?.name]);

  const handleLogout = async () => {
    setShowProfilePanel(false);
    await clearSession({ redirectTo: "/login" });
  };

  return (
    <>
      <div className="dashboardTopbar">
        <button type="button" className="dashboardBrand dashboardBrandBtn" onClick={() => navigate("/dashboard")}>
          <span className="dashboardBrandIcon" aria-hidden="true">
            TA
          </span>
          <span>Talent Acquisition</span>
        </button>

        {showTabs ? (
          <div className="dashboardTabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`dashboardTab ${activeTab === tab.key ? "dashboardTabActive" : ""}`}
                onClick={() => onTabChange?.(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="dashboardTabs dashboardTabsHidden" />
        )}

        <div className="dashboardTopbarRight">
          <button type="button" className="dashboardTopbarIconBtn" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="dashboardTopbarIconBtn dashboardTopbarBellBtn" aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.42V11a6 6 0 1 0-12 0v3.18c0 .53-.21 1.04-.59 1.42L4 17h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="dashboardTopbarDot" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dashboardUserMenuBtn"
            onClick={() => setShowProfilePanel((value) => !value)}
          >
            <span className="dashboardUserAvatar">{userInitials}</span>
            <div className="dashboardUserName">{user?.role === "SUPER_USER" ? "Super User" : user?.name || "User"}</div>
            <img src={DOWN_ICON_SRC} alt="" className="dashboardInlineIcon dashboardUserChevronImg" />
          </button>
        </div>
      </div>

      {showProfilePanel ? (
        <>
          <div className="dashboardProfileBackdrop" onClick={() => setShowProfilePanel(false)} />
          <div className="dashboardProfilePanel">
            <div className="dashboardProfilePanelBody">
              <div className="dashboardProfilePanelClose">
                <button
                  type="button"
                  className="dashboardProfilePanelCloseBtn"
                  onClick={() => setShowProfilePanel(false)}
                >
                  x
                </button>
              </div>
              <div className="dashboardProfilePanelAvatar">{userInitials}</div>
              <div className="dashboardProfilePanelGreeting">
                Hey, <span className="dashboardProfilePanelName">{user?.name || "User"}</span>{" "}
                <img src={HAND_ICON_SRC} alt="" className="dashboardInlineIcon dashboardHandIcon" />
              </div>
              <div className="dashboardProfilePanelActions">
                <button
                  type="button"
                  className="dashboardPaginationBtn dashboardProfilePanelBtn"
                  onClick={() => {
                    setShowProfilePanel(false);
                    navigate("/settings");
                  }}
                >
                  Settings
                </button>
                <button type="button" className="dashboardProfilePanelSignout" onClick={handleLogout}>
                  Signout
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export default DashboardTopbar;

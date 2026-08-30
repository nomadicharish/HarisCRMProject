import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";
import { getStoredUser } from "../../utils/auth";
import "../../styles/notifications.css";

function NotificationIcon({ type = "document" }) {
  if (type === "fingerprint") {
    return <svg viewBox="0 0 24 24"><path d="M12 11v3M8.5 13c0-2.4 1.5-4 3.5-4s3.5 1.6 3.5 4v2.5M6 14c0-4.4 2.7-7 6-7s6 2.6 6 7M9 18c.6 1.5 1.6 2.4 3 2.4s2.4-.9 3-2.4M4 11.5C4.8 7 8 4.5 12 4.5s7.2 2.5 8 7" /></svg>;
  }
  if (type === "calendar") {
    return <svg viewBox="0 0 24 24"><path d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" /></svg>;
  }
  if (type === "wallet") {
    return <svg viewBox="0 0 24 24"><path d="M4 7h15a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7.8A2.8 2.8 0 0 1 5.8 5H18M16 13h5M17 13.5h.1" /></svg>;
  }
  if (type === "shield") {
    return <svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></svg>;
  }
  if (type === "send") {
    return <svg viewBox="0 0 24 24"><path d="m21 3-8 18-3-8-8-3 19-7Z" /><path d="m10 13 11-10" /></svg>;
  }
  if (type === "building") {
    return <svg viewBox="0 0 24 24"><path d="M4 21h16M6 21V9l6-4 6 4v12M9 21v-5h6v5M9 11h.1M15 11h.1" /></svg>;
  }
  return <svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7V3Z" /><path d="M14 3v5h5M10 13h6M10 17h4" /></svg>;
}

function BellSvg() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function openNotification(navigate, item) {
  if (item?.navigationTarget === "common-documents") {
    navigate("/settings?section=common-documents");
    return;
  }
  const params = new URLSearchParams();
  params.set("tab", "applicants");
  if (item?.applicantIds?.length) params.set("notificationApplicants", item.applicantIds.join(","));
  if (item?.title) params.set("notificationTitle", item.title);
  navigate(`/dashboard?${params.toString()}`);
}

function sanitizeNotificationMessage(item = {}, userRole = "") {
  const message = item?.message || "";
  if (userRole !== "EMPLOYER" || !item?.actorName || !message) return message;
  const escapedActorName = item.actorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sanitized = message.replace(new RegExp(`^${escapedActorName}\\s+`), "");
  return sanitized ? `${sanitized.charAt(0).toUpperCase()}${sanitized.slice(1)}` : sanitized;
}

export function NotificationListItem({ item, onOpen, spacious = false, userRole = "" }) {
  const displayMessage = sanitizeNotificationMessage(item, userRole);
  return (
    <button
      type="button"
      className={`notificationItem ${item.unread ? "notificationItemUnread" : ""} ${spacious ? "notificationItemFull" : ""}`}
      onClick={() => onOpen(item)}
    >
      <span className="notificationUnreadDot" />
      <span className={`notificationGlyph notificationGlyph-${item.tone || "blue"}`}>
        <NotificationIcon type={item.icon} />
      </span>
      <span className="notificationCopy">
        <strong>{item.title || "Notification"}</strong>
        <span>{displayMessage}</span>
      </span>
      {spacious ? <span className="notificationChevron">›</span> : null}
    </button>
  );
}

function NotificationBell() {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const userRole = getStoredUser()?.role || "";
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await API.get("/notifications/unread-count");
      setUnreadCount(Number(response.data?.unreadCount || 0));
    } catch (error) {
      if (error?.code !== "ERR_CANCELED") console.error(error);
    }
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(loadUnreadCount, 0);
    const intervalId = window.setInterval(loadUnreadCount, 60_000);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    API.get("/notifications", { params: { limit: 5 }, signal: controller.signal })
      .then((response) => {
        setNotifications(Array.isArray(response.data?.items) ? response.data.items : []);
        setUnreadCount(Number(response.data?.unreadCount || 0));
      })
      .catch((error) => {
        if (error?.code !== "ERR_CANCELED") console.error(error);
      })
      .finally(() => setLoadingNotifications(false));
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const badge = useMemo(() => Math.min(99, unreadCount), [unreadCount]);

  const markAllRead = async () => {
    await API.patch("/notifications/read");
    setUnreadCount(0);
    setNotifications((items) => items.map((item) => ({ ...item, unread: false })));
  };

  const toggleNotifications = () => {
    if (!open) setLoadingNotifications(true);
    setOpen((value) => !value);
  };

  return (
    <div className="notificationTopbar" ref={panelRef}>
      <button type="button" className="notificationBellBtn" onClick={toggleNotifications} aria-label="Notifications">
        <BellSvg />
        {badge > 0 ? <span className="notificationBadge">{badge}</span> : null}
      </button>
      {open ? (
        <div className="notificationOverlayPanel">
          <div className="notificationOverlayArrow" />
          <div className="notificationOverlayHeader">
            <h2>Notifications</h2>
            <button type="button" onClick={markAllRead}>Mark all as read</button>
          </div>
          <div className="notificationOverlayList">
            {loadingNotifications ? <div className="notificationEmpty">Loading notifications...</div> : null}
            {!loadingNotifications && notifications.length === 0 ? <div className="notificationEmpty">No notifications yet.</div> : null}
            {notifications.map((item) => (
              <NotificationListItem
                key={item.id}
                item={item}
                userRole={userRole}
                onOpen={async (notification) => {
                  setOpen(false);
                  if (notification.unread) {
                    try {
                      const response = await API.patch(`/notifications/${notification.id}/read`);
                      setUnreadCount(Number(response.data?.unreadCount || 0));
                      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, unread: false } : item));
                    } catch (error) {
                      console.error(error);
                    }
                  }
                  openNotification(navigate, notification);
                }} 
              />
            ))}
          </div>
          <button
            type="button"
            className="notificationViewAllBtn"
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
          >
            View all notifications <span>→</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { openNotification };
export default NotificationBell;

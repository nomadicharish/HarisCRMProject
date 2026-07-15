import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import { NotificationListItem, openNotification } from "../components/common/NotificationBell";
import { getStoredUser } from "../utils/auth";
import "../styles/notifications.css";

const PAGE_SIZE = 20;

function Notifications() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getStoredUser());
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (nextCursor = null, nextPage = 1, history = []) => {
    try {
      setLoading(true);
      const [me, notifications] = await Promise.all([
        user ? Promise.resolve(user) : API.get("/auth/me").then((res) => res.data),
        API.get("/notifications", { params: { cursor: nextCursor || undefined, limit: PAGE_SIZE } }).then((res) => res.data)
      ]);
      setUser(me || null);
      setItems(Array.isArray(notifications?.items) ? notifications.items : []);
      setCursor(notifications?.nextCursor || null);
      setHasMore(Boolean(notifications?.hasMore));
      setCursorHistory(history);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load(null, 1, []);
  }, [load]);

  const markAllRead = async () => {
    try {
      setMarking(true);
      await API.patch("/notifications/read");
      await load(cursorHistory[cursorHistory.length - 1] || null, page, cursorHistory);
    } finally {
      setMarking(false);
    }
  };

  const openItem = async (notification) => {
    if (notification.unread) {
      try {
        await API.patch(`/notifications/${notification.id}/read`);
        setItems((currentItems) => currentItems.map((item) => item.id === notification.id ? { ...item, unread: false } : item));
      } catch (error) {
        console.error(error);
      }
    }
    openNotification(navigate, notification);
  };

  return (
    <div className="notificationsPage">
      <DashboardTopbar
        user={user}
        showTabs
        tabs={[
          { key: "home", label: "Home" },
          { key: "applicants", label: "Applicants" },
          { key: "companies", label: "Companies" }
        ]}
        activeTab="notifications"
        onTabChange={(key) => navigate(key === "home" ? "/dashboard" : `/dashboard?tab=${key}`)}
      />

      <main className="notificationsShell">
        <div className="notificationsHeader">
          <div>
            <h1>All Notifications</h1>
          </div>
          <button type="button" className="notificationsMarkBtn" disabled={marking} onClick={markAllRead}>
            {marking ? "Marking..." : "Mark all as read"}
          </button>
        </div>

        <div className="notificationsList">
          {items.length ? items.map((item) => (
            <NotificationListItem
              key={item.id}
              item={item}
              spacious
              userRole={user?.role || ""}
              onOpen={openItem}
            />
          )) : !loading ? <div className="notificationEmpty notificationEmptyFull">No notifications yet.</div> : null}
        </div>

        <div className="notificationsFooter">
          <span>Showing {items.length ? (page - 1) * PAGE_SIZE + 1 : 0} to {(page - 1) * PAGE_SIZE + items.length} notifications</span>
          <div className="notificationsPager">
            <button type="button" disabled={page <= 1} onClick={() => load(null, 1, [])}>{"<<"}</button>
            <button type="button" disabled={page <= 1} onClick={() => {
              const history = cursorHistory.slice(0, -1);
              load(history[history.length - 1] || null, page - 1, history);
            }}>{"<"}</button>
            <span>{page}</span>
            <button type="button" disabled={!hasMore} onClick={() => load(cursor, page + 1, [...cursorHistory, cursor])}>{">"}</button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Notifications;

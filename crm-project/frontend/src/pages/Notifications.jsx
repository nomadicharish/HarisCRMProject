import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { auth } from "../firebase";
import DashboardTopbar from "../components/common/DashboardTopbar";
import { NotificationListItem, openNotification } from "../components/common/NotificationBell";
import { getStoredUser } from "../utils/auth";
import { mergeNotificationItems, readNotificationCache, writeNotificationCache } from "../utils/notificationCache";
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
    const uid = auth.currentUser?.uid || user?.uid || "";
    const cached = !nextCursor && nextPage === 1 ? readNotificationCache(uid, "list") : null;
    if (cached) {
      setItems(cached.items.slice(0, PAGE_SIZE));
      setCursor(cached.nextCursor || null);
      setHasMore(Boolean(cached.hasMore));
      setCursorHistory(history);
      setPage(nextPage);
      setLoading(false);
    }
    try {
      if (!cached) setLoading(true);
      const notificationParams = cached
        ? { since: cached.syncCursor, limit: 100 }
        : { cursor: nextCursor || undefined, limit: PAGE_SIZE };
      const [me, notifications] = await Promise.all([
        user ? Promise.resolve(user) : API.get("/auth/me").then((res) => res.data),
        API.get("/notifications", { params: notificationParams }).then((res) => res.data)
      ]);
      setUser(me || null);
      const incoming = Array.isArray(notifications?.items) ? notifications.items : [];
      const mergedItems = notifications?.isDelta
        ? mergeNotificationItems(cached?.items || [], incoming)
        : incoming;
      setItems(mergedItems.slice(0, PAGE_SIZE));
      setCursor(notifications?.nextCursor || cached?.nextCursor || null);
      setHasMore(notifications?.isDelta ? Boolean(cached?.hasMore) : Boolean(notifications?.hasMore));
      setCursorHistory(history);
      setPage(nextPage);
      if (!nextCursor && nextPage === 1) {
        writeNotificationCache(uid, "list", {
          items: mergedItems,
          syncCursor: notifications?.syncCursor || cached?.syncCursor,
          hasMore: notifications?.isDelta ? cached?.hasMore : notifications?.hasMore,
          nextCursor: notifications?.nextCursor || cached?.nextCursor
        });
      }
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
      setItems((currentItems) => {
        const nextItems = currentItems.map((item) => ({ ...item, unread: false }));
        const uid = auth.currentUser?.uid || user?.uid || "";
        const cached = readNotificationCache(uid, "list");
        writeNotificationCache(uid, "list", { ...cached, items: nextItems });
        return nextItems;
      });
    } finally {
      setMarking(false);
    }
  };

  const openItem = async (notification) => {
    if (notification.unread) {
      try {
        await API.patch(`/notifications/${notification.id}/read`);
        setItems((currentItems) => {
          const nextItems = currentItems.map((item) => item.id === notification.id ? { ...item, unread: false } : item);
          const uid = auth.currentUser?.uid || user?.uid || "";
          const cached = readNotificationCache(uid, "list");
          writeNotificationCache(uid, "list", { ...cached, items: nextItems });
          return nextItems;
        });
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

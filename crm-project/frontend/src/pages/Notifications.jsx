import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import PageLoader from "../components/common/PageLoader";
import { NotificationListItem, openNotification } from "../components/common/NotificationBell";
import { getStoredUser } from "../utils/auth";
import "../styles/notifications.css";

const PAGE_SIZE = 10;

function Notifications() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getStoredUser());
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    const [me, notifications] = await Promise.all([
      user ? Promise.resolve(user) : API.get("/auth/me").then((res) => res.data),
      API.get("/notifications", { params: { page: nextPage, limit: PAGE_SIZE } }).then((res) => res.data)
    ]);
    setUser(me || null);
    setItems(Array.isArray(notifications?.items) ? notifications.items : []);
    setTotal(Number(notifications?.total || 0));
    setTotalPages(Number(notifications?.totalPages || 1));
    setPage(Number(notifications?.page || nextPage));
    setLoading(false);
  }, [page, user]);

  useEffect(() => {
    load(1);
  }, []);

  const markAllRead = async () => {
    try {
      setMarking(true);
      await API.patch("/notifications/read");
      await load(page);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="notificationsPage">
      <DashboardTopbar user={user} showTabs tabs={[
        { key: "home", label: "Home" },
        { key: "applicants", label: "Applicants" },
        { key: "companies", label: "Companies" }
      ]} activeTab="notifications" onTabChange={(key) => navigate(key === "home" ? "/dashboard" : `/dashboard?tab=${key}`)} />

      <main className="notificationsShell">
        <div className="notificationsHeader">
          <div>
            <h1>All Notifications</h1>
          </div>
          <button type="button" className="notificationsMarkBtn" disabled={marking} onClick={markAllRead}>
            <span>✓</span>
            {marking ? "Marking..." : "Mark all as read"}
          </button>
        </div>

        {loading ? (
          <PageLoader label="Loading notifications..." />
        ) : (
          <>
            <div className="notificationsList">
              {items.length ? items.map((item) => (
                <NotificationListItem
                  key={item.id}
                  item={item}
                  spacious
                  onOpen={(notification) => openNotification(navigate, notification)}
                />
              )) : <div className="notificationEmpty notificationEmptyFull">No notifications yet.</div>}
            </div>

            <div className="notificationsFooter">
              <span>Showing {items.length ? (page - 1) * PAGE_SIZE + 1 : 0} to {Math.min(page * PAGE_SIZE, total)} of {total} notifications</span>
              <div className="notificationsPager">
                <button type="button" disabled={page <= 1} onClick={() => load(1)}>«</button>
                <button type="button" disabled={page <= 1} onClick={() => load(page - 1)}>‹</button>
                <span>{page}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => load(page + 1)}>›</button>
                <button type="button" disabled={page >= totalPages} onClick={() => load(totalPages)}>»</button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Notifications;

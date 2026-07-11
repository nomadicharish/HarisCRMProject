const {
  getUnreadNotificationCount,
  listNotificationsForUser,
  markNotificationsRead
} = require("../services/notificationService");

async function listNotifications(req, res) {
  const payload = await listNotificationsForUser(req.user, {
    limit: req.query?.limit,
    cursor: req.query?.cursor
  });
  return res.json(payload);
}

async function unreadCount(req, res) {
  return res.json(await getUnreadNotificationCount(req.user));
}

async function markAllRead(req, res) {
  const payload = await markNotificationsRead(req.user);
  return res.json(payload);
}

module.exports = {
  listNotifications,
  unreadCount,
  markAllRead
};

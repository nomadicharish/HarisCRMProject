const {
  getUnreadNotificationCount,
  listNotificationsForUser,
  markNotificationRead,
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

async function markOneRead(req, res) {
  return res.json(await markNotificationRead(req.user, req.params.id));
}

module.exports = {
  listNotifications,
  unreadCount,
  markOneRead,
  markAllRead
};

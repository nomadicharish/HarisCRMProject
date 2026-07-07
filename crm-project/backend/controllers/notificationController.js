const {
  listNotificationsForUser,
  markNotificationsRead
} = require("../services/notificationService");

async function listNotifications(req, res) {
  const payload = await listNotificationsForUser(req.user, {
    limit: req.query?.limit,
    page: req.query?.page
  });
  return res.json(payload);
}

async function markAllRead(req, res) {
  const payload = await markNotificationsRead(req.user);
  return res.json(payload);
}

module.exports = {
  listNotifications,
  markAllRead
};

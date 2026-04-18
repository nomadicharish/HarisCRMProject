const { admin, db } = require("../config/firebase");
const { listChangeEvents } = require("../services/changeFeedService");

async function getEvents(req, res) {
  const items = await listChangeEvents({
    limit: req.query.limit,
    after: req.query.after
  });
  return res.json(items);
}

async function registerWebhook(req, res) {
  const payload = {
    url: req.body.url,
    eventType: req.body.eventType || "*",
    secret: req.body.secret || "",
    active: true,
    createdBy: req.user?.uid || "",
    createdByRole: req.user?.role || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const docRef = await db.collection("changeWebhookSubscriptions").add(payload);
  return res.status(201).json({
    message: "Webhook registered",
    id: docRef.id
  });
}

module.exports = {
  getEvents,
  registerWebhook
};

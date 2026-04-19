const { getObservabilitySnapshot } = require("../services/observabilityService");

async function getMetrics(req, res) {
  const snapshot = getObservabilitySnapshot({ recentLimit: req.query.recentLimit });
  return res.json(snapshot);
}

async function getHealth(_req, res) {
  return res.json({
    status: "ok",
    timestamp: Date.now()
  });
}

module.exports = {
  getHealth,
  getMetrics
};


const MAX_RECENT_ITEMS = 500;

const requestMetrics = {
  startedAt: Date.now(),
  totals: {
    requests: 0,
    errors4xx: 0,
    errors5xx: 0
  },
  byRoute: new Map(),
  recent: []
};

function normalizeRoute(path = "") {
  return String(path || "").split("?")[0] || "/";
}

function recordRequestMetric({
  method = "GET",
  path = "/",
  statusCode = 200,
  latencyMs = 0,
  firestoreReads = 0,
  correlationId = ""
} = {}) {
  const route = `${String(method || "GET").toUpperCase()} ${normalizeRoute(path)}`;
  const safeLatency = Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : 0;
  const safeReads = Number.isFinite(Number(firestoreReads)) ? Number(firestoreReads) : 0;
  const safeStatus = Number(statusCode) || 0;

  requestMetrics.totals.requests += 1;
  if (safeStatus >= 500) requestMetrics.totals.errors5xx += 1;
  else if (safeStatus >= 400) requestMetrics.totals.errors4xx += 1;

  const current = requestMetrics.byRoute.get(route) || {
    requests: 0,
    errors4xx: 0,
    errors5xx: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0,
    totalFirestoreReads: 0
  };

  current.requests += 1;
  if (safeStatus >= 500) current.errors5xx += 1;
  else if (safeStatus >= 400) current.errors4xx += 1;
  current.totalLatencyMs += safeLatency;
  current.maxLatencyMs = Math.max(current.maxLatencyMs, safeLatency);
  current.totalFirestoreReads += safeReads;
  requestMetrics.byRoute.set(route, current);

  requestMetrics.recent.unshift({
    at: Date.now(),
    method: String(method || "GET").toUpperCase(),
    path: normalizeRoute(path),
    statusCode: safeStatus,
    latencyMs: Math.round(safeLatency * 100) / 100,
    firestoreReads: safeReads,
    correlationId: String(correlationId || "")
  });

  if (requestMetrics.recent.length > MAX_RECENT_ITEMS) {
    requestMetrics.recent.length = MAX_RECENT_ITEMS;
  }
}

function getObservabilitySnapshot({ recentLimit = 50 } = {}) {
  const routes = Array.from(requestMetrics.byRoute.entries())
    .map(([route, metrics]) => ({
      route,
      requests: metrics.requests,
      errors4xx: metrics.errors4xx,
      errors5xx: metrics.errors5xx,
      avgLatencyMs: metrics.requests
        ? Math.round((metrics.totalLatencyMs / metrics.requests) * 100) / 100
        : 0,
      maxLatencyMs: Math.round(metrics.maxLatencyMs * 100) / 100,
      avgFirestoreReads: metrics.requests
        ? Math.round((metrics.totalFirestoreReads / metrics.requests) * 100) / 100
        : 0
    }))
    .sort((a, b) => b.requests - a.requests);

  const safeRecentLimit = Math.max(1, Math.min(200, Number(recentLimit) || 50));

  return {
    generatedAt: Date.now(),
    uptimeMs: Math.max(0, Date.now() - requestMetrics.startedAt),
    totals: { ...requestMetrics.totals },
    routes,
    recent: requestMetrics.recent.slice(0, safeRecentLimit)
  };
}

module.exports = {
  getObservabilitySnapshot,
  recordRequestMetric
};


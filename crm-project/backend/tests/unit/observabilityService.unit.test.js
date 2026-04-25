const assert = require("node:assert/strict");
const {
  getObservabilitySnapshot,
  recordRequestMetric
} = require("../../services/observabilityService");

module.exports = function runObservabilityServiceUnitTest() {
  const before = getObservabilitySnapshot({ recentLimit: 1 });

  recordRequestMetric({
    method: "POST",
    path: "/api/applicants/create",
    statusCode: 201,
    latencyMs: 123.45,
    firestoreReads: 7,
    correlationId: "unit-test-correlation-id"
  });

  const after = getObservabilitySnapshot({ recentLimit: 5 });
  assert.ok(after.totals.requests >= before.totals.requests + 1);
  assert.ok(Array.isArray(after.routes));
  assert.ok(Array.isArray(after.recent));
  assert.ok(after.recent.length >= 1);
  assert.equal(after.recent[0].correlationId, "unit-test-correlation-id");
};


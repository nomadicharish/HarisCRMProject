const test = require("node:test");
const assert = require("node:assert/strict");

const shouldRun = String(process.env.RUN_API_INTEGRATION || "").toLowerCase() === "true";

if (!shouldRun) {
  test("Integration tests are gated", { skip: true }, () => {});
} else {
  process.env.TEST_BYPASS_AUTH = "true";
  const { app } = require("../../app");

  let server;
  let baseUrl;

  test.before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  test.after(async () => {
    if (!server) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const defaultHeaders = {
    Authorization: "Bearer test-token",
    "x-test-user-id": "integration-super-user",
    "x-test-user-role": "SUPER_USER"
  };

  async function request(path, { method = "GET", headers = {}, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...defaultHeaders,
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return response;
  }

  const endpoints = [
    { name: "GET /", path: "/", allowed: [200] },
    { name: "GET /api/auth/me", path: "/api/auth/me", allowed: [200, 401, 404] },
    { name: "GET /api/auth/settings", path: "/api/auth/settings", allowed: [200, 401, 404] },
    { name: "GET /api/applicants", path: "/api/applicants?lite=true&paginated=true&page=1&limit=10", allowed: [200, 401] },
    { name: "GET /api/applicants/:id", path: "/api/applicants/non-existent-id", allowed: [200, 401, 404] },
    { name: "GET /api/applicants/:id/workflow-bundle", path: "/api/applicants/non-existent-id/workflow-bundle", allowed: [200, 401, 404] },
    { name: "GET /api/countries", path: "/api/countries", allowed: [200, 401] },
    { name: "GET /api/companies", path: "/api/companies", allowed: [200, 401] },
    { name: "GET /api/dashboard", path: "/api/dashboard", allowed: [200, 401] },
    { name: "POST /api/agents/jobs", path: "/api/agents/jobs", method: "POST", body: { type: "AGENT_ACTION", payload: { sample: true } }, allowed: [202, 401, 403] }
  ];

  for (const endpoint of endpoints) {
    test(endpoint.name, async () => {
      const response = await request(endpoint.path, {
        method: endpoint.method || "GET",
        body: endpoint.body
      });

      assert.ok(
        endpoint.allowed.includes(response.status),
        `${endpoint.name} returned ${response.status}, expected one of: ${endpoint.allowed.join(", ")}`
      );
    });
  }
}

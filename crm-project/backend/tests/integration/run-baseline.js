const assert = require("node:assert/strict");

async function run() {
  const shouldRun = String(process.env.RUN_API_INTEGRATION || "").toLowerCase() === "true";
  if (!shouldRun) {
    console.log("Skipping integration tests. Set RUN_API_INTEGRATION=true to execute.");
    process.exit(0);
  }

  process.env.TEST_BYPASS_AUTH = "true";
  const { app } = require("../../app");

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const defaultHeaders = {
      Authorization: "Bearer test-token",
      "x-test-user-id": "integration-super-user",
      "x-test-user-role": "SUPER_USER"
    };

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
      {
        name: "POST /api/agents/jobs",
        path: "/api/agents/jobs",
        method: "POST",
        body: { type: "AGENT_ACTION", payload: { sample: true } },
        allowed: [202, 401, 403]
      }
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(`${baseUrl}${endpoint.path}`, {
        method: endpoint.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...defaultHeaders
        },
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
      });

      assert.ok(
        endpoint.allowed.includes(response.status),
        `${endpoint.name} returned ${response.status}, expected one of: ${endpoint.allowed.join(", ")}`
      );
      console.log(`PASS ${endpoint.name} -> ${response.status}`);
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

run().catch((error) => {
  console.error("Integration baseline failed", error);
  process.exit(1);
});

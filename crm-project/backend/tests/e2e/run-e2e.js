if (!process.env.RUN_E2E) {
  process.stdout.write("Skipping e2e tests. Set RUN_E2E=true to execute.\n");
  process.exit(0);
}

process.env.TEST_BYPASS_AUTH = "true";

async function run() {
  const { app } = require("../../app");
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const headers = {
      Authorization: "Bearer test-token",
      "x-test-user-id": "e2e-super-user",
      "x-test-user-role": "SUPER_USER",
      "Content-Type": "application/json"
    };

    const createPayload = {
      firstName: "E2E",
      lastName: "Candidate",
      personalDetails: {
        firstName: "E2E",
        lastName: "Candidate",
        dob: "1995-01-01",
        age: 31,
        address: "Test Address",
        phone: "+919999999999",
        maritalStatus: "Single"
      },
      companyId: "missing-company-id",
      countryId: "missing-country-id",
      agencyId: "missing-agency-id",
      totalAmount: 1000,
      amountPaid: 100
    };

    const createRes = await fetch(`${baseUrl}/api/applicants/create`, {
      method: "POST",
      headers,
      body: JSON.stringify(createPayload)
    });

    process.stdout.write(`E2E create applicant -> ${createRes.status}\n`);

    const listRes = await fetch(`${baseUrl}/api/applicants?lite=true&paginated=true&page=1&limit=5`, {
      method: "GET",
      headers
    });

    process.stdout.write(`E2E list applicants -> ${listRes.status}\n`);
    process.stdout.write("E2E scaffold executed\n");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

run().catch((error) => {
  process.stderr.write(`E2E run failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});

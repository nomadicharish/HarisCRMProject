const assert = require("node:assert/strict");
const { hasScope } = require("../../services/policyService");

function run() {
  assert.equal(hasScope({ role: "SUPER_USER" }, "agent.actions.write"), true);
  assert.equal(hasScope({ role: "ACCOUNTANT" }, "agent.actions.write"), false);
  assert.equal(
    hasScope({ role: "ACCOUNTANT", agentScopes: ["agent.actions.write"] }, "agent.actions.write"),
    true
  );

  process.stdout.write("Unit checks passed\n");
}

run();

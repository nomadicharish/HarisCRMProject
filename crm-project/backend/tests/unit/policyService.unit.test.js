const assert = require("node:assert/strict");
const { hasScope } = require("../../services/policyService");

module.exports = function runPolicyServiceUnitTest() {
  assert.equal(hasScope({ role: "SUPER_USER" }, "agent.actions.write"), true);
  assert.equal(hasScope({ role: "ACCOUNTANT" }, "agent.actions.write"), false);
  assert.equal(
    hasScope({ role: "ACCOUNTANT", agentScopes: ["agent.actions.write"] }, "agent.actions.write"),
    true
  );
};


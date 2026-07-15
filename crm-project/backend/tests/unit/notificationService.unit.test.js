const assert = require("node:assert/strict");
const { buildNotificationMessage } = require("../../services/notificationService");

module.exports = function runNotificationServiceUnitTest() {
  const employerMessage = buildNotificationMessage(
    {
      actorName: "John Doe",
      actionKey: "APPLICANT_ADDED",
      verb: "created applicant",
      applicantIds: ["app-1"]
    },
    { recipientRole: "EMPLOYER" }
  );

  assert.equal(employerMessage, "Created 1 applicant.");

  const agencyMessage = buildNotificationMessage(
    {
      actorName: "Jane Smith",
      actionKey: "CONTRACT_ISSUED",
      verb: "added contract",
      applicantIds: ["app-1", "app-2"]
    },
    { recipientRole: "AGENCY" }
  );

  assert.equal(agencyMessage, "Jane Smith added contract for 2 applicants.");
};

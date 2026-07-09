const assert = require("node:assert/strict");
const {
  resolveApplicantPaymentSnapshot,
  resolveApplicantPaymentStage
} = require("../../services/applicantDomainService");

module.exports = function runApplicantPaymentSnapshotUnitTest() {
  const standard = resolveApplicantPaymentSnapshot({
    paymentSummary: {
      applicant: {
        total: 1000,
        paid: 400,
        currency: "EUR"
      }
    }
  });

  assert.equal(standard.pending, 600);
  assert.equal(standard.currency, "EUR");

  const malformedSummary = resolveApplicantPaymentSnapshot({
    paymentSummary: {
      applicant: {
        total: "invalid",
        paid: "invalid"
      }
    },
    totalApplicantPayment: 750,
    amountPaid: 250,
    paymentCurrency: "USD"
  });

  assert.equal(malformedSummary.total, 750);
  assert.equal(malformedSummary.paid, 250);
  assert.equal(malformedSummary.pending, 500);
  assert.equal(malformedSummary.currency, "USD");

  const rounded = resolveApplicantPaymentSnapshot({
    totalApplicantPayment: 100,
    amountPaid: 99.999
  });

  assert.equal(rounded.pending, 0);

  const overpaidLegacy = resolveApplicantPaymentSnapshot({
    paymentSummary: {
      applicant: {
        total: 500,
        paid: 0
      }
    },
    amountPaid: 700
  });

  assert.equal(overpaidLegacy.paid, 700);
  assert.equal(overpaidLegacy.pending, 0);

  const approvalMilestone = resolveApplicantPaymentStage({
    stage: 3,
    approvalStatus: "approved",
    totalApplicantPayment: 1000,
    amountPaid: 50
  });
  assert.equal(approvalMilestone.key, "after_approval");
  assert.equal(approvalMilestone.percentage, 20);
  assert.equal(approvalMilestone.pending, 150);

  const appointmentMilestone = resolveApplicantPaymentStage({
    stage: 7,
    approvalStatus: "approved",
    totalApplicantPayment: 1000,
    amountPaid: 200
  });
  assert.equal(appointmentMilestone.key, "after_embassy_appointment");
  assert.equal(appointmentMilestone.pending, 400);

  const trcMilestone = resolveApplicantPaymentStage({
    stage: 12,
    approvalStatus: "approved",
    totalApplicantPayment: 1000,
    amountPaid: 650
  });
  assert.equal(trcMilestone.key, "after_trc");
  assert.equal(trcMilestone.pending, 350);
};

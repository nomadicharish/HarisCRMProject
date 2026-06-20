const assert = require("node:assert/strict");
const { resolveApplicantPaymentSnapshot } = require("../../services/applicantDomainService");

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
};

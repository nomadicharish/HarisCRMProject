import { useMemo } from "react";
import { formatCurrencyAmount, normalizeCurrency } from "../utils/currency";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getApplicantTotalAmount(applicant, paymentSummary = null) {
  return toNumber(
    paymentSummary?.applicant?.totalEur ??
      paymentSummary?.applicant?.total ??
      applicant?.payment?.total ??
      applicant?.paymentsSummary?.applicant?.total ??
      applicant?.totalApplicantPayment ??
      applicant?.totalAmount ??
      applicant?.totalPayment
  );
}

function getApplicantPaidAmount(applicant) {
  return toNumber(
    applicant?.payment?.paid ??
      applicant?.paymentsSummary?.applicant?.paid ??
      applicant?.paidAmount ??
      applicant?.amountPaid ??
      applicant?.initialPaidAmount
  );
}

function useApplicantPaymentState({ applicant, paymentSummary }) {
  return useMemo(() => {
    const total = getApplicantTotalAmount(applicant, paymentSummary);
    const paid = getApplicantPaidAmount(applicant);
    const currency = normalizeCurrency(
      paymentSummary?.applicant?.currency ||
        applicant?.payment?.currency ||
        applicant?.paymentCurrency ||
        applicant?.currency
    );
    const derivedPending = Math.max(0, total - paid);
    const pending =
      paymentSummary?.applicant?.pendingInr ??
      paymentSummary?.applicant?.pending ??
      applicant?.payment?.pendingInr ??
      applicant?.payment?.pending ??
      derivedPending;

    return {
      pending,
      currency,
      formattedPendingAmount: formatCurrencyAmount(pending, currency, true),
      isTotalAmountMissing: total <= 0
    };
  }, [applicant, paymentSummary]);
}

export default useApplicantPaymentState;

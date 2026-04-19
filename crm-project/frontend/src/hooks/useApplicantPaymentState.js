import { useMemo } from "react";

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
    const exchangeRate = toNumber(applicant?.payment?.exchangeRate ?? applicant?.exchangeRate);
    const derivedTotalInr = exchangeRate > 0 ? total * exchangeRate : total;
    const derivedPendingInr = Math.max(0, derivedTotalInr - paid);
    const pending =
      paymentSummary?.applicant?.pendingInr ??
      paymentSummary?.applicant?.pending ??
      applicant?.payment?.pendingInr ??
      applicant?.payment?.pending ??
      derivedPendingInr;

    return {
      pending,
      formattedPendingAmount: `INR ${Number(pending || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`,
      isTotalAmountMissing: total <= 0
    };
  }, [applicant, paymentSummary]);
}

export default useApplicantPaymentState;

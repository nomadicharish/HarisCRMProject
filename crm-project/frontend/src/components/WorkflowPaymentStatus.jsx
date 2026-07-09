import React from "react";
import { formatCurrencyAmount, normalizeCurrency } from "../utils/currency";
import { isSuperUserLikeRole } from "../utils/auth";

function getNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return 0;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function WorkflowPaymentStatus({ applicant, requiredPercent = 65, user }) {
  if (!isSuperUserLikeRole(user?.role)) return null;

  const payment = applicant?.payment || {};
  const paymentCurrency = normalizeCurrency(payment.currency || applicant?.paymentCurrency || applicant?.currency);

  const total = getNumber(
    payment.totalInr,
    payment.total,
    applicant?.totalApplicantPayment,
    applicant?.totalAmount,
    applicant?.totalPayment
  );
  const paid = getNumber(payment.paidInr, payment.paid, applicant?.amountPaid, applicant?.paidAmount);
  const pending = getNumber(payment.pendingInr, payment.pending, Math.max(0, total - paid));
  const paidPercent = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : pending <= 0 ? 100 : 0;
  const pendingPercent = Math.max(0, 100 - paidPercent);
  const isSufficient = paidPercent >= requiredPercent;

  const toneClass = isSufficient ? "workflowPaymentStatusSuccess" : "workflowPaymentStatusDanger";
  const title = isSufficient ? "Payment Status" : "Pending Payment";
  const message = isSufficient
    ? `Sufficient payment completed (${formatPercent(requiredPercent)}).`
    : `Payment should be at least ${formatPercent(requiredPercent)} to proceed.`;

  return (
    <div className={`workflowPaymentStatus ${toneClass}`}>
      <div className="workflowPaymentStatusIcon" aria-hidden="true">
        {isSufficient ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 8v5m0 4h.01M10.3 4.3 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="workflowPaymentStatusContent">
        <div className="workflowPaymentStatusTitle">{title}</div>
        <div className="workflowPaymentStatusMeta">
          <span>Total Fee: {formatCurrencyAmount(total, paymentCurrency, true)}</span>
          <span>Paid: {formatCurrencyAmount(paid, paymentCurrency, true)} ({formatPercent(paidPercent)})</span>
          <span>Pending: {formatCurrencyAmount(pending, paymentCurrency, true)} ({formatPercent(pendingPercent)})</span>
        </div>
        <div className="workflowPaymentStatusMessage">{message}</div>
      </div>
    </div>
  );
}

export default WorkflowPaymentStatus;

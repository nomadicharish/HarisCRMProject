import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import { getCached, invalidateCache } from "../services/cachedApi";
import "../styles/forms.css";
import "../styles/applicantContract.css";
import "../styles/payment.css";
import "../styles/applicantsDashboard.css";

function formatCurrency(value, withDecimals = false, currencySymbol = "\u20b9") {
  return `${currencySymbol}${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0
  })}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatCreatedAt(createdAt) {
  if (!createdAt) return "";
  try {
    const date =
      typeof createdAt?.toDate === "function"
        ? createdAt.toDate()
        : typeof createdAt === "object" && createdAt._seconds
        ? new Date(createdAt._seconds * 1000)
        : new Date(createdAt);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "";
  }
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function ApplicantPayments() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [applicant, setApplicant] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    paidDate: new Date().toISOString().slice(0, 10),
    paymentMode: "Check",
    note: ""
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [userRes, applicantRes, summaryRes] = await Promise.allSettled([
        getCached("/auth/me", { ttlMs: 120000 }),
        getCached(`/applicants/${id}`, { ttlMs: 15000 }),
        getCached(`/applicants/${id}/payments/summary`, { ttlMs: 10000 })
      ]);

      if (userRes.status === "fulfilled") {
        setUser(userRes.value || null);
      } else if (userRes.reason?.response?.status === 429) {
        console.warn("auth/me rate limited. Using last known user state.");
      }

      if (applicantRes.status === "fulfilled") {
        setApplicant(applicantRes.value || null);
      } else {
        throw applicantRes.reason;
      }

      if (summaryRes.status === "fulfilled") {
        setPaymentSummary(summaryRes.value || null);
      } else {
        throw summaryRes.reason;
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to load payment details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const applicantPayment = paymentSummary?.applicant || {};
  const paymentHistory = useMemo(() => {
    if (Array.isArray(paymentSummary?.applicant?.history)) {
      return paymentSummary.applicant.history;
    }
    return (paymentSummary?.history || []).filter((payment) => payment.type === "APPLICANT");
  }, [paymentSummary]);
  const canAddPayment =
    ["SUPER_USER", "AGENCY"].includes(user?.role) &&
    applicantPayment.remainingInstallments > 0 &&
    Number(applicantPayment.pendingInr || 0) > 0;
  const fullName =
    applicant?.fullName ||
    [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ").trim() ||
    "Applicant";
  const phone = applicant?.phone || applicant?.personalDetails?.phone || "-";
  const address = applicant?.address || applicant?.personalDetails?.address || "-";
  const employerLine = [applicant?.companyName, applicant?.countryName || applicant?.country].filter(Boolean).join(", ");
  const createdOn = formatCreatedAt(applicant?.createdAt);
  const installmentCount = applicantPayment.installmentCount || 0;

  const handleInputChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddPayment = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Paid amount must be greater than 0");
      return;
    }

    if (!form.paidDate) {
      toast.error("Paid date is required");
      return;
    }

    const previousSummary = paymentSummary;
    const previousForm = form;
    const optimisticDate = form.paidDate ? new Date(form.paidDate).getTime() : Date.now();
    const optimisticEntry = {
      id: `temp-${Date.now()}`,
      type: "APPLICANT",
      amount,
      currency: "INR",
      paidDate: optimisticDate,
      paymentMode: form.paymentMode,
      note: form.note
    };

    const nextPaidInr = Number(applicantPayment.paidInr || 0) + amount;
    const nextPendingInr = Math.max(0, Number(applicantPayment.pendingInr || 0) - amount);
    const nextInstallmentCount = Number(applicantPayment.installmentCount || 0) + 1;
    const nextRemainingInstallments = Math.max(0, Number(applicantPayment.remainingInstallments || 0) - 1);

    setPaymentSummary((prev) => {
      if (!prev) return prev;
      const prevHistory = Array.isArray(prev?.applicant?.history) ? prev.applicant.history : [];
      return {
        ...prev,
        applicant: {
          ...(prev.applicant || {}),
          paidInr: nextPaidInr,
          paid: nextPaidInr,
          pendingInr: nextPendingInr,
          pending: nextPendingInr,
          installmentCount: nextInstallmentCount,
          remainingInstallments: nextRemainingInstallments,
          history: [optimisticEntry, ...prevHistory]
        }
      };
    });

    try {
      setSaving(true);
      await API.post(`/applicants/${id}/payments`, {
        type: "APPLICANT",
        amount,
        currency: "INR",
        paidDate: form.paidDate,
        paymentMode: form.paymentMode,
        note: form.note
      });

      setShowAddPaymentModal(false);
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/auth/me");
      invalidateCache(`/applicants/${id}/payments/summary`);
      invalidateCache("/applicants");
      setForm({
        amount: "",
        paidDate: new Date().toISOString().slice(0, 10),
        paymentMode: "Check",
        note: ""
      });
      loadData();
    } catch (error) {
      console.error(error);
      setPaymentSummary(previousSummary);
      setForm(previousForm);
      toast.error(error?.response?.data?.message || "Failed to add payment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

  return (
    <div className="page-container">
      <DashboardTopbar user={user} />
      <div className="page-content paymentPage paymentLayout">
        <aside className="paymentSidebar">
          <div className="paymentProfileCard">
            <div className="paymentProfileTop">
              <div className="paymentAvatar">{getInitials(fullName)}</div>
              <div className="paymentProfileMeta">
                <div className="paymentProfileName">{fullName}</div>
                <div className="paymentProfileAge">Age {applicant?.age ?? applicant?.personalDetails?.age ?? "-"}</div>
                {createdOn ? <div className="paymentProfileCreated">Created on {createdOn}</div> : null}
              </div>
            </div>

            <div className="paymentProfileSection">
              <div className="paymentProfileLabel">Phone No:</div>
              <div className="paymentProfileValue">{phone}</div>
            </div>

            <div className="paymentProfileSection">
              <div className="paymentProfileLabel">Address</div>
              <div className="paymentProfileValue paymentProfileAddress">{address}</div>
            </div>

            <div className="paymentProfileSection">
              <div className="paymentProfileLabel">Employer</div>
              <div className="paymentProfileValue">{employerLine || "-"}</div>
            </div>

            <button type="button" className="paymentPendingCard" onClick={() => navigate(`/applicants/${id}/payments`)}>
              <div>
                <div className="paymentPendingLabel">Pending Amount</div>
                <div className="paymentPendingValue">{formatCurrency(applicantPayment.pendingInr)}</div>
              </div>
              <span className="paymentPendingArrow">&gt;</span>
            </button>
          </div>
        </aside>

        <main className="paymentMain">
          <div className="paymentInfoStrip">
            <div className="paymentInfoStripLeft">
              <div className="paymentInfoText">
                <div className="paymentInfoLine">
                  <span className="paymentInfoAmount">{formatCurrency(applicantPayment.paidInr)}</span>
                  <span className="paymentInfoDivider">/</span>
                  <span className="paymentInfoAmount">{formatCurrency(applicantPayment.totalInr)}</span>
                  <span className="paymentInfoSuffix">
                    paid in {installmentCount} {installmentCount === 1 ? "installment" : "installments"}
                  </span>
                </div>
                <span className="paymentInfoMeta">
                  Remaining amount {formatCurrency(applicantPayment.pendingInr)}
                </span>
              </div>
            </div>

            {canAddPayment ? (
              <button type="button" className="paymentStripAction" onClick={() => setShowAddPaymentModal(true)}>
                Add payment
              </button>
            ) : null}
          </div>

          <div className="paymentHistoryCard">
            <h3 className="paymentHistoryTitle">Payment History</h3>

            <div className="paymentHistoryTableWrap">
              <table className="paymentHistoryTable">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Date Paid</th>
                    <th>Payment Mode</th>
                    <th>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="paymentEmptyState">No payment history available yet.</td>
                    </tr>
                  ) : (
                    paymentHistory.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatCurrency(payment.amount)}</td>
                        <td>{formatDate(payment.paidDate)}</td>
                        <td>{payment.paymentMode || "-"}</td>
                        <td>{payment.note || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <button type="button" className="paymentBackLink" onClick={() => navigate(`/applicants/${id}`)}>
              Go back to Profile
            </button>
          </div>
        </main>

        {showAddPaymentModal ? (
          <div className="contractModalOverlay">
            <div className="contractModalCard">
              <div className="workflowModalTopBar paymentModalTopBar">
                <div>
                  <div className="workflowModalTopBarTitle">Add Payment Details</div>
                  <div className="paymentModalSubtitle">
                    Pending Amount: {formatCurrency(applicantPayment.pendingInr, true)}
                  </div>
                </div>
                <button type="button" className="workflowModalCloseBtn" onClick={() => setShowAddPaymentModal(false)}>
                  x
                </button>
              </div>

              <div className="contractFormGrid">
                <div className="input-field">
                  <label className="contractUploadLabel" htmlFor="payment-amount">
                    Paid Amount (In INR)
                  </label>
                  <input
                    id="payment-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => handleInputChange("amount", event.target.value)}
                    placeholder="Enter paid amount"
                  />
                </div>

                <div className="input-field">
                  <label className="contractUploadLabel" htmlFor="payment-date">
                    Paid Date
                  </label>
                  <input
                    id="payment-date"
                    type="date"
                    className="workflowDateInput"
                    value={form.paidDate}
                    onChange={(event) => handleInputChange("paidDate", event.target.value)}
                  />
                </div>

                <div className="input-field">
                  <label className="contractUploadLabel" htmlFor="payment-mode">
                    Payment mode
                  </label>
                  <select
                    id="payment-mode"
                    value={form.paymentMode}
                    onChange={(event) => handleInputChange("paymentMode", event.target.value)}
                  >
                    <option value="Check">Check</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>

                <div className="input-field">
                  <label className="contractUploadLabel" htmlFor="payment-note">
                    Note (Optional)
                  </label>
                  <input
                    id="payment-note"
                    type="text"
                    value={form.note}
                    onChange={(event) => handleInputChange("note", event.target.value)}
                    placeholder="Add note"
                  />
                </div>
              </div>

              <div className="contractActionRow">
                <button type="button" className="btn btnSecondary" onClick={() => setShowAddPaymentModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btnPrimary" onClick={handleAddPayment} disabled={saving}>
                  {saving ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ApplicantPayments;

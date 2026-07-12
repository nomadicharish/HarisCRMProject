import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import BlockingLoader from "../components/common/BlockingLoader";
import PageLoader from "../components/common/PageLoader";
import ApplicantSummaryCard from "../components/applicant/ApplicantSummaryCard";
import { getCached, invalidateCache, readCached, updateCached, writeCached } from "../services/cachedApi";
import { formatIndianNumberInput, parseIndianNumberInput } from "../utils/numberFormat";
import { getStoredUser, isSuperUserLikeRole } from "../utils/auth";
import { formatCurrencyAmount, getCurrencySymbol, normalizeCurrency } from "../utils/currency";
import { buildApplicantSidebarCache, getApplicantSidebarCacheKey } from "../utils/applicantSidebarCache";
import { ALLOWED_DOCUMENT_ACCEPT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
import "../styles/forms.css";
import "../styles/applicantContract.css";
import "../styles/payment.css";
import "../styles/applicantsDashboard.css";
import "react-datepicker/dist/react-datepicker.css";

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

function parsePaymentDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatPaymentDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const PaymentDateInput = React.forwardRef(({ value, onClick }, ref) => (
  <div className="paymentDatePickerShell">
    <input
      ref={ref}
      type="text"
      value={value || ""}
      onClick={onClick}
      readOnly
      placeholder="Select payment date"
      className="workflowDateInput"
    />
    <button type="button" className="paymentDatePickerButton" onClick={onClick} aria-label="Open payment date picker">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  </div>
));

PaymentDateInput.displayName = "PaymentDateInput";

function UploadFileIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16.5a4 4 0 0 0-3.8-4A5.5 5.5 0 0 0 5.7 14 3.5 3.5 0 0 0 6.5 21H18a3 3 0 0 0 2-5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const formatAmountInput = formatIndianNumberInput;
const parseAmountInput = parseIndianNumberInput;

function formatBankAccountLabel(account = {}) {
  return [account.beneficiaryName, account.accountNumber, account.bankNameBranch].filter(Boolean).join(", ");
}

const PAYMENT_STATUS_LABELS = {
  PENDING_JUNIOR: "Pending Acknowledgement",
  PENDING_SENIOR: "Pending Confirmation",
  CONFIRMED: "Confirmed"
};

const DASHBOARD_TAB_CONFIG = {
  home: { label: "Home" },
  applicants: { label: "Applicants" },
  companies: { label: "Companies" }
};

function getPaymentStatus(payment = {}) {
  const status = String(payment.verificationStatus || payment.status || "").toUpperCase();
  if (PAYMENT_STATUS_LABELS[status]) return status;
  if (payment.requiresVerification === true) {
    if (payment.seniorConfirmed === true || payment.seniorConfirmedAt) return "CONFIRMED";
    if (payment.juniorAcknowledged === true || payment.juniorAcknowledgedAt) return "PENDING_SENIOR";
    return "PENDING_JUNIOR";
  }
  return "CONFIRMED";
}

function getEnteredByDisplay(payment = {}) {
  if (payment.enteredByName && payment.enteredByName !== payment.createdBy && payment.enteredByName !== payment.paidBy) {
    return payment.enteredByName;
  }
  if (payment.paidBy === "SUPER_USER") return "Super User";
  if (payment.isLegacyMapped) return "Initial Payment";
  return "Unknown User";
}

function ApplicantPayments() {
  const { id } = useParams();
  const navigate = useNavigate();
  const initialPaymentPage = readCached(`/applicants/${id}/payments-page`) || null;
  const paymentPageCacheTtlMs = 120000;
  const initialSidebarProfile = readCached(getApplicantSidebarCacheKey(id)) || null;
  const [user, setUser] = useState(() => getStoredUser());
  const [applicant, setApplicant] = useState(initialSidebarProfile?.applicant || initialPaymentPage?.applicant || null);
  const [paymentSummary, setPaymentSummary] = useState(initialPaymentPage?.paymentSummary || null);
  const [sidebarProfile, setSidebarProfile] = useState(initialSidebarProfile);
  const [loading, setLoading] = useState(!initialPaymentPage);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const documentInputRef = useRef(null);
  const [form, setForm] = useState({
    amount: "",
    paidDate: new Date().toISOString().slice(0, 10),
    paymentMode: "Bank Transfer",
    bankAccountId: "",
    utrNumber: "",
    payeeName: "",
    payeeBankName: "",
    payeeBankBranch: "",
    note: "",
    documents: []
  });
  const paymentDashboardTabs = useMemo(() => {
    if (isSuperUserLikeRole(user?.role)) return ["home", "applicants", "companies"];
    if (user?.role === "AGENCY" || user?.role === "EMPLOYER") return ["home", "applicants", "companies"];
    if (user?.role === "SENIOR_ACCOUNTANT") return ["home", "applicants"];
    return ["applicants"];
  }, [user?.role]);
  const handleDashboardTabChange = useCallback(
    (tabKey) => {
      if (!paymentDashboardTabs.includes(tabKey)) return;
      if (tabKey === "applicants") {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", "applicants");
        navigate(`/dashboard?${params.toString()}`);
        return;
      }
      const query = tabKey === "home" ? "" : `?tab=${encodeURIComponent(tabKey)}`;
      navigate(`/dashboard${query}`);
    },
    [navigate, paymentDashboardTabs]
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [paymentPageRes, userRes, bankAccountsRes] = await Promise.allSettled([
        getCached(`/applicants/${id}/payments-page`, { ttlMs: paymentPageCacheTtlMs, force: true }),
        user ? Promise.resolve(user) : getCached("/auth/me", { ttlMs: 120000 }),
        isSuperUserLikeRole(user?.role) || user?.role === "AGENCY"
          ? getCached("/auth/bank-accounts", { ttlMs: 120000 })
          : Promise.resolve({ items: [] })
      ]);

      if (userRes.status === "fulfilled") {
        setUser(userRes.value || null);
      }

      if (paymentPageRes.status !== "fulfilled") {
        throw paymentPageRes.reason;
      }
      if (bankAccountsRes.status === "fulfilled") {
        setBankAccounts(Array.isArray(bankAccountsRes.value?.items) ? bankAccountsRes.value.items : []);
      }

      const nextApplicant = paymentPageRes.value?.applicant || null;
      setApplicant(nextApplicant || null);
      setPaymentSummary(paymentPageRes.value?.paymentSummary || null);

      const nextSidebarProfile = buildApplicantSidebarCache({
        applicant: nextApplicant,
        pendingAmount:
          paymentPageRes.value?.paymentSummary?.applicant?.pendingInr ??
          paymentPageRes.value?.paymentSummary?.applicant?.pending ??
          0,
        countryName: nextApplicant?.countryName || nextApplicant?.country || "",
        agencyName: nextApplicant?.agencyName || nextApplicant?.agency?.name || ""
      });

      if (nextSidebarProfile) {
        setSidebarProfile(nextSidebarProfile);
        writeCached(getApplicantSidebarCacheKey(id), nextSidebarProfile, { ttlMs: paymentPageCacheTtlMs });
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to load payment details");
    } finally {
      setLoading(false);
    }
  }, [id, paymentPageCacheTtlMs, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const applicantPayment = paymentSummary?.applicant || {};
  const paymentCurrency = normalizeCurrency(applicantPayment.currency || applicant?.paymentCurrency || applicant?.currency);
  const paymentCurrencySymbol = getCurrencySymbol(paymentCurrency);
  const formatPaymentCurrency = (value, withDecimals = false) =>
    formatCurrencyAmount(value, paymentCurrency, withDecimals);
  const pendingAmount = applicantPayment.pendingInr ?? applicantPayment.pending ?? 0;
  const totalAmount = applicantPayment.totalInr ?? applicantPayment.total ?? 0;
  const paidAmount = applicantPayment.paidInr ?? applicantPayment.paid ?? 0;
  const confirmedAmount = applicantPayment.confirmedAmount ?? paidAmount;
  const awaitingJuniorAmount = applicantPayment.awaitingJuniorAmount ?? 0;
  const awaitingSeniorAmount = applicantPayment.awaitingSeniorAmount ?? 0;
  const hasPaymentReviewPending = Number(awaitingJuniorAmount || 0) > 0 || Number(awaitingSeniorAmount || 0) > 0;
  const paymentHistory = useMemo(() => {
    if (Array.isArray(paymentSummary?.applicant?.history)) {
      return paymentSummary.applicant.history;
    }
    return (paymentSummary?.history || []).filter((payment) => payment.type === "APPLICANT");
  }, [paymentSummary]);
  const canAddPayment =
    (isSuperUserLikeRole(user?.role) || user?.role === "AGENCY") &&
    applicantPayment.remainingInstallments > 0 &&
    Number(pendingAmount || 0) > 0;
  const installmentCount = applicantPayment.installmentCount || 0;
  const isAccountant = user?.role === "JUNIOR_ACCOUNTANT" || user?.role === "SENIOR_ACCOUNTANT";
  const canOpenApplicantProfile = user?.role !== "JUNIOR_ACCOUNTANT";

  const handleInputChange = (key, value) => {
    if (key === "amount") {
      setForm((prev) => ({ ...prev, amount: formatAmountInput(value) }));
      return;
    }
    if (key === "paymentMode") {
      setForm((prev) => ({
        ...prev,
        paymentMode: value,
        bankAccountId: "",
        utrNumber: "",
        payeeName: "",
        payeeBankName: "",
        payeeBankBranch: ""
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addDocuments = (files) => {
    const availableSlots = Math.max(0, 5 - form.documents.length);
    const selectedFiles = Array.from(files || [])
      .slice(0, availableSlots)
      .map((file) => getValidatedDocumentFile(file, toast.error))
      .filter(Boolean);
    if (!selectedFiles.length) return;
    setForm((prev) => ({ ...prev, documents: [...prev.documents, ...selectedFiles].slice(0, 5) }));
  };

  const removeDocument = (index) => {
    setForm((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, currentIndex) => currentIndex !== index)
    }));
  };

  const handleAddPayment = async () => {
    const amount = parseAmountInput(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Paid amount must be greater than 0");
      return;
    }

    if (!form.paidDate) {
      toast.error("Paid date is required");
      return;
    }
    if (!form.paymentMode) {
      toast.error("Payment mode is required");
      return;
    }
    if (form.paymentMode === "Bank Transfer" && !form.bankAccountId) {
      toast.error("Select Beneficiary  bank account details");
      return;
    }
    if (
      form.paymentMode === "Bank Transfer" &&
      (!form.payeeName.trim() || !form.payeeBankName.trim() || !form.payeeBankBranch.trim())
    ) {
      toast.error("Enter all payee bank details");
      return;
    }
    if (form.paymentMode === "UPI" && !form.utrNumber.trim()) {
      toast.error("UTR number is required");
      return;
    }
    if (form.paymentMode === "UPI" && !form.payeeName.trim()) {
      toast.error("Payee name is required");
      return;
    }
    if (form.paymentMode === "BH" && !form.payeeName.trim()) {
      toast.error("Payee name is required");
      return;
    }
    const selectedDocuments = form.documents.filter(Boolean);
    const fileValidation = validateDocumentFiles(selectedDocuments);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
      return;
    }

    const previousSummary = paymentSummary;
    const previousForm = form;
    const optimisticDate = form.paidDate ? new Date(form.paidDate).getTime() : Date.now();
    const optimisticEntry = {
      id: `temp-${Date.now()}`,
      type: "APPLICANT",
      amount,
      currency: paymentCurrency,
      paidDate: optimisticDate,
      paymentMode: form.paymentMode,
      bankAccount: form.paymentMode === "Bank Transfer"
        ? bankAccounts.find((account) => account.id === form.bankAccountId) || null
        : null,
      utrNumber: form.paymentMode === "UPI" ? form.utrNumber.trim() : "",
      payeeName: ["Bank Transfer", "UPI", "BH"].includes(form.paymentMode) ? form.payeeName.trim() : "",
      payeeBankName: form.paymentMode === "Bank Transfer" ? form.payeeBankName.trim() : "",
      payeeBankBranch: form.paymentMode === "Bank Transfer" ? form.payeeBankBranch.trim() : "",
      note: form.note,
      verificationStatus: "PENDING_JUNIOR",
      requiresVerification: true,
      juniorAcknowledged: false,
      seniorConfirmed: false,
      enteredByName: user?.name || user?.email || user?.role || "",
      documents: selectedDocuments.map((document) => ({ name: document.name, url: "" }))
    };

    const nextPaidInr = Number(paidAmount || 0) + amount;
    const nextPendingInr = Math.max(0, Number(pendingAmount || 0) - amount);
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
          awaitingJuniorAmount: Number(prev.applicant?.awaitingJuniorAmount || 0) + amount,
          hasPendingAcknowledgement: true,
          history: [optimisticEntry, ...prevHistory]
        }
      };
    });

    setSidebarProfile((prev) => {
      if (!prev?.applicant) return prev;
      return {
        ...prev,
        pendingAmount: nextPendingInr
      };
    });

    updateCached(
      getApplicantSidebarCacheKey(id),
      (current) => {
        if (!current?.applicant) return current;
        return {
          ...current,
          pendingAmount: nextPendingInr
        };
      },
      { ttlMs: paymentPageCacheTtlMs }
    );

    try {
      setSaving(true);
      const body = new FormData();
      body.append("type", "APPLICANT");
      body.append("amount", String(amount));
      body.append("currency", paymentCurrency);
      body.append("paidDate", form.paidDate);
      body.append("paymentMode", form.paymentMode);
      body.append("bankAccountId", form.paymentMode === "Bank Transfer" ? form.bankAccountId : "");
      body.append("utrNumber", form.paymentMode === "UPI" ? form.utrNumber.trim() : "");
      body.append("payeeName", ["Bank Transfer", "UPI", "BH"].includes(form.paymentMode) ? form.payeeName.trim() : "");
      body.append("payeeBankName", form.paymentMode === "Bank Transfer" ? form.payeeBankName.trim() : "");
      body.append("payeeBankBranch", form.paymentMode === "Bank Transfer" ? form.payeeBankBranch.trim() : "");
      body.append("note", form.note || "");
      selectedDocuments.forEach((document) => body.append("documents", document));
      await API.post(`/applicants/${id}/payments`, body, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setShowAddPaymentModal(false);
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/auth/me");
      invalidateCache(`/applicants/${id}/payments-page`);
      invalidateCache(`/applicants/${id}/payments/summary`);
      invalidateCache("/applicants");
      setForm({
        amount: "",
        paidDate: new Date().toISOString().slice(0, 10),
        paymentMode: "Bank Transfer",
        bankAccountId: "",
        utrNumber: "",
        payeeName: "",
        payeeBankName: "",
        payeeBankBranch: "",
        note: "",
        documents: []
      });
      await loadData({ force: true });
    } catch (error) {
      console.error(error);
      setPaymentSummary(previousSummary);
      setForm(previousForm);
      toast.error(error?.response?.data?.message || "Failed to add payment");
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentReview = async () => {
    if (!selectedPayment || selectedPayment.isLegacyMapped) return;
    const status = getPaymentStatus(selectedPayment);
    const isJuniorAction = user?.role === "JUNIOR_ACCOUNTANT" && status === "PENDING_JUNIOR";
    const isSeniorAction = user?.role === "SENIOR_ACCOUNTANT" && status === "PENDING_SENIOR";
    if (!isJuniorAction && !isSeniorAction) return;
    if (isJuniorAction && !reviewConfirmed) {
      toast.error("Confirm that the entered details and documents are correct");
      return;
    }

    try {
      setReviewing(true);
      const action = isJuniorAction ? "acknowledge" : "confirm";
      await API.patch(`/applicants/${id}/payments/${selectedPayment.id}/${action}`);
      invalidateCache(`/applicants/${id}/payments-page`);
      invalidateCache(`/applicants/${id}/payments/summary`);
      invalidateCache(`/applicants/${id}`);
      invalidateCache(`/applicants/${id}/workflow-bundle`);
      invalidateCache("/applicants");
      setSelectedPayment(null);
      setReviewConfirmed(false);
      await loadData({ force: true });
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to update payment");
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading payment details..." />;
  }

  return (
    <div className="page-container dashboardPageContainer">
      <DashboardTopbar
        user={user}
        showTabs
        tabs={paymentDashboardTabs.map((key) => ({
          key,
          label: DASHBOARD_TAB_CONFIG[key].label
        }))}
        activeTab="applicants"
        onTabChange={handleDashboardTabChange}
      />
      <div className="page-content paymentPage paymentLayout">
        <aside className="paymentSidebar">
          <ApplicantSummaryCard
            applicant={sidebarProfile?.applicant || applicant}
            pendingAmount={sidebarProfile?.pendingAmount ?? pendingAmount}
            pendingDisplayValue={
              Number((sidebarProfile?.pendingAmount ?? pendingAmount) || 0) <= 0 && hasPaymentReviewPending
                ? "Payment completed"
                : formatPaymentCurrency(sidebarProfile?.pendingAmount ?? pendingAmount)
            }
            onPendingClick={() => navigate(`/applicants/${id}/payments${window.location.search || ""}`)}
            onProfileClick={canOpenApplicantProfile ? () => navigate(`/applicants/${id}${window.location.search || ""}`) : undefined}
            agencyName={sidebarProfile?.agencyName || applicant?.agencyName || applicant?.agency?.name || ""}
            countryName={sidebarProfile?.countryName || applicant?.countryName || applicant?.country || ""}
            showAgency={isAccountant || Boolean((sidebarProfile?.agencyName || applicant?.agencyName || applicant?.agency?.name || applicant?.agencyId))}
            showPendingAmount={false}
            accountantView={isAccountant}
            headerOnly
          />
        </aside>

        <main className="paymentMain">
          <div className="paymentInfoStrip">
            <div className="paymentInfoStripLeft">
              <div className="paymentInfoIcon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="3" width="12" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M8 8h5M8 12h8M8 16h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="18" cy="17" r="3" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M18 15.5v3M16.5 17h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </div>
              <div className="paymentInfoText">
                <div className="paymentInfoLine">
                  <span className="paymentInfoAmount">{formatPaymentCurrency(paidAmount)}</span>
                  <span className="paymentInfoDivider">/</span>
                  <span className="paymentInfoAmount">{formatPaymentCurrency(totalAmount)}</span>
                  <span className="paymentInfoSuffix">
                    paid in {installmentCount} {installmentCount === 1 ? "installment" : "installments"}
                  </span>
                </div>
                <span className="paymentInfoMeta">
                  Remaining amount {formatPaymentCurrency(pendingAmount)}
                </span>
              </div>
            </div>

            {canAddPayment ? (
              <button type="button" className="paymentStripAction" onClick={() => setShowAddPaymentModal(true)}>
                Add Payment
              </button>
            ) : null}
          </div>

          <div className="paymentHistoryCard">
            <div className="paymentStatusGrid">
              <div className="paymentStatusCard paymentStatusConfirmed">
                <span>Confirmed Amount</span>
                <strong>{formatPaymentCurrency(confirmedAmount)}</strong>
              </div>
              <div className="paymentStatusCard paymentStatusSenior">
                <span>Awaiting Confirmation</span>
                <strong>{formatPaymentCurrency(awaitingSeniorAmount)}</strong>
              </div>
              <div className="paymentStatusCard paymentStatusJunior">
                <span>Pending Acknowledgement</span>
                <strong>{formatPaymentCurrency(awaitingJuniorAmount)}</strong>
              </div>
              <div className="paymentStatusCard paymentStatusPaid">
                <span>Total Paid</span>
                <strong>{formatPaymentCurrency(paidAmount)}</strong>
              </div>
            </div>

            <h3 className="paymentHistoryTitle">Payment History</h3>

            <div className="paymentHistoryTableWrap">
              <table className="paymentHistoryTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Entered By</th>
                    <th>Junior Ack.</th>
                    <th>Senior Confirm.</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="paymentEmptyState">No payment history available yet.</td>
                    </tr>
                  ) : (
                    paymentHistory.map((payment) => {
                      const status = getPaymentStatus(payment);
                      return (
                        <tr key={payment.id}>
                          <td>{formatDate(payment.paidDate)}</td>
                          <td>{formatCurrencyAmount(payment.amount, payment.currency || paymentCurrency)}</td>
                          <td>{payment.paymentMode || "-"}</td>
                          <td>{getEnteredByDisplay(payment)}</td>
                          <td className={status !== "PENDING_JUNIOR" ? "paymentReviewDone" : "paymentReviewPending"}>
                            {status === "PENDING_JUNIOR" ? "Pending" : "Acknowledged"}
                          </td>
                          <td className={status === "CONFIRMED" ? "paymentReviewDone" : "paymentReviewPending"}>
                            {status === "CONFIRMED" ? "Confirmed" : "Pending"}
                          </td>
                          <td>
                            <span className={`paymentStatusBadge paymentStatusBadge-${status.toLowerCase()}`}>
                              {PAYMENT_STATUS_LABELS[status]}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="paymentViewBtn"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setReviewConfirmed(false);
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="paymentBackLink"
              onClick={() => navigate(user?.role === "JUNIOR_ACCOUNTANT" ? "/dashboard?tab=applicants" : `/applicants/${id}`)}
            >
              {user?.role === "JUNIOR_ACCOUNTANT" ? "Go back to Applicants" : "Go back to Profile"}
            </button>
          </div>
        </main>

        {showAddPaymentModal ? (
          <div className="contractModalOverlay paymentEntryModalOverlay">
            <div className="contractModalCard paymentEntryModalCard paymentAddModalCard" style={{ position: "relative" }}>
              <BlockingLoader open={saving} label="Saving payment details..." />
              <div className="dashboardModalHeader">
                <div>
                  <h3 className="dashboardModalTitle">Add Payment — {form.paymentMode}</h3>
                  <div className="paymentModalSubtitle">
                    Pending Amount: {formatPaymentCurrency(pendingAmount, true)}
                  </div>
                </div>
                <button type="button" className="dashboardModalCloseBtn" onClick={() => setShowAddPaymentModal(false)}>
                  x
                </button>
              </div>

              <div className="contractFormGrid paymentAddFormGrid">
                <div className="input-field">
                  <label className="contractUploadLabel" htmlFor="payment-amount">
                    Amount <span className="paymentRequired">*</span>
                  </label>
                  <div className="paymentAmountInputWrap">
                    <span className="paymentAmountPrefix">{paymentCurrencySymbol}</span>
                    <input
                      id="payment-amount"
                      type="text"
                      value={form.amount}
                      onChange={(event) => handleInputChange("amount", event.target.value)}
                      placeholder="Enter paid amount"
                    />
                  </div>
                </div>

                <div className="input-field">
                  <label className="contractUploadLabel" htmlFor="payment-date">
                    Payment Date <span className="paymentRequired">*</span>
                  </label>
                  <DatePicker
                    selected={parsePaymentDate(form.paidDate)}
                    onChange={(date) => handleInputChange("paidDate", formatPaymentDateValue(date))}
                    dateFormat="dd MMM yyyy"
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    portalId="root"
                    popperPlacement="bottom-start"
                    customInput={<PaymentDateInput />}
                  />
                </div>

                <div className="input-field">
                  <label className="contractUploadLabel" htmlFor="payment-mode">
                    Payment Mode <span className="paymentRequired">*</span>
                  </label>
                  <select
                    id="payment-mode"
                    value={form.paymentMode}
                    onChange={(event) => handleInputChange("paymentMode", event.target.value)}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="BH">BH</option>
                  </select>
                </div>

                {form.paymentMode === "Bank Transfer" ? (
                  <>
                    <h4 className="paymentFormSectionTitle">Bank Transfer Details</h4>
                    <div className="input-field">
                      <label className="contractUploadLabel" htmlFor="payment-bank-account">
                        Beneficiary Account <span className="paymentRequired">*</span>
                      </label>
                      <select
                        id="payment-bank-account"
                        value={form.bankAccountId}
                        onChange={(event) => handleInputChange("bankAccountId", event.target.value)}
                      >
                        <option value="">Select beneficiary account</option>
                        {bankAccounts.map((account) => (
                          <option key={account.id} value={account.id}>{formatBankAccountLabel(account)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="input-field">
                      <label className="contractUploadLabel" htmlFor="payment-payee-bank-name">
                        Payee Bank Name <span className="paymentRequired">*</span>
                      </label>
                      <input
                        id="payment-payee-bank-name"
                        type="text"
                        value={form.payeeBankName}
                        onChange={(event) => handleInputChange("payeeBankName", event.target.value)}
                        placeholder="Enter payee bank name"
                      />
                    </div>
                    <div className="input-field">
                      <label className="contractUploadLabel" htmlFor="payment-payee-name">
                        Payee Name in Account <span className="paymentRequired">*</span>
                      </label>
                      <input
                        id="payment-payee-name"
                        type="text"
                        value={form.payeeName}
                        onChange={(event) => handleInputChange("payeeName", event.target.value)}
                        placeholder="Enter payee name"
                      />
                    </div>
                    <div className="input-field paymentFullWidthField">
                      <label className="contractUploadLabel" htmlFor="payment-payee-bank-branch">
                        Payee Bank &amp; Branch <span className="paymentRequired">*</span>
                      </label>
                      <input
                        id="payment-payee-bank-branch"
                        type="text"
                        value={form.payeeBankBranch}
                        onChange={(event) => handleInputChange("payeeBankBranch", event.target.value)}
                        placeholder="Enter payee bank and branch"
                      />
                    </div>
                  </>
                ) : null}

                {form.paymentMode === "UPI" ? (
                  <>
                    <h4 className="paymentFormSectionTitle">UPI Details</h4>
                    <div className="input-field">
                      <label className="contractUploadLabel" htmlFor="payment-utr">
                        UTR Number <span className="paymentRequired">*</span>
                      </label>
                      <input
                        id="payment-utr"
                        type="text"
                        value={form.utrNumber}
                        onChange={(event) => handleInputChange("utrNumber", event.target.value)}
                        placeholder="Enter UTR number"
                      />
                    </div>
                    <div className="input-field">
                      <label className="contractUploadLabel" htmlFor="payment-upi-payee-name">
                        Payee Name <span className="paymentRequired">*</span>
                      </label>
                      <input
                        id="payment-upi-payee-name"
                        type="text"
                        value={form.payeeName}
                        onChange={(event) => handleInputChange("payeeName", event.target.value)}
                        placeholder="Enter payee name"
                      />
                    </div>
                  </>
                ) : null}

                {form.paymentMode === "BH" ? (
                  <>
                    <h4 className="paymentFormSectionTitle">BH Details</h4>
                    <div className="input-field">
                      <label className="contractUploadLabel" htmlFor="payment-bh-payee-name">
                        Payee Name <span className="paymentRequired">*</span>
                      </label>
                      <input
                        id="payment-bh-payee-name"
                        type="text"
                        value={form.payeeName}
                        onChange={(event) => handleInputChange("payeeName", event.target.value)}
                        placeholder="Enter payee name"
                      />
                    </div>
                  </>
                ) : null}

                <div className="input-field paymentFullWidthField">
                  <div className="paymentDocumentsHeader">
                    <label className="contractUploadLabel">Supporting Documents</label>
                  </div>
                  <input
                    ref={documentInputRef}
                    className="paymentHiddenFileInput"
                    type="file"
                    accept={ALLOWED_DOCUMENT_ACCEPT}
                    multiple
                    onChange={(event) => {
                      addDocuments(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <div className="paymentDocumentFields">
                    {form.documents.map((document, index) => (
                      <div className="paymentDocumentFieldRow" key={index}>
                        <div className="paymentDocumentUpload">
                          <span className="paymentDocumentUploadIcon"><UploadFileIcon /></span>
                          <span className="paymentDocumentName">{document.name}</span>
                          <span className="paymentDocumentSize">
                            {document.size ? `${Math.max(1, Math.round(document.size / 1024))} KB` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="paymentRemoveDocumentBtn"
                          onClick={() => removeDocument(index)}
                          aria-label={`Remove ${document.name}`}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="paymentAddDocumentBtn"
                    onClick={() => documentInputRef.current?.click()}
                    disabled={form.documents.length >= 5}
                  >
                    + Add Another Document
                  </button>
                </div>

                <div className="input-field paymentFullWidthField">
                  <label className="contractUploadLabel" htmlFor="payment-note">
                    Notes (Optional)
                  </label>
                  <textarea
                    id="payment-note"
                    value={form.note}
                    onChange={(event) => handleInputChange("note", event.target.value)}
                    placeholder="Add payment notes"
                    rows={3}
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

        {selectedPayment ? (
          <div className="contractModalOverlay paymentEntryModalOverlay">
            <div className="contractModalCard paymentEntryModalCard paymentReviewModalCard">
              <BlockingLoader open={reviewing} label="Updating payment verification..." />
              <div className="dashboardModalHeader">
                <div>
                  <h3 className="dashboardModalTitle">
                    {user?.role === "JUNIOR_ACCOUNTANT" && getPaymentStatus(selectedPayment) === "PENDING_JUNIOR"
                      ? "Junior Accountant Review"
                      : user?.role === "SENIOR_ACCOUNTANT" && getPaymentStatus(selectedPayment) === "PENDING_SENIOR"
                      ? "Senior Accountant Review"
                      : "View Payment Details"}
                  </h3>
                  <div className="paymentReviewHeadingRow">
                    <span className={`paymentStatusBadge paymentStatusBadge-${getPaymentStatus(selectedPayment).toLowerCase()}`}>
                      {PAYMENT_STATUS_LABELS[getPaymentStatus(selectedPayment)]}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="dashboardModalCloseBtn"
                  onClick={() => {
                    setSelectedPayment(null);
                    setReviewConfirmed(false);
                  }}
                >
                  &times;
                </button>
              </div>

              <div className="paymentReviewSummary">
                <div><span>Amount</span><strong>{formatCurrencyAmount(selectedPayment.amount, selectedPayment.currency || paymentCurrency)}</strong></div>
                <div><span>Payment Date</span><strong>{formatDate(selectedPayment.paidDate)}</strong></div>
                <div><span>Payment Mode</span><strong>{selectedPayment.paymentMode || "-"}</strong></div>
                <div><span>Entered By</span><strong>{getEnteredByDisplay(selectedPayment)}</strong></div>
              </div>

              <div className="paymentReviewGrid paymentReviewDetailsGrid">
                {selectedPayment.paymentMode === "Bank Transfer" ? (
                  <>
                    <div className="paymentReviewSection">
                      <h4>Beneficiary Details</h4>
                      <p>Beneficiary Name: {selectedPayment.bankAccount?.beneficiaryName || "-"}</p>
                      <p>Account Number: {selectedPayment.bankAccount?.accountNumber || "-"}</p>
                      <p>Bank Name &amp; Branch: {selectedPayment.bankAccount?.bankNameBranch || "-"}</p>
                    </div>
                    <div className="paymentReviewSection">
                      <h4>Payee Details</h4>
                      <p>Payee Name: {selectedPayment.payeeName || "-"}</p>
                      <p>Payee Bank: {selectedPayment.payeeBankName || "-"}</p>
                      <p>Payee Bank &amp; Branch: {selectedPayment.payeeBankBranch || "-"}</p>
                    </div>
                  </>
                ) : (
                  <div className="paymentReviewSection">
                    <h4>{selectedPayment.paymentMode} Details</h4>
                    <p>Payee Name: {selectedPayment.payeeName || "-"}</p>
                    {selectedPayment.paymentMode === "UPI" ? (
                      <p>UTR Number: {selectedPayment.utrNumber || "-"}</p>
                    ) : null}
                  </div>
                )}

                <div className="paymentReviewSection">
                  <h4>Verification Status</h4>
                  <div className="paymentVerificationTimeline">
                    <span className="paymentTimelineDone">Payment Entered</span>
                    <span className={getPaymentStatus(selectedPayment) !== "PENDING_JUNIOR" ? "paymentTimelineDone" : ""}>
                      Junior Accountant Acknowledgement
                    </span>
                    <span className={getPaymentStatus(selectedPayment) === "CONFIRMED" ? "paymentTimelineDone" : ""}>
                      Senior Accountant Confirmation
                    </span>
                  </div>
                </div>
              </div>

              <div className="paymentReviewSection">
                <h4>Documents</h4>
                <div className="paymentReviewDocuments">
                  {(Array.isArray(selectedPayment.documents) && selectedPayment.documents.length
                    ? selectedPayment.documents
                    : selectedPayment.documentUrl
                    ? [{ url: selectedPayment.documentUrl, name: selectedPayment.documentFileName }]
                    : []
                  ).map((document, index) => (
                    <a key={`${document.url}-${index}`} href={document.url} target="_blank" rel="noreferrer">
                      <span>{document.name || `Document ${index + 1}`}</span>
                      <span aria-hidden="true">Download</span>
                    </a>
                  ))}
                  {!(selectedPayment.documents?.length || selectedPayment.documentUrl) ? <span>No documents uploaded.</span> : null}
                </div>
              </div>

              {selectedPayment.note ? (
                <div className="paymentReviewSection">
                  <h4>Notes</h4>
                  <p>{selectedPayment.note}</p>
                </div>
              ) : null}

              {selectedPayment.juniorAcknowledgedAt ? (
                <div className="paymentReviewSection">
                  <h4>Acknowledgement Details</h4>
                  <p>
                    {selectedPayment.juniorAcknowledgedByName || "Junior Accountant"} acknowledged on{" "}
                    {formatDate(selectedPayment.juniorAcknowledgedAt)}.
                  </p>
                </div>
              ) : null}

              {user?.role === "JUNIOR_ACCOUNTANT" && getPaymentStatus(selectedPayment) === "PENDING_JUNIOR" ? (
                <label className="paymentReviewConfirmation">
                  <input
                    type="checkbox"
                    checked={reviewConfirmed}
                    onChange={(event) => setReviewConfirmed(event.target.checked)}
                  />
                  <span>I confirm that all entered details are correct and match the uploaded documents.</span>
                </label>
              ) : null}

              <div className="contractActionRow">
                <button type="button" className="btn btnSecondary" onClick={() => setSelectedPayment(null)}>
                  Close
                </button>
                {(
                  (user?.role === "JUNIOR_ACCOUNTANT" && getPaymentStatus(selectedPayment) === "PENDING_JUNIOR") ||
                  (user?.role === "SENIOR_ACCOUNTANT" && getPaymentStatus(selectedPayment) === "PENDING_SENIOR")
                ) && !selectedPayment.isLegacyMapped ? (
                  <button
                    type="button"
                    className="btn btnPrimary paymentReviewActionBtn"
                    onClick={handlePaymentReview}
                    disabled={reviewing}
                  >
                    {user?.role === "JUNIOR_ACCOUNTANT" ? "Acknowledge & Confirm" : "Confirm Payment"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ApplicantPayments;

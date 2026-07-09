import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import Select from "react-select";
import { toast } from "react-toastify";
import DashboardTopbar from "../components/common/DashboardTopbar";
import { useNavigate, useSearchParams } from "react-router-dom";
import ApplicantsTable, { resolveApplicantWorkflowMeta } from "../components/dashboard/ApplicantsTable";
import CompaniesTable from "../components/dashboard/CompaniesTable";
import EmployersTable from "../components/dashboard/EmployersTable";
import AgenciesTable from "../components/dashboard/AgenciesTable";
import DashboardFiltersSidebar from "../components/dashboard/DashboardFiltersSidebar";
import DashboardResultsHeader from "../components/dashboard/DashboardResultsHeader";
import PageLoader from "../components/common/PageLoader";
import BlockingLoader from "../components/common/BlockingLoader";
import { getCached, hasFreshCache, invalidateCache, prefetchCached } from "../services/cachedApi";
import API from "../services/api";
import {
  getSessionExpiresAt,
  getStoredUser,
  HOME_DASHBOARD_DATE_RANGE_STORAGE_KEY,
  isSuperUserLikeRole
} from "../utils/auth";
import { formatCurrencyAmount, normalizeCurrency } from "../utils/currency";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/applicantsDashboard.css";

const EntityFormModal = lazy(() => import("../components/dashboard/EntityFormModal"));

const RIGHT_ICON_SRC = "/right.png";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const COMPANY_LOOKUP_FIELDS = "id,name,countryId,employerIds,agencyIds,createdAt,jobSpecifications,jobPositions,documentsNeeded";
const EMPLOYER_LOOKUP_FIELDS = "id,name,companyId,countryId,contactNumber,email,address,createdAt";
const AGENCY_LOOKUP_FIELDS = "id,name,assignedCompanyIds,contactNumber,email,address,createdAt";
const DASHBOARD_FILTER_DESCRIPTIONS = {
  pending_payment: "having pending payment",
  arriving: "arriving",
  visa_collection: "for visa collection",
  embassy_interview: "having embassy interviews",
  embassy_appointment: "having embassy appointments",
  trp_pending: "with TRC upload pending",
  interview_biometric_pending: "with biometric upload pending after embassy interview",
  appointment_biometric_pending: "with biometric upload pending after embassy appointment",
  arrival_ticket_pending: "with arrival ticket upload pending",
  document_dispatch_pending: "with document dispatch pending",
  payment_received: "with payment received in the selected date range",
  payment_after_approval: "with payment pending after approval",
  payment_after_embassy_appointment: "with payment pending after embassy appointment",
  payment_after_embassy_interview: "with payment pending after embassy interview",
  payment_after_visa_collection: "with payment pending after visa collection",
  payment_after_trc: "with payment pending after TRC"
};
const TAB_CONFIG = {
  home: { label: "Home", actionLabel: "" },
  applicants: { label: "Applicants", actionLabel: "Add Applicant" },
  companies: { label: "Companies", actionLabel: "Add Company" }
};

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function isAccountantDashboardRole(role) {
  return role === "JUNIOR_ACCOUNTANT" || role === "SENIOR_ACCOUNTANT";
}

function getDefaultHomeRange(role = "") {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (isAccountantDashboardRole(role)) {
    start.setDate(start.getDate() - 6);
    return {
      fromDate: formatDateInput(start),
      toDate: formatDateInput(new Date())
    };
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const lastDayOfTargetMonth = new Date(start.getFullYear(), start.getMonth() + 2, 0).getDate();
  end.setDate(Math.min(start.getDate(), lastDayOfTargetMonth));
  return {
    fromDate: formatDateInput(start),
    toDate: formatDateInput(end)
  };
}

function readStoredHomeRange(fallbackRange) {
  if (typeof window === "undefined") return fallbackRange;

  try {
    const sessionExpiresAt = getSessionExpiresAt();
    if (!sessionExpiresAt || Date.now() > sessionExpiresAt) {
      window.localStorage.removeItem(HOME_DASHBOARD_DATE_RANGE_STORAGE_KEY);
      return fallbackRange;
    }
    const parsed = JSON.parse(window.localStorage.getItem(HOME_DASHBOARD_DATE_RANGE_STORAGE_KEY) || "{}");
    const fromDate = parseDateInput(parsed.fromDate) ? parsed.fromDate : fallbackRange.fromDate;
    const toDate = parseDateInput(parsed.toDate) ? parsed.toDate : fallbackRange.toDate;
    return { fromDate, toDate };
  } catch {
    return fallbackRange;
  }
}

function writeStoredHomeRange(range) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(HOME_DASHBOARD_DATE_RANGE_STORAGE_KEY, JSON.stringify(range));
  } catch {
    // Local storage can be unavailable in private browsing modes.
  }
}

const HomeDatePickerInput = React.forwardRef(({ value, onClick, placeholder, ariaLabel }, ref) => (
  <span className="homeDatePickerWrap">
    <svg className="homeDatePickerIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v4m10-4v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
    <input
      ref={ref}
      className="homeDatePickerInput"
      value={value || ""}
      onClick={onClick}
      placeholder={placeholder}
      aria-label={ariaLabel}
      readOnly
    />
  </span>
));

HomeDatePickerInput.displayName = "HomeDatePickerInput";

function HomeIcon({ type }) {
  const commonProps = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" };
  if (type === "plane") {
    return <svg {...commonProps}><path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === "visa") {
    return <svg {...commonProps}><path d="M6 3h9l3 3v15H6zM15 3v4h4M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === "people") {
    return <svg {...commonProps}><path d="M16 19v-1.5a3.5 3.5 0 0 0-7 0V19M12.5 10.5a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM20 19v-1a3 3 0 0 0-3-3M16.5 8.5a2.5 2.5 0 1 1-1.1 4.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
  }
  if (type === "calendar") {
    return <svg {...commonProps}><path d="M7 3v4m10-4v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
  }
  if (type === "fingerprint") {
    return <svg {...commonProps}><path d="M12 11v5M8.5 13v3M15.5 13v3M7.5 9.5a5 5 0 0 1 9 0M5 12a7 7 0 0 1 14 0M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
  }
  if (type === "payment") {
    return <svg {...commonProps}><path d="M12 3 5 6v5c0 4.4 2.8 8.2 7 10 4.2-1.8 7-5.6 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M9 10h6M9 13h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
  }
  return <svg {...commonProps}><path d="M7 3h8l4 4v14H7zM15 3v4h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HomeMetricCard({ title, count, tone, icon, onClick }) {
  return (
    <button type="button" className={`homeMetricCard homeTone-${tone}`} onClick={onClick}>
      <div className="homeMetricBody">
        <span className="homeMetricIcon"><HomeIcon type={icon} /></span>
        <div>
          <div className="homeMetricTitle">{title}</div>
          <div className="homeMetricCount"><strong>{count || 0}</strong><span>Applicants</span></div>
        </div>
      </div>
      <div className="homeMetricFooter"><span>View Details</span><span aria-hidden="true">&gt;</span></div>
    </button>
  );
}

const PAYMENT_STAGE_CONFIG = [
  {
    key: "afterApproval",
    title: "Applicant Approved",
    description: "Completing 20% of payment not done",
    icon: "payment",
    tone: "red",
    filter: "payment_after_approval"
  },
  {
    key: "afterEmbassyAppointment",
    title: "Embassy Appointment",
    description: "Completing 60% of payment not done",
    icon: "calendar",
    tone: "orange",
    filter: "payment_after_embassy_appointment"
  },
  {
    key: "afterEmbassyInterview",
    title: "Embassy Interview",
    description: "Completing 60% of payment not done",
    icon: "people",
    tone: "purple",
    filter: "payment_after_embassy_interview"
  },
  {
    key: "afterVisaCollection",
    title: "Visa Collection",
    description: "Completing 100% of payment not done",
    icon: "visa",
    tone: "blue",
    note: "Approved by Super User",
    filter: "payment_after_visa_collection"
  },
  {
    key: "afterTrc",
    title: "TRC Added",
    description: "Completing 100% of payment not done",
    icon: "document",
    tone: "green",
    note: "By Agent",
    filter: "payment_after_trc"
  }
];

function PaymentStageCard({ config, metric, onOpenFilter }) {
  const pending = metric?.pendingByCurrency || {};
  return (
    <article className={`homePaymentStageCard homePaymentStage-${config.tone}`}>
      <div className="homePaymentStageHeader">
        <span className="homePaymentStageIcon"><HomeIcon type={config.icon} /></span>
        <div>
          <h3>{config.title}</h3>
          <p>{config.description}</p>
        </div>
      </div>
      <div className="homePaymentStageCurrencies">
        <span>INR <strong className="homePaymentStageInr">{formatCurrencyAmount(pending.INR || 0, "INR", true)}</strong></span>
        <span>EUR <strong className="homePaymentStageEur">{formatCurrencyAmount(pending.EUR || 0, "EUR", true)}</strong></span>
        <span>USD <strong className="homePaymentStageUsd">{formatCurrencyAmount(pending.USD || 0, "USD", true)}</strong></span>
      </div>
      <button type="button" onClick={() => onOpenFilter(metric?.filter || config.filter, false)}>
        View Applicants ({metric?.count || 0}) <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

function HomePaymentStageModal({ open, paymentStages, onClose, onOpenFilter }) {
  if (!open) return null;

  return (
    <div className="homePaymentModalOverlay" role="presentation">
      <div className="homePaymentModal homePaymentStageModal" role="dialog" aria-modal="true" aria-labelledby="payment-stage-modal-title">
        <div className="homePaymentModalHeader">
          <div className="homePaymentModalTitleRow">
            <span className="homePaymentModalIcon"><HomeIcon type="calendar" /></span>
            <div>
              <h2 id="payment-stage-modal-title">Pending Amount by Stage</h2>
              <p>View pending payment totals by workflow stage.</p>
            </div>
          </div>
          <button type="button" className="homePaymentModalClose" onClick={onClose} aria-label="Close pending payment by stage">
            x
          </button>
        </div>

        <div className="homePaymentStageGrid homePaymentStageGridModal">
          {PAYMENT_STAGE_CONFIG.map((config) => (
            <PaymentStageCard
              key={config.key}
              config={config}
              metric={paymentStages[config.key]}
              onOpenFilter={onOpenFilter}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HomePaymentAgencyModal({ open, agencies, onClose }) {
  if (!open) return null;

  return (
    <div className="homePaymentModalOverlay" role="presentation">
      <div className="homePaymentModal homePaymentAgencyModal" role="dialog" aria-modal="true" aria-labelledby="payment-agency-modal-title">
        <div className="homePaymentModalHeader">
          <div className="homePaymentModalTitleRow">
            <span className="homePaymentModalIcon"><HomeIcon type="people" /></span>
            <div>
              <h2 id="payment-agency-modal-title">Pending Payment by Agencies</h2>
              <p>Showing agencies with their pending payment amounts.</p>
            </div>
          </div>
          <button type="button" className="homePaymentModalClose" onClick={onClose} aria-label="Close pending payment by agencies">
            x
          </button>
        </div>

        <div className="homeAgencyPaymentTableWrap">
          <table className="homeAgencyPaymentTable">
            <thead>
              <tr>
                <th rowSpan="2">Agency</th>
                <th colSpan="3">Pending Amount</th>
              </tr>
              <tr>
                <th>INR</th>
                <th>EUR</th>
                <th>USD</th>
              </tr>
            </thead>
            <tbody>
              {agencies.length ? (
                agencies.map((agency) => {
                  const pending = agency.pendingByCurrency || {};
                  return (
                    <tr key={agency.agencyId || agency.agencyName}>
                      <td>{agency.agencyName || "Unknown Agency"}</td>
                      <td className="homeAgencyAmount homeAgencyAmountInr">{formatCurrencyAmount(pending.INR || 0, "INR", true)}</td>
                      <td className="homeAgencyAmount homeAgencyAmountEur">{formatCurrencyAmount(pending.EUR || 0, "EUR", true)}</td>
                      <td className="homeAgencyAmount homeAgencyAmountUsd">{formatCurrencyAmount(pending.USD || 0, "USD", true)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4" className="homeAgencyEmpty">No agency payment data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AccountantCurrencyTile({ currency, amount }) {
  const symbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : "$";
  return (
    <div className={`accountantCurrencyTile accountantCurrencyTile-${currency.toLowerCase()}`}>
      <span className="accountantCurrencyIcon">{symbol}</span>
      <div>
        <span>{currency}</span>
        <strong>{formatCurrencyAmount(amount || 0, currency, true)}</strong>
      </div>
    </div>
  );
}

function AccountantPaymentsHome({ summary, onOpenFilter }) {
  const payments = summary?.accountantPayments || {};
  const totals = payments.totalByCurrency || {};
  const agencies = Array.isArray(payments.agencies) ? payments.agencies : [];

  return (
    <section className="accountantHomeSections">
      <article className="accountantPaymentPanel accountantPaymentPanelTotal">
        <div className="accountantPaymentPanelHeader">
          <div className="accountantPaymentPanelTitle">
            <span className="accountantPanelIcon"><HomeIcon type="payment" /></span>
            <div>
              <h2>Total Payment Received</h2>
              <p>For selected date range</p>
            </div>
          </div>
          <button type="button" onClick={() => onOpenFilter("payment_received", true)}>
            View Details <span aria-hidden="true">-&gt;</span>
          </button>
        </div>
        <div className="accountantCurrencyGrid">
          {["INR", "EUR", "USD"].map((currency) => (
            <AccountantCurrencyTile key={currency} currency={currency} amount={totals[currency] || 0} />
          ))}
        </div>
      </article>

      <article className="accountantPaymentPanel accountantPaymentPanelAgents">
        <div className="accountantPaymentPanelHeader">
          <div className="accountantPaymentPanelTitle">
            <span className="accountantPanelIcon accountantPanelIconGreen"><HomeIcon type="people" /></span>
            <div>
              <h2>Total Payment Received Agent Wise</h2>
              <p>For selected date range</p>
            </div>
          </div>
        </div>
        <div className="accountantAgentTableWrap">
          <table className="accountantAgentTable">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>INR (₹)</th>
                <th>EUR (€)</th>
                <th>USD ($)</th>
              </tr>
            </thead>
            <tbody>
              {agencies.length ? (
                agencies.map((agency) => {
                  const received = agency.receivedByCurrency || {};
                  return (
                    <tr key={agency.agencyId || agency.agencyName}>
                      <td>{agency.agencyName || "Unknown Agent"}</td>
                      <td className="accountantAmountInr">{formatCurrencyAmount(received.INR || 0, "INR", true)}</td>
                      <td className="accountantAmountEur">{formatCurrencyAmount(received.EUR || 0, "EUR", true)}</td>
                      <td className="accountantAmountUsd">{formatCurrencyAmount(received.USD || 0, "USD", true)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4" className="accountantAgentEmpty">No received payments found for the selected date range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

const bulkDispatchSelectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 8,
    borderColor: state.isFocused ? "#2563eb" : "#d0d5dd",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37,99,235,.12)" : "none",
    "&:hover": {
      borderColor: state.isFocused ? "#2563eb" : "#b8c4d6"
    }
  }),
  menu: (base) => ({
    ...base,
    zIndex: 1600
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 6,
    background: "#eef4ff"
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "#0052cc",
    fontWeight: 600
  })
};

function getApplicantDisplayName(applicant) {
  return (
    applicant.fullName ||
    [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
    applicant.name ||
    "Unnamed applicant"
  );
}

const BulkDispatchDateInput = React.forwardRef(({ value, onClick, placeholder }, ref) => (
  <button type="button" className="bulkDispatchDateInput" onClick={onClick} ref={ref}>
    <span>{value || placeholder}</span>
  </button>
));

BulkDispatchDateInput.displayName = "BulkDispatchDateInput";

function RequiredMark() {
  return <span className="bulkDispatchRequired">*</span>;
}

function BulkDispatchModal({
  open,
  countries,
  companies,
  onClose,
  onSaved
}) {
  const [form, setForm] = useState({
    awbNumber: "",
    trackingUrl: "",
    dispatchDate: "",
    note: ""
  });
  const [countryId, setCountryId] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState([]);
  const [applicantOptions, setApplicantOptions] = useState([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetState = useCallback(() => {
    setForm({ awbNumber: "", trackingUrl: "", dispatchDate: "", note: "" });
    setCountryId("");
    setSelectedCompanyIds([]);
    setSelectedApplicantIds([]);
    setApplicantOptions([]);
    setLoadingApplicants(false);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const countryOptions = useMemo(
    () => countries.map((country) => ({ value: country.id, label: country.name })),
    [countries]
  );

  const companyOptions = useMemo(
    () =>
      companies
        .filter((company) => !countryId || company.countryId === countryId)
        .map((company) => ({ value: company.id, label: company.name })),
    [companies, countryId]
  );

  const selectedDate = parseDateInput(form.dispatchDate);

  useEffect(() => {
    setSelectedCompanyIds((current) =>
      current.filter((id) => companyOptions.some((option) => option.value === id))
    );
  }, [companyOptions]);

  useEffect(() => {
    let isActive = true;

    async function loadApplicantsForCompanies() {
      if (!selectedCompanyIds.length) {
        setApplicantOptions([]);
        setSelectedApplicantIds([]);
        return;
      }

      try {
        setLoadingApplicants(true);
        const response = await API.get("/applicants", {
          params: {
            lite: "true",
            paginated: "false",
            country: countryId,
            company: selectedCompanyIds.join(",")
          }
        });
        const records = Array.isArray(response.data) ? response.data : normalizeListResponse(response.data);
        const options = records
          .filter((applicant) => Number(applicant.stage || 1) < 7)
          .map((applicant) => ({
            value: applicant.id,
            label: getApplicantDisplayName(applicant),
            meta: [
              applicant.companyName,
              applicant.workflowStatus ? resolveApplicantWorkflowMeta(applicant).title : ""
            ].filter(Boolean).join(" - ")
          }));

        if (isActive) {
          setApplicantOptions(options);
          setSelectedApplicantIds((current) =>
            current.filter((id) => options.some((option) => option.value === id))
          );
        }
      } catch (error) {
        console.error(error);
        if (isActive) {
          setApplicantOptions([]);
          setSelectedApplicantIds([]);
          toast.error("Failed to load applicants");
        }
      } finally {
        if (isActive) setLoadingApplicants(false);
      }
    }

    loadApplicantsForCompanies();
    return () => {
      isActive = false;
    };
  }, [countryId, selectedCompanyIds]);

  if (!open) return null;

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.awbNumber.trim() || !form.trackingUrl.trim() || !form.dispatchDate) {
      toast.error("AWB number, tracking URL and dispatch date are required");
      return;
    }
    if (!countryId || !selectedCompanyIds.length || !selectedApplicantIds.length) {
      toast.error("Select country, companies and applicants");
      return;
    }

    try {
      setSaving(true);
      const response = await API.post("/applicants/bulk-dispatch", {
        awbNumber: form.awbNumber.trim(),
        trackingUrl: form.trackingUrl.trim(),
        dispatchDate: form.dispatchDate,
        note: form.note.trim(),
        applicantIds: selectedApplicantIds
      });
      const savedCount = Number(response.data?.savedCount || selectedApplicantIds.length);
      const skippedCount = Number(response.data?.skippedCount || 0);
      toast.success(
        skippedCount
          ? `Dispatch saved for ${savedCount} applicants. ${skippedCount} skipped.`
          : `Dispatch saved for ${savedCount} applicants.`
      );
      if (typeof onSaved === "function") await onSaved();
      resetState();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save bulk dispatch");
    } finally {
      setSaving(false);
    }
  };

  const selectedCountry = countryOptions.find((option) => option.value === countryId) || null;
  const selectedCompanies = companyOptions.filter((option) => selectedCompanyIds.includes(option.value));
  const selectedApplicants = applicantOptions.filter((option) => selectedApplicantIds.includes(option.value));

  return (
    <div className="bulkDispatchOverlay" role="presentation">
      <div className="bulkDispatchModal" role="dialog" aria-modal="true" aria-labelledby="bulk-dispatch-title">
        <div className="bulkDispatchHeader">
          <div>
            <h2 id="bulk-dispatch-title">Add Bulk Dispatch</h2>
            <p>Add dispatch details and apply to multiple applicants.</p>
          </div>
          <button type="button" className="bulkDispatchCloseBtn" onClick={onClose} aria-label="Close bulk dispatch">
            x
          </button>
        </div>

        <div className="bulkDispatchSection">
          <h3>1. Dispatch Details</h3>
          <div className="bulkDispatchGrid bulkDispatchGridThree">
            <label>
              <span>AWB Number <RequiredMark /></span>
              <input name="awbNumber" value={form.awbNumber} onChange={handleFieldChange} placeholder="Enter AWB number" disabled={saving} />
            </label>
            <label>
              <span>Tracking URL <RequiredMark /></span>
              <input name="trackingUrl" value={form.trackingUrl} onChange={handleFieldChange} placeholder="Enter tracking URL" disabled={saving} />
            </label>
            <label>
              <span>Dispatch Date <RequiredMark /></span>
              <DatePicker
                selected={selectedDate}
                onChange={(date) => setForm((current) => ({ ...current, dispatchDate: date ? formatDateInput(date) : "" }))}
                dateFormat="dd/MM/yyyy"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                customInput={<BulkDispatchDateInput placeholder="Select date" />}
                disabled={saving}
              />
            </label>
          </div>

          <label className="bulkDispatchNoteField">
            <span>Dispatch Note</span>
            <textarea
              name="note"
              value={form.note}
              maxLength={500}
              onChange={handleFieldChange}
              placeholder="Enter dispatch note"
              disabled={saving}
            />
            <small>{form.note.length}/500</small>
          </label>
        </div>

        <div className="bulkDispatchSection">
          <h3>2. Select Recipients</h3>
          <div className="bulkDispatchGrid bulkDispatchRecipientGrid">
            <label>
              <span>Country <RequiredMark /></span>
              <Select
                options={countryOptions}
                value={selectedCountry}
                onChange={(option) => {
                  setCountryId(option?.value || "");
                  setSelectedCompanyIds([]);
                  setSelectedApplicantIds([]);
                }}
                isDisabled={saving}
                placeholder="Select country"
                styles={bulkDispatchSelectStyles}
              />
            </label>
            <label>
              <span>Companies <RequiredMark /></span>
              <Select
                isMulti
                options={companyOptions}
                value={selectedCompanies}
                onChange={(options) => {
                  setSelectedCompanyIds((options || []).map((option) => option.value));
                  setSelectedApplicantIds([]);
                }}
                isDisabled={saving || !countryId}
                placeholder="Select companies"
                styles={bulkDispatchSelectStyles}
              />
            </label>
            <label className="bulkDispatchFullField">
              <span>Applicants <RequiredMark /></span>
              <Select
                isMulti
                options={applicantOptions}
                value={selectedApplicants}
                onChange={(options) => setSelectedApplicantIds((options || []).map((option) => option.value))}
                isDisabled={saving || !selectedCompanyIds.length || loadingApplicants}
                isLoading={loadingApplicants}
                placeholder="Select applicants"
                formatOptionLabel={(option) => (
                  <div className="bulkDispatchApplicantOption">
                    <span>{option.label}</span>
                    {option.meta ? <small>{option.meta}</small> : null}
                  </div>
                )}
                styles={bulkDispatchSelectStyles}
              />
            </label>
          </div>

          <div className="bulkDispatchInfo">
            <strong>{selectedApplicantIds.length} applicants selected</strong>
            <span>Applicants are loaded from the selected country and companies.</span>
          </div>
        </div>

        <div className="bulkDispatchFooter">
          <button type="button" className="dashboardSecondaryBtn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="dashboardPrimaryBtn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Add Dispatch"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardHome({
  summary,
  fromDate,
  toDate,
  dateError,
  onDateChange,
  onApply,
  onOpenFilter,
  onViewAll,
  applying,
  showPaymentCard = true,
  showAgencyPaymentBreakdown = false,
  showUploadPendingCards = true,
  showWorkflowPendingCards = false,
  isAccountantHome = false
}) {
  const [showStagePaymentModal, setShowStagePaymentModal] = useState(false);
  const [showAgencyPaymentModal, setShowAgencyPaymentModal] = useState(false);
  const upcoming = summary?.upcoming || {};
  const overdue = summary?.overdue || {};
  const payments = summary?.payments || {};
  const pendingByCurrency = payments.pendingByCurrency || {};
  const paymentStages = payments.stages || {};
  const paymentAgencies = Array.isArray(payments.agencies) ? payments.agencies : [];
  const selectedFromDate = parseDateInput(fromDate);
  const selectedToDate = parseDateInput(toDate);

  return (
    <main className="dashboardHome">
      <BlockingLoader open={applying} label="Loading dashboard..." />
      {showPaymentCard ? (
        <section className="homeSection homePaymentSection">
          <div className="homePaymentOverview">
            <div className="homePaymentOverviewMain">
              <div className="homePaymentOverviewTitle">
                <span className="homePaymentOverviewIcon"><HomeIcon type="payment" /></span>
                <div>
                  <h2>Total Pending Payment Overview</h2>
                </div>
              </div>
              <div className="homePaymentOverviewAmounts">
                {["INR", "EUR", "USD"].map((currency) => (
                  <div className={`homePaymentCurrency homePaymentCurrency-${currency.toLowerCase()}`} key={currency}>
                    <span className="homePaymentCurrencySymbol">
                      {currency === "INR" ? "₹" : currency === "EUR" ? "€" : "$"}
                    </span>
                    <div>
                      <span>{currency}</span>
                      <strong>{formatCurrencyAmount(pendingByCurrency[currency] || 0, currency, true)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="homePaymentOverviewApplicants">
              <span className="homePaymentOverviewApplicantsIcon"><HomeIcon type="people" /></span>
              <div>
                <span>Applicants with Pending Payments</span>
                <strong>{payments.applicantsWithPendingPayment || 0} <small>Applicants</small></strong>
              </div>
              <button type="button" onClick={() => onOpenFilter("pending_payment", false)}>
                View Applicants <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="homePaymentOverviewActions">
              <button type="button" onClick={() => setShowStagePaymentModal(true)}>
                <span className="homePaymentActionLabel">
                  <span className="homePaymentActionIcon"><HomeIcon type="calendar" /></span>
                  <span>View Pending Payment by stage</span>
                </span>
                <span className="homePaymentActionMeta">View details -&gt;</span>
              </button>
              {showAgencyPaymentBreakdown ? (
                <button type="button" onClick={() => setShowAgencyPaymentModal(true)}>
                  <span className="homePaymentActionLabel">
                    <span className="homePaymentActionIcon"><HomeIcon type="people" /></span>
                    <span>View Pending payment by Agencies</span>
                  </span>
                  <span className="homePaymentActionMeta">View details -&gt;</span>
                </button>
              ) : null}
            </div>
          </div>

          <HomePaymentStageModal
            open={showStagePaymentModal}
            paymentStages={paymentStages}
            onClose={() => setShowStagePaymentModal(false)}
            onOpenFilter={onOpenFilter}
          />
          <HomePaymentAgencyModal
            open={showAgencyPaymentModal}
            agencies={paymentAgencies}
            onClose={() => setShowAgencyPaymentModal(false)}
          />

        </section>
      ) : null}

      <section className="homeDateCard">
        <div>
          <div className="homeDateControls">
            <DatePicker
              selected={selectedFromDate}
              onChange={(date) => onDateChange("fromDate", date ? formatDateInput(date) : "")}
              dateFormat="dd/MM/yyyy"
              maxDate={selectedToDate || undefined}
              selectsStart
              startDate={selectedFromDate}
              endDate={selectedToDate}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              isClearable
              customInput={<HomeDatePickerInput placeholder="From date" ariaLabel="From date" />}
            />
            <span className="homeDateSeparator">-</span>
            <DatePicker
              selected={selectedToDate}
              onChange={(date) => onDateChange("toDate", date ? formatDateInput(date) : "")}
              dateFormat="dd/MM/yyyy"
              minDate={selectedFromDate || undefined}
              selectsEnd
              startDate={selectedFromDate}
              endDate={selectedToDate}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              isClearable
              customInput={<HomeDatePickerInput placeholder="To date" ariaLabel="To date" />}
            />
            <button type="button" className="dashboardPrimaryBtn" onClick={onApply} disabled={applying}>
              {applying ? "Loading..." : "Apply"}
            </button>
          </div>
          {dateError ? <div className="homeDateError">{dateError}</div> : null}
        </div>
        <button type="button" className="homeViewAllBtn" onClick={onViewAll}>View All Applicants <span aria-hidden="true">&gt;</span></button>
      </section>

      {isAccountantHome ? (
        <AccountantPaymentsHome summary={summary} onOpenFilter={onOpenFilter} />
      ) : (
        <>

      <section className="homeSection">
        {/* <h2>Upcoming Actions</h2> */}
        <div className="homeCardGrid homeCardGridFour">
          <HomeMetricCard title="Embassy Appointments" count={upcoming.embassyAppointment?.count} tone="orange" icon="calendar" onClick={() => onOpenFilter("embassy_appointment", true)} />
          <HomeMetricCard title="Embassy Interviews" count={upcoming.embassyInterview?.count} tone="purple" icon="people" onClick={() => onOpenFilter("embassy_interview", true)} />
          <HomeMetricCard title="TRC Collection" count={upcoming.visaCollection?.count} tone="green" icon="visa" onClick={() => onOpenFilter("visa_collection", true)} />
          <HomeMetricCard title="Applicants Arriving" count={upcoming.arriving?.count} tone="blue" icon="plane" onClick={() => onOpenFilter("arriving", true)} />
        </div>
      </section>

      {showUploadPendingCards ? (
      <section className="homeSection">
        {/* <h2>Action Pending (Overdue)</h2> */}
        <div className="homeCardGrid homeCardGridThree">
          <HomeMetricCard title="Biometric Upload Pending - Embassy Appointment" count={overdue.appointmentBiometricPending?.count} tone="blue" icon="calendar" onClick={() => onOpenFilter("appointment_biometric_pending", false)} />
          <HomeMetricCard title="Biometric Upload Pending - Embassy Interview" count={overdue.interviewBiometricPending?.count} tone="blue" icon="fingerprint" onClick={() => onOpenFilter("interview_biometric_pending", false)} />
          <HomeMetricCard title="TRC Upload Pending" count={overdue.trpPending?.count} tone="blue" icon="document" onClick={() => onOpenFilter("trp_pending", false)} />
        </div>
      </section>
      ) : null}

      {showWorkflowPendingCards ? (
        <section className="homeSection">
          <div className="homeCardGrid homeCardGridTwo">
            <HomeMetricCard title="Arrival Ticket Upload Pending" count={overdue.arrivalTicketPending?.count} tone="orange" icon="plane" onClick={() => onOpenFilter("arrival_ticket_pending", false)} />
            <HomeMetricCard title="Document Dispatch Pending" count={overdue.documentDispatchPending?.count} tone="purple" icon="document" onClick={() => onOpenFilter("document_dispatch_pending", false)} />
          </div>
        </section>
      ) : null}
        </>
      )}

    </main>
  );
}

function formatApplicantPendingAmount(value, currency) {
  return formatCurrencyAmount(value, normalizeCurrency(currency));
}

function getMultiParam(searchParams, key) {
  return (searchParams.get(key) || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseDate(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "object" && value._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExcelDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN");
}

function resolveAge(applicant) {
  const directAge = Number(applicant?.age ?? applicant?.personalDetails?.age);
  if (Number.isFinite(directAge) && directAge > 0) return directAge;
  const dob = applicant?.dob || applicant?.personalDetails?.dob;
  if (!dob) return "-";
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) return "-";
  const now = new Date();
  let age = now.getFullYear() - dobDate.getFullYear();
  const monthDiff = now.getMonth() - dobDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dobDate.getDate())) age -= 1;
  return age >= 0 ? age : "-";
}

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function incrementCount(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function countBy(items, keyResolver) {
  const counts = new Map();
  items.forEach((item) => {
    incrementCount(counts, keyResolver(item));
  });
  return counts;
}

function ApplicantsDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(() => getStoredUser());
  const [applicants, setApplicants] = useState([]);
  const [countries, setCountries] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [applicantsPagination, setApplicantsPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1
  });
  const [entityPagination, setEntityPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1
  });
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [entityModalType, setEntityModalType] = useState("");
  const [entityEditData, setEntityEditData] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showBulkDispatchModal, setShowBulkDispatchModal] = useState(false);
  const [homeSummary, setHomeSummary] = useState(null);
  const [homeApplyLoading, setHomeApplyLoading] = useState(false);
  const isSuperUser = isSuperUserLikeRole(user?.role);
  const isEmployer = user?.role === "EMPLOYER";
  const isAgency = user?.role === "AGENCY";
  const isJuniorAccountant = user?.role === "JUNIOR_ACCOUNTANT";
  const isSeniorAccountant = user?.role === "SENIOR_ACCOUNTANT";
  const isAccountantHomeUser = isJuniorAccountant || isSeniorAccountant;
  const defaultHomeRange = useMemo(() => getDefaultHomeRange(user?.role), [user?.role]);
  const storedHomeRange = useMemo(
    () => (isAccountantHomeUser ? defaultHomeRange : readStoredHomeRange(defaultHomeRange)),
    [defaultHomeRange, isAccountantHomeUser]
  );
  const [retainedHomeRange, setRetainedHomeRange] = useState(storedHomeRange);
  const [homeDateDraft, setHomeDateDraft] = useState(storedHomeRange);
  const [homeDateError, setHomeDateError] = useState("");
  const canViewHomeDashboard = isSuperUser || isEmployer || isAgency || isAccountantHomeUser;

  const activeTab = TAB_CONFIG[searchParams.get("tab")]
    ? searchParams.get("tab")
    : canViewHomeDashboard
      ? "home"
      : "applicants";
  const searchText = searchParams.get("q") || "";
  const applicantTypes = useMemo(() => getMultiParam(searchParams, "type"), [searchParams]);
  const countryIds = useMemo(() => getMultiParam(searchParams, "country"), [searchParams]);
  const companyIds = useMemo(() => getMultiParam(searchParams, "company"), [searchParams]);
  const agencyIds = useMemo(() => getMultiParam(searchParams, "agency"), [searchParams]);
  const notificationApplicantIds = useMemo(() => getMultiParam(searchParams, "notificationApplicants"), [searchParams]);
  const notificationTitle = searchParams.get("notificationTitle") || "";
  const dashboardFilter = searchParams.get("dashboardFilter") || "";
  const homeFromDate = searchParams.get("fromDate") || retainedHomeRange.fromDate;
  const homeToDate = searchParams.get("toDate") || retainedHomeRange.toDate;
  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));

  useEffect(() => {
    if (searchParams.get("fromDate") || searchParams.get("toDate")) return;
    setRetainedHomeRange(storedHomeRange);
    setHomeDateDraft(storedHomeRange);
  }, [searchParams, storedHomeRange]);

  useEffect(() => {
    setHomeDateDraft({ fromDate: homeFromDate, toDate: homeToDate });
    setHomeDateError("");
  }, [homeFromDate, homeToDate]);

  useEffect(() => {
    setSearchInput(searchText);
  }, [searchText]);

  const updateFilters = useCallback(
    (updates) => {
      const next = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          value === 1 ||
          (Array.isArray(value) && value.length === 0)
        ) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
      });

      if (!Object.prototype.hasOwnProperty.call(updates, "page")) {
        next.delete("page");
      }

      if (next.toString() === searchParams.toString()) {
        return;
      }

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const loadDashboardData = useCallback(async () => {
    try {
      const applicantsParams = {
        lite: "true",
        paginated: "true",
        page: currentPage,
        limit: PAGE_SIZE,
        q: searchText || "",
        type: applicantTypes.join(","),
        country: countryIds.join(","),
        company: companyIds.join(","),
        agency: agencyIds.join(","),
        notificationApplicants: notificationApplicantIds.join(","),
        markNotificationsRead: searchParams.get("markNotificationsRead") || "",
        dashboardFilter,
        fromDate: searchParams.get("fromDate") || "",
        toDate: searchParams.get("toDate") || ""
      };
      const entityParams = {
        paginated: "true",
        page: currentPage,
        limit: PAGE_SIZE,
        q: searchText || "",
        country: countryIds.join(","),
        company: companyIds.join(","),
        sortBy: "createdAt",
        sortOrder: "desc"
      };

      const hasBootstrapCache =
        hasFreshCache("/auth/me") &&
        hasFreshCache("/countries") &&
        hasFreshCache("/applicants", { params: applicantsParams });
      const shouldUsePageLoader = !hasLoadedOnce && !hasBootstrapCache;

      setLoading(shouldUsePageLoader);
      setIsRefreshing(!shouldUsePageLoader);

      const [userData, countriesData, applicantsData] = await Promise.all([
        user ? Promise.resolve(user) : getCached("/auth/me", { ttlMs: 120000 }),
        getCached("/countries", { ttlMs: 120000 }),
        activeTab === "home"
          ? Promise.resolve({ items: [], pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 } })
          : getCached("/applicants", { params: applicantsParams, ttlMs: 15000 })
      ]);

      setUser(userData || null);
      setCountries(Array.isArray(countriesData) ? countriesData : []);
      const normalizedApplicants = Array.isArray(applicantsData)
        ? applicantsData
        : Array.isArray(applicantsData?.items)
          ? applicantsData.items
          : [];
      setApplicants(normalizedApplicants);
      setApplicantsPagination({
        page: Number(applicantsData?.pagination?.page || currentPage),
        limit: Number(applicantsData?.pagination?.limit || PAGE_SIZE),
        total: Number(applicantsData?.pagination?.total || normalizedApplicants.length),
        totalPages: Number(applicantsData?.pagination?.totalPages || 1)
      });

      if (activeTab === "home" && canViewHomeDashboard) {
        const dashboardData = await getCached("/dashboard", {
          params: {
            fromDate: homeFromDate,
            toDate: homeToDate
          },
          ttlMs: 15000
        });
        setHomeSummary(dashboardData?.home || null);
        setCompanies([]);
        setAgencies([]);
      } else if (activeTab === "companies") {
        const companiesData = await getCached("/companies", {
          params: {
            paginated: "true",
            page: currentPage,
            limit: PAGE_SIZE,
            q: searchText || "",
            countryId: countryIds[0] || "",
            company: companyIds.join(","),
            fields: COMPANY_LOOKUP_FIELDS,
            sortBy: "createdAt",
            sortOrder: "desc"
          },
          ttlMs: 30000
        });
        const normalizedCompanies = Array.isArray(companiesData)
          ? companiesData
          : Array.isArray(companiesData?.items)
            ? companiesData.items
            : [];
        setCompanies(normalizedCompanies);
        setEntityPagination({
          page: Number(companiesData?.pagination?.page || currentPage),
          limit: Number(companiesData?.pagination?.limit || PAGE_SIZE),
          total: Number(companiesData?.pagination?.total || normalizedCompanies.length),
          totalPages: Number(companiesData?.pagination?.totalPages || 1)
        });
        const employersData = await getCached("/employers", {
          params: { paginated: "false", fields: EMPLOYER_LOOKUP_FIELDS },
          ttlMs: 60000
        });
        setEmployers(Array.isArray(employersData) ? employersData : []);
      } else if (activeTab === "employers") {
        const [companiesData, employersData] = await Promise.all([
          getCached("/companies", {
            params: { paginated: "false", fields: COMPANY_LOOKUP_FIELDS },
            ttlMs: 60000
          }),
          getCached("/employers", {
            params: { ...entityParams, fields: EMPLOYER_LOOKUP_FIELDS },
            ttlMs: 30000
          })
        ]);
        setCompanies(normalizeListResponse(companiesData));
        const normalizedEmployers = Array.isArray(employersData)
          ? employersData
          : Array.isArray(employersData?.items)
            ? employersData.items
            : [];
        setEmployers(normalizedEmployers);
        setEntityPagination({
          page: Number(employersData?.pagination?.page || currentPage),
          limit: Number(employersData?.pagination?.limit || PAGE_SIZE),
          total: Number(employersData?.pagination?.total || normalizedEmployers.length),
          totalPages: Number(employersData?.pagination?.totalPages || 1)
        });
      } else if (activeTab === "agencies") {
        const [companiesData, agenciesData] = await Promise.all([
          getCached("/companies", {
            params: { paginated: "false", fields: COMPANY_LOOKUP_FIELDS },
            ttlMs: 60000
          }),
          getCached("/agencies", {
            params: { ...entityParams, fields: AGENCY_LOOKUP_FIELDS },
            ttlMs: 30000
          })
        ]);
        setCompanies(normalizeListResponse(companiesData));
        const normalizedAgencies = Array.isArray(agenciesData)
          ? agenciesData
          : Array.isArray(agenciesData?.items)
            ? agenciesData.items
            : [];
        setAgencies(normalizedAgencies);
        setEntityPagination({
          page: Number(agenciesData?.pagination?.page || currentPage),
          limit: Number(agenciesData?.pagination?.limit || PAGE_SIZE),
          total: Number(agenciesData?.pagination?.total || normalizedAgencies.length),
          totalPages: Number(agenciesData?.pagination?.totalPages || 1)
        });
      } else {
        const [companiesData, agenciesData] = await Promise.all([
          getCached("/companies", {
            params: { paginated: "false", fields: COMPANY_LOOKUP_FIELDS },
            ttlMs: 60000
          }),
          isSuperUser
            ? getCached("/agencies", {
                params: { paginated: "false", fields: AGENCY_LOOKUP_FIELDS },
                ttlMs: 30000
              })
            : Promise.resolve([])
        ]);
        setCompanies(normalizeListResponse(companiesData));
        setAgencies(normalizeListResponse(agenciesData));
      }

      setIsRefreshing(false);
    } catch (error) {
      console.error(error);
      setIsRefreshing(false);
    } finally {
      setHasLoadedOnce(true);
      setLoading(false);
      setHomeApplyLoading(false);
    }
  }, [
    activeTab,
    agencyIds,
    applicantTypes,
    companyIds,
    countryIds,
    currentPage,
    dashboardFilter,
    hasLoadedOnce,
    homeFromDate,
    homeToDate,
    canViewHomeDashboard,
    isSuperUser,
    notificationApplicantIds,
    searchText,
    searchParams,
    user
  ]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, refreshKey]);

  const countryMap = useMemo(
    () => Object.fromEntries(countries.map((country) => [country.id, country.name])),
    [countries]
  );
  const companyMap = useMemo(
    () => Object.fromEntries(companies.map((company) => [company.id, company])),
    [companies]
  );
  const employerMap = useMemo(
    () => Object.fromEntries(employers.map((employer) => [employer.id, employer])),
    [employers]
  );

  const visibleCompanies = useMemo(() => {
    if (!countryIds.length) return companies;
    return companies.filter((company) => countryIds.includes(company.countryId));
  }, [companies, countryIds]);

  const applicantWorkflowCounts = useMemo(
    () => countBy(applicants, (applicant) => applicant.workflowStatus),
    [applicants]
  );
  const applicantCountryCounts = useMemo(
    () => countBy(applicants, (applicant) => applicant.countryId),
    [applicants]
  );
  const applicantCompanyCounts = useMemo(
    () => countBy(applicants, (applicant) => applicant.companyId),
    [applicants]
  );
  const applicantAgencyCounts = useMemo(
    () => countBy(applicants, (applicant) => applicant.agencyId),
    [applicants]
  );
  const companyCountryCounts = useMemo(
    () => countBy(companies, (company) => company.countryId),
    [companies]
  );
  const employerCountryCounts = useMemo(
    () => countBy(employers, (employer) => employer.countryId),
    [employers]
  );
  const employerCompanyCounts = useMemo(
    () => countBy(employers, (employer) => employer.companyId),
    [employers]
  );
  const visibleCompanyCountryCounts = useMemo(
    () => countBy(visibleCompanies, (company) => company.countryId),
    [visibleCompanies]
  );
  const agencyCompanyCounts = useMemo(() => {
    const counts = new Map();
    agencies.forEach((agency) => {
      (agency.assignedCompanyIds || []).forEach((companyId) => incrementCount(counts, companyId));
    });
    return counts;
  }, [agencies]);
  const agencyCountryCounts = useMemo(() => {
    const counts = new Map();
    agencies.forEach((agency) => {
      const countryIdsForAgency = new Set(
        (agency.assignedCompanyIds || [])
          .map((companyId) => companyMap[companyId]?.countryId)
          .filter(Boolean)
      );
      countryIdsForAgency.forEach((countryId) => incrementCount(counts, countryId));
    });
    return counts;
  }, [agencies, companyMap]);
  const attentionRequiredCount = useMemo(
    () => applicants.reduce((total, applicant) => total + (applicant.attentionRequired ? 1 : 0), 0),
    [applicants]
  );

  useEffect(() => {
    if (companyIds.length && companyIds.some((id) => !visibleCompanies.some((company) => company.id === id))) {
      updateFilters({
        company: companyIds.filter((id) => visibleCompanies.some((company) => company.id === id)),
        page: 1
      });
    }
  }, [companyIds, updateFilters, visibleCompanies]);

  const toggleFilterValue = useCallback(
    (key, selectedValues, value) => {
      const nextValues = selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value];
      updateFilters({ [key]: nextValues, page: 1 });
    },
    [updateFilters]
  );

  const filteredApplicants = useMemo(() => applicants, [applicants]);

  const companyRows = useMemo(() => {
    return companies.map((company) => ({
        ...company,
        countryName: countryMap[company.countryId] || "-",
        employerNames: (company.employerIds || [])
          .map((id) => employerMap[id]?.name)
          .filter(Boolean)
          .join(", ")
      }));
  }, [companies, countryMap, employerMap]);

  const employerRows = useMemo(() => {
    return employers;
  }, [employers]);

  const agencyRows = useMemo(() => agencies, [agencies]);

  const sortedApplicants = useMemo(() => {
    return [...filteredApplicants].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
  }, [filteredApplicants]);

  const sortedCompanyRows = useMemo(
    () => [...companyRows].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt)),
    [companyRows]
  );
  const sortedEmployerRows = useMemo(
    () => [...employerRows].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt)),
    [employerRows]
  );
  const sortedAgencyRows = useMemo(
    () => [...agencyRows].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt)),
    [agencyRows]
  );

  const currentRows = useMemo(() => {
    if (activeTab === "companies") return sortedCompanyRows;
    if (activeTab === "employers") return sortedEmployerRows;
    if (activeTab === "agencies") return sortedAgencyRows;
    return sortedApplicants;
  }, [activeTab, sortedAgencyRows, sortedApplicants, sortedCompanyRows, sortedEmployerRows]);

  const totalRows = activeTab === "applicants" ? applicantsPagination.total : entityPagination.total;
  const totalPages = activeTab === "applicants"
    ? Math.max(1, applicantsPagination.totalPages)
    : Math.max(1, entityPagination.totalPages);
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (safePage !== currentPage) {
      updateFilters({ page: safePage });
    }
  }, [currentPage, safePage, updateFilters]);

  const paginatedRows = useMemo(() => {
    return currentRows;
  }, [currentRows]);

  const applicantTypeOptions = useMemo(() => {
    const options = [
      {
        value: "in_progress",
        label: "In Progress",
        count: applicantWorkflowCounts.get("in_progress") || 0
      }
    ];

    if (!isEmployer) {
      options.push({
        value: "attention_required",
        label: "Attention required",
        count: attentionRequiredCount
      });
    }

    options.push({
      value: "completed",
      label: "Completed",
      count: applicantWorkflowCounts.get("completed") || 0
    });

    return options;
  }, [applicantWorkflowCounts, attentionRequiredCount, isEmployer]);

  const countryOptions = useMemo(() => {
    const mappedCountryIds =
      isAgency || isEmployer
        ? new Set(visibleCompanies.map((company) => company.countryId).filter(Boolean))
        : null;

    return countries
      .filter((country) => !mappedCountryIds || mappedCountryIds.has(country.id))
      .map((country) => ({
        value: country.id,
        label: country.name,
        count: mappedCountryIds
          ? visibleCompanyCountryCounts.get(country.id) || 0
          : applicantCountryCounts.get(country.id) || 0
      }))
      .filter((item) => item.count > 0 || !mappedCountryIds);
  }, [applicantCountryCounts, countries, isAgency, isEmployer, visibleCompanies, visibleCompanyCountryCounts]);

  const companyCountryOptions = useMemo(
    () =>
      countries
        .map((country) => ({
          value: country.id,
          label: country.name,
          count: companyCountryCounts.get(country.id) || 0
        }))
        .filter((item) => item.count > 0),
    [companyCountryCounts, countries]
  );

  const employerCountryOptions = useMemo(
    () =>
      countries
        .map((country) => ({
          value: country.id,
          label: country.name,
          count: employerCountryCounts.get(country.id) || 0
        }))
        .filter((item) => item.count > 0),
    [countries, employerCountryCounts]
  );

  const agencyCountryOptions = useMemo(
    () =>
      countries
        .map((country) => ({
          value: country.id,
          label: country.name,
          count: agencyCountryCounts.get(country.id) || 0
        }))
        .filter((item) => item.count > 0),
    [agencyCountryCounts, countries]
  );

  const companyOptions = useMemo(
    () =>
      visibleCompanies.map((company) => ({
        value: company.id,
        label: company.name,
        count: applicantCompanyCounts.get(company.id) || 0
      })),
    [applicantCompanyCounts, visibleCompanies]
  );

  const employerCompanyOptions = useMemo(
    () =>
      visibleCompanies
        .map((company) => ({
          value: company.id,
          label: company.name,
          count: employerCompanyCounts.get(company.id) || 0
        })),
    [employerCompanyCounts, visibleCompanies]
  );

  const agencyCompanyOptions = useMemo(
    () =>
      visibleCompanies
        .map((company) => ({
          value: company.id,
          label: company.name,
          count: agencyCompanyCounts.get(company.id) || 0
        })),
    [agencyCompanyCounts, visibleCompanies]
  );

  const agencyOptions = useMemo(
    () =>
      agencies.map((agency) => ({
        value: agency.id,
        label: agency.name,
        count: applicantAgencyCounts.get(agency.id) || 0
      })),
    [agencies, applicantAgencyCounts]
  );

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const countrySource =
      activeTab === "companies"
        ? companyCountryOptions
        : activeTab === "employers"
          ? employerCountryOptions
          : activeTab === "agencies"
            ? agencyCountryOptions
            : countryOptions;
    const companySource =
      activeTab === "employers"
        ? employerCompanyOptions
        : activeTab === "agencies"
          ? agencyCompanyOptions
          : companyOptions;

    if (activeTab === "applicants") {
      applicantTypeOptions.forEach((item) => {
        if (applicantTypes.includes(item.value)) chips.push({ key: "type", value: item.value, label: item.label });
      });
    }

    countrySource.forEach((item) => {
      if (countryIds.includes(item.value)) chips.push({ key: "country", value: item.value, label: item.label });
    });

    companySource.forEach((item) => {
      if (companyIds.includes(item.value)) chips.push({ key: "company", value: item.value, label: item.label });
    });

    if (activeTab === "applicants") {
      agencies.forEach((item) => {
        if (agencyIds.includes(item.id)) chips.push({ key: "agency", value: item.id, label: item.name });
      });
    }

    return chips;
  }, [
    activeTab,
    agencies,
    agencyCompanyOptions,
    agencyCountryOptions,
    agencyIds,
    applicantTypeOptions,
    applicantTypes,
    companyIds,
    companyCountryOptions,
    companyOptions,
    countryIds,
    countryOptions,
    employerCompanyOptions,
    employerCountryOptions
  ]);

  const resetFilters = () => {
    const next = new URLSearchParams();
    if (activeTab !== "applicants" && activeTab !== "home") {
      next.set("tab", activeTab);
    }
    setSearchParams(next, { replace: true });
  };

  const handleOpenApplicant = (applicantId) => {
    if (isJuniorAccountant) {
      navigate(`/applicants/${applicantId}/payments${window.location.search || ""}`);
      return;
    }
    prefetchCached(`/applicants/${applicantId}/workflow-bundle`, {
      params: { includeDetails: "false" },
      ttlMs: 120000
    });
    navigate(`/applicants/${applicantId}${window.location.search || ""}`);
  };

  const visibleTabs = useMemo(() => {
    if (isSuperUser) return ["home", "applicants", "companies"];
    if (isAgency || isEmployer) return ["home", "applicants", "companies"];
    if (isAccountantHomeUser) return ["home", "applicants"];
    return ["applicants"];
  }, [isAccountantHomeUser, isAgency, isEmployer, isSuperUser]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      const next = new URLSearchParams();
      if (visibleTabs[0] && visibleTabs[0] !== "applicants") {
        next.set("tab", visibleTabs[0]);
      }
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, setSearchParams, visibleTabs]);

  const handleTabChange = (tabKey) => {
    if (!visibleTabs.includes(tabKey)) return;
    const next = new URLSearchParams();
    if (tabKey !== "home" && tabKey !== "applicants") {
      next.set("tab", tabKey);
    } else if (tabKey === "applicants") {
      next.set("tab", "applicants");
    }
    setSearchParams(next, { replace: true });
  };

  const handleHomeDateChange = (key, value) => {
    setHomeDateError("");
    setHomeDateDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleQuickPrint = (applicant) => {
    if (!isEmployer || Number(applicant?.stage || 0) !== 12) return;
    navigate(`/applicants/${applicant.id}/quick-print`);
  };

  const applyHomeDateRange = () => {
    const nextFromDate = homeDateDraft.fromDate || defaultHomeRange.fromDate;
    const nextToDate = homeDateDraft.toDate || defaultHomeRange.toDate;
    const parsedFromDate = parseDateInput(nextFromDate);
    const parsedToDate = parseDateInput(nextToDate);

    if (!parsedFromDate || !parsedToDate) {
      setHomeDateError("Select both from and to dates.");
      return;
    }

    if (parsedFromDate > parsedToDate) {
      setHomeDateError("From date must be before to date.");
      return;
    }

    setHomeApplyLoading(true);
    setRetainedHomeRange({ fromDate: nextFromDate, toDate: nextToDate });
    writeStoredHomeRange({ fromDate: nextFromDate, toDate: nextToDate });
    const next = new URLSearchParams(searchParams);
    next.set("fromDate", nextFromDate);
    next.set("toDate", nextToDate);
    invalidateCache("/dashboard");
    setSearchParams(next, { replace: true });
    setRefreshKey((value) => value + 1);
  };

  const openHomeFilter = (filter, includeDateRange = true) => {
    const next = new URLSearchParams();
    next.set("tab", "applicants");
    next.set("dashboardFilter", filter);
    if (includeDateRange) {
      next.set("fromDate", homeFromDate);
      next.set("toDate", homeToDate);
    }
    setSearchParams(next, { replace: true });
  };

  const handleOpenEntityModal = (type, editData = null) => {
    setEntityModalType(type);
    setEntityEditData(editData);
  };

  const handleOpenApplicantsForCompany = (companyId) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "applicants");
    next.set("company", companyId);
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const handleViewAllApplicants = () => {
    const next = new URLSearchParams();
    next.set("tab", "applicants");
    setSearchParams(next, { replace: true });
  };

  const headerText = useMemo(() => {
    if (activeTab === "companies") return `Showing ${totalRows} companies`;
    if (activeTab === "employers") return `Showing ${totalRows} employers`;
    if (activeTab === "agencies") return `Showing ${totalRows} agencies`;
    if (activeTab === "applicants" && notificationApplicantIds.length) {
      return notificationTitle
        ? `${notificationTitle}: ${totalRows} applicants`
        : `Showing ${totalRows} notification applicants`;
    }
    if (activeTab === "applicants" && DASHBOARD_FILTER_DESCRIPTIONS[dashboardFilter]) {
      return `Showing ${totalRows} applicants ${DASHBOARD_FILTER_DESCRIPTIONS[dashboardFilter]}`;
    }
    return `Showing ${totalRows} applicants`;
  }, [activeTab, dashboardFilter, notificationApplicantIds.length, notificationTitle, totalRows]);

  const searchPlaceholder = useMemo(() => {
    if (activeTab === "companies") return "Search by company name";
    if (activeTab === "employers") return "Search by employer name";
    if (activeTab === "agencies") return "Search by agency name";
    return "Search by name";
  }, [activeTab]);

  const currentActionLabel = TAB_CONFIG[activeTab].actionLabel;
  const showHeaderAction =
    (activeTab === "applicants" && (isSuperUser || isAgency)) ||
    (!["home", "applicants"].includes(activeTab) && isSuperUser);

  const openCurrentAction = () => {
    if (activeTab === "applicants") {
      navigate("/create-applicant");
      return;
    }

    if (activeTab === "companies") {
      navigate("/companies/new");
      return;
    }

    handleOpenEntityModal(
      activeTab === "employers" ? "employer" : "agency"
    );
  };

  const handleBulkDispatchSaved = useCallback(async () => {
    invalidateCache("/applicants");
    invalidateCache("/dashboard");
    setRefreshKey((value) => value + 1);
  }, []);

  const handleExportApplicants = useCallback(async () => {
    try {
      setIsExporting(true);
      const response = await API.get("/applicants", {
        params: {
          paginated: "false",
          q: searchText || "",
          type: applicantTypes.join(","),
          country: countryIds.join(","),
          company: companyIds.join(","),
          agency: agencyIds.join(",")
        }
      });
      const records = Array.isArray(response?.data) ? response.data : [];
      const rows = records.map((applicant) => {
        const fullName =
          applicant.fullName ||
          [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
          "-";
        const dob = applicant?.dob || applicant?.personalDetails?.dob || "";
        const totalPayment = Number(applicant?.payment?.totalInr ?? applicant?.payment?.total ?? 0);
        const paidPayment = Number(applicant?.payment?.paidInr ?? applicant?.payment?.paid ?? 0);
        const pendingPayment = Number(applicant?.payment?.pendingInr ?? applicant?.payment?.pending ?? 0);
        const paymentCurrency = normalizeCurrency(applicant?.payment?.currency || applicant?.paymentCurrency || applicant?.currency);
        return {
          candidateName: fullName,
          dateOfBirth: formatExcelDate(dob),
          age: resolveAge(applicant),
          address: applicant?.address || applicant?.personalDetails?.address || "-",
          contactNumber: applicant?.phone || applicant?.personalDetails?.phone || "-",
          currentStatus: resolveApplicantWorkflowMeta(applicant).title || "-",
          company: applicant?.companyName || "-",
          country: applicant?.countryName || applicant?.country || "-",
          totalPayment: formatCurrencyAmount(totalPayment, paymentCurrency),
          paymentDone: formatCurrencyAmount(paidPayment, paymentCurrency),
          pendingPayment: formatCurrencyAmount(pendingPayment, paymentCurrency)
        };
      });

      const tableRows = rows
        .map(
          (row) => `
          <tr>
            <td>${escapeHtml(row.candidateName)}</td>
            <td>${escapeHtml(row.dateOfBirth)}</td>
            <td>${escapeHtml(row.age)}</td>
            <td>${escapeHtml(row.address)}</td>
            <td>${escapeHtml(row.contactNumber)}</td>
            <td>${escapeHtml(row.currentStatus)}</td>
            <td>${escapeHtml(row.company)}</td>
            <td>${escapeHtml(row.country)}</td>
            <td>${escapeHtml(row.totalPayment || "-")}</td>
            <td>${escapeHtml(row.paymentDone || "-")}</td>
            <td>${escapeHtml(row.pendingPayment || "-")}</td>
          </tr>`
        )
        .join("");

      const content = `
        <html>
          <head><meta charset="UTF-8" /></head>
          <body>
            <table border="1">
              <thead>
                <tr>
                  <th>Candidate Name</th>
                  <th>Date of Birth</th>
                  <th>Age</th>
                  <th>Address</th>
                  <th>Contact number</th>
                  <th>Current status</th>
                  <th>Company</th>
                  <th>Country</th>
                  <th>Total payment</th>
                  <th>Payment done</th>
                  <th>Pending payment</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dashboard-applicants-${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  }, [agencyIds, applicantTypes, companyIds, countryIds, searchText]);

  const applyOptimisticEntityChange = useCallback(
    (change) => {
      if (!change?.type || !change?.operation) return false;
      const { type, operation, id, payload = {} } = change;

      if (type === "company") {
        if (operation === "delete") {
          setCompanies((prev) => prev.filter((item) => item.id !== id));
          return true;
        }
        if (operation === "update") {
          setCompanies((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
          return true;
        }
        if (operation === "create" && id) {
          setCompanies((prev) => [{ id, ...payload, createdAt: Date.now() }, ...prev]);
          return true;
        }
      }

      if (type === "employer") {
        if (operation === "delete") {
          setEmployers((prev) => prev.filter((item) => item.id !== id));
          return true;
        }
        if (operation === "update") {
          setEmployers((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
          return true;
        }
        if (operation === "create" && id) {
          setEmployers((prev) => [{ id, ...payload, createdAt: Date.now() }, ...prev]);
          return true;
        }
      }

      if (type === "agency") {
        if (operation === "delete") {
          setAgencies((prev) => prev.filter((item) => item.id !== id));
          return true;
        }
        if (operation === "update") {
          setAgencies((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
          return true;
        }
        if (operation === "create" && id) {
          setAgencies((prev) => [{ id, ...payload, createdAt: Date.now() }, ...prev]);
          return true;
        }
      }

      return false;
    },
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchText) {
        updateFilters({ q: searchInput, page: 1 });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput, searchText, updateFilters]);

  return (
    <div className="dashboardPage">
      <DashboardTopbar
        user={user}
        showTabs
        tabs={visibleTabs.map((key) => ({ key, label: TAB_CONFIG[key].label }))}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <div className="dashboardContent">
        {loading ? (
          <div className="dashboardContentLoader dashboardTableCard">
            <PageLoader label="Loading dashboard..." />
          </div>
        ) : activeTab === "home" ? (
          <DashboardHome
            summary={homeSummary}
            fromDate={homeDateDraft.fromDate}
            toDate={homeDateDraft.toDate}
            dateError={homeDateError}
            onDateChange={handleHomeDateChange}
            onApply={applyHomeDateRange}
            onOpenFilter={openHomeFilter}
            onViewAll={() => handleTabChange("applicants")}
            applying={homeApplyLoading}
            showPaymentCard={!isEmployer && !isAccountantHomeUser}
            showAgencyPaymentBreakdown={isSuperUser || isJuniorAccountant}
            showUploadPendingCards={!isEmployer}
            showWorkflowPendingCards={isSuperUser || isAgency}
            isAccountantHome={isAccountantHomeUser}
          />
        ) : (
          <>
            <DashboardFiltersSidebar
              searchPlaceholder={searchPlaceholder}
              searchInput={searchInput}
              onSearchInputChange={setSearchInput}
              onResetFilters={resetFilters}
              activeTab={activeTab}
              applicantTypeOptions={applicantTypeOptions}
              applicantTypes={applicantTypes}
              countryIds={countryIds}
              companyIds={companyIds}
              agencyIds={agencyIds}
              companyCountryOptions={companyCountryOptions}
              employerCountryOptions={employerCountryOptions}
              agencyCountryOptions={agencyCountryOptions}
              countryOptions={countryOptions}
              employerCompanyOptions={employerCompanyOptions}
              agencyCompanyOptions={agencyCompanyOptions}
              companyOptions={companyOptions}
              agencyOptions={agencyOptions}
              isSuperUser={isSuperUser}
              onToggleFilterValue={toggleFilterValue}
            />

            <main className="dashboardMain">
              <DashboardResultsHeader
                headerText={headerText}
                isRefreshing={isRefreshing}
                activeFilterChips={activeFilterChips}
                applicantTypes={applicantTypes}
                countryIds={countryIds}
                companyIds={companyIds}
                agencyIds={agencyIds}
                onToggleFilterValue={toggleFilterValue}
                showHeaderAction={showHeaderAction}
                onOpenCurrentAction={openCurrentAction}
                currentActionLabel={currentActionLabel}
                showBulkDispatchAction={isAgency && activeTab === "applicants"}
                onOpenBulkDispatch={() => setShowBulkDispatchModal(true)}
                showExportAction={isSuperUser && activeTab === "applicants"}
                onExport={handleExportApplicants}
                exportLoading={isExporting}
                showViewAllApplicants={
                  activeTab === "applicants" &&
                  Boolean(DASHBOARD_FILTER_DESCRIPTIONS[dashboardFilter])
                }
                onViewAllApplicants={handleViewAllApplicants}
              />

              <div className="dashboardTableCard">
                {activeTab === "applicants" ? (
                  <ApplicantsTable
                    rows={paginatedRows}
                    isEmployer={isEmployer}
                    showAgencyColumn={isSuperUser || isSeniorAccountant}
                    onOpenApplicant={handleOpenApplicant}
                    onQuickPrint={handleQuickPrint}
                    formatPendingAmount={formatApplicantPendingAmount}
                  />
                ) : null}

                {activeTab === "companies" ? (
                  <CompaniesTable
                    rows={paginatedRows}
                    isSuperUser={isSuperUser}
                    rightIconSrc={RIGHT_ICON_SRC}
                    onOpenCompanyEdit={(id) => navigate(`/companies/${id}/edit`)}
                    onOpenApplicantsForCompany={handleOpenApplicantsForCompany}
                  />
                ) : null}

                {activeTab === "employers" ? (
                  <EmployersTable
                    rows={paginatedRows}
                    companyMap={companyMap}
                    countryMap={countryMap}
                    onOpenEmployer={(employer) => handleOpenEntityModal("employer", employer)}
                  />
                ) : null}

            {activeTab === "agencies" ? (
              <AgenciesTable
                rows={paginatedRows}
                companyMap={companyMap}
                countryMap={countryMap}
                onOpenAgency={(agency) => handleOpenEntityModal("agency", agency)}
              />
            ) : null}
          </div>

          <div className="dashboardPagination">
            <button
              type="button"
              className="dashboardPaginationBtn"
              disabled={safePage <= 1}
              onClick={() => updateFilters({ page: safePage - 1 })}
            >
              Previous
            </button>

            <span className="dashboardPaginationText">
              Page {safePage} of {totalPages}
            </span>

            <button
              type="button"
              className="dashboardPaginationBtn"
              disabled={safePage >= totalPages}
              onClick={() => updateFilters({ page: safePage + 1 })}
            >
              Next
            </button>
          </div>
        </main>
          </>
        )}
      </div>

      <BulkDispatchModal
        open={showBulkDispatchModal}
        countries={countries}
        companies={companies}
        onClose={() => setShowBulkDispatchModal(false)}
        onSaved={handleBulkDispatchSaved}
      />

      {entityModalType ? (
        <Suspense fallback={null}>
          <EntityFormModal
            type={entityModalType}
            countries={countries}
            companies={companies}
            employers={employers}
            editData={entityEditData}
            onClose={() => {
              setEntityModalType("");
              setEntityEditData(null);
            }}
            onSaved={async (change) => {
              setEntityModalType("");
              setEntityEditData(null);
              invalidateCache("/companies");
              invalidateCache("/employers");
              invalidateCache("/agencies");
              const applied = applyOptimisticEntityChange(change);
              if (!applied) {
                setRefreshKey((value) => value + 1);
              }
            }}
          />
        </Suspense>
      ) : null}

    </div>
  );
}

export default ApplicantsDashboard;





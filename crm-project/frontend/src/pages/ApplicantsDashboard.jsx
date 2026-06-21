import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
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
import { getStoredUser, isSuperUserLikeRole } from "../utils/auth";
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
const HOME_DATE_RANGE_STORAGE_KEY = "crm_home_dashboard_date_range";
const DASHBOARD_FILTER_DESCRIPTIONS = {
  pending_payment: "having pending payment",
  arriving: "arriving",
  visa_collection: "for visa collection",
  embassy_interview: "having embassy interviews",
  embassy_appointment: "having embassy appointments",
  trp_pending: "with TRP upload pending",
  interview_biometric_pending: "with biometric upload pending after embassy interview",
  appointment_biometric_pending: "with biometric upload pending after embassy appointment"
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

function getDefaultHomeRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 13);
  return {
    fromDate: formatDateInput(start),
    toDate: formatDateInput(end)
  };
}

function readStoredHomeRange(fallbackRange) {
  if (typeof window === "undefined") return fallbackRange;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOME_DATE_RANGE_STORAGE_KEY) || "{}");
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
    window.localStorage.setItem(HOME_DATE_RANGE_STORAGE_KEY, JSON.stringify(range));
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

function HomeMetricCard({ title, subtitle, count, tone, icon, onClick }) {
  return (
    <button type="button" className={`homeMetricCard homeTone-${tone}`} onClick={onClick}>
      <div className="homeMetricBody">
        <span className="homeMetricIcon"><HomeIcon type={icon} /></span>
        <div>
          <div className="homeMetricTitle">{title}</div>
          <div className="homeMetricCount"><strong>{count || 0}</strong><span>Applicants</span></div>
          {subtitle ? <div className="homeMetricSubtitle">{subtitle}</div> : null}
        </div>
      </div>
      <div className="homeMetricFooter"><span>View Details</span><span aria-hidden="true">&gt;</span></div>
    </button>
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
  showPaymentCard = true
}) {
  const upcoming = summary?.upcoming || {};
  const overdue = summary?.overdue || {};
  const payments = summary?.payments || {};
  const pendingByCurrency = payments.pendingByCurrency || {};
  const selectedFromDate = parseDateInput(fromDate);
  const selectedToDate = parseDateInput(toDate);

  return (
    <main className="dashboardHome">
      <BlockingLoader open={applying} label="Loading dashboard..." />
      {showPaymentCard ? (
        <section className="homeSection homePaymentSection">
          <button type="button" className="homePaymentCard" onClick={() => onOpenFilter("pending_payment", false)}>
            <span className="homeMetricIcon homePaymentIcon"><HomeIcon type="payment" /></span>
            <div className="homePaymentApplicants">
              <div>Pending Payment</div>
              <strong>{payments.applicantsWithPendingPayment || 0}</strong> <span>Applicants</span>
            </div>
            <div className="homePaymentAmount"><span>INR</span><strong>{formatCurrencyAmount(pendingByCurrency.INR || 0, "INR", true)}</strong></div>
            <div className="homePaymentAmount"><span>EUR</span><strong>{formatCurrencyAmount(pendingByCurrency.EUR || 0, "EUR", true)}</strong></div>
            <div className="homePaymentAmount"><span>USD</span><strong>{formatCurrencyAmount(pendingByCurrency.USD || 0, "USD", true)}</strong></div>
            <div className="homePaymentAction">View Details <span aria-hidden="true">&gt;</span></div>
          </button>
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

      <section className="homeSection">
        {/* <h2>Upcoming Actions</h2> */}
        <div className="homeCardGrid homeCardGridFour">
          <HomeMetricCard title="Applicants Arriving" count={upcoming.arriving?.count} tone="blue" icon="plane" onClick={() => onOpenFilter("arriving", true)} />
          <HomeMetricCard title="Visa Collection" count={upcoming.visaCollection?.count} tone="green" icon="visa" onClick={() => onOpenFilter("visa_collection", true)} />
          <HomeMetricCard title="Embassy Interviews" count={upcoming.embassyInterview?.count} tone="purple" icon="people" onClick={() => onOpenFilter("embassy_interview", true)} />
          <HomeMetricCard title="Embassy Appointments" count={upcoming.embassyAppointment?.count} tone="orange" icon="calendar" onClick={() => onOpenFilter("embassy_appointment", true)} />
        </div>
      </section>

      <section className="homeSection">
        {/* <h2>Action Pending (Overdue)</h2> */}
        <div className="homeCardGrid homeCardGridThree">
          <HomeMetricCard title="TRP Upload Pending" subtitle="Passed Visa Collection Date" count={overdue.trpPending?.count} tone="blue" icon="document" onClick={() => onOpenFilter("trp_pending", false)} />
          <HomeMetricCard title="Biometric Upload Pending" subtitle="Passed Embassy Interview Date" count={overdue.interviewBiometricPending?.count} tone="blue" icon="fingerprint" onClick={() => onOpenFilter("interview_biometric_pending", false)} />
          <HomeMetricCard title="Biometric Upload Pending" subtitle="Passed Embassy Appointment Date" count={overdue.appointmentBiometricPending?.count} tone="blue" icon="calendar" onClick={() => onOpenFilter("appointment_biometric_pending", false)} />
        </div>
      </section>

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
  const [homeSummary, setHomeSummary] = useState(null);
  const [homeApplyLoading, setHomeApplyLoading] = useState(false);
  const defaultHomeRange = useMemo(() => getDefaultHomeRange(), []);
  const storedHomeRange = useMemo(() => readStoredHomeRange(defaultHomeRange), [defaultHomeRange]);
  const [retainedHomeRange, setRetainedHomeRange] = useState(storedHomeRange);
  const [homeDateDraft, setHomeDateDraft] = useState(storedHomeRange);
  const [homeDateError, setHomeDateError] = useState("");
  const isSuperUser = isSuperUserLikeRole(user?.role);
  const isEmployer = user?.role === "EMPLOYER";
  const isAgency = user?.role === "AGENCY";
  const isJuniorAccountant = user?.role === "JUNIOR_ACCOUNTANT";
  const canViewHomeDashboard = isSuperUser || isEmployer || isAgency;

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
  const dashboardFilter = searchParams.get("dashboardFilter") || "";
  const homeFromDate = searchParams.get("fromDate") || retainedHomeRange.fromDate;
  const homeToDate = searchParams.get("toDate") || retainedHomeRange.toDate;
  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));

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
    return ["applicants"];
  }, [isAgency, isEmployer, isSuperUser]);

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
    const next = new URLSearchParams();
    next.set("company", companyId);
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
    if (activeTab === "applicants" && DASHBOARD_FILTER_DESCRIPTIONS[dashboardFilter]) {
      return `Showing ${totalRows} applicants ${DASHBOARD_FILTER_DESCRIPTIONS[dashboardFilter]}`;
    }
    return `Showing ${totalRows} applicants`;
  }, [activeTab, dashboardFilter, totalRows]);

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
            showPaymentCard={!isEmployer}
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
                    onOpenApplicant={handleOpenApplicant}
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





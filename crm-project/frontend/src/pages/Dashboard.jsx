import { useCallback, useEffect, useState } from "react";
import PageLoader from "../components/common/PageLoader";
import API from "../services/api";
import { getCached } from "../services/cachedApi";
import { getApiErrorMessage } from "../utils/apiError";
import { isSuperUserLikeRole } from "../utils/auth";
import { logError } from "../utils/logger";

const INITIAL_FILTERS = { companyId: "", agencyId: "", fromDate: "", toDate: "" };
const LOOKUP_CACHE_TTL_MS = 60_000;
const USER_CACHE_TTL_MS = 120_000;
const CARD_CONTAINER_STYLE = { display: "flex", gap: "20px" };
const BASE_CARD_STYLE = { flex: 1, background: "#fff", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const FILTER_BAR_STYLE = { display: "flex", gap: "10px", marginBottom: "20px", background: "#fff", padding: "15px", borderRadius: "10px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" };
const PIPELINE_CONTAINER_STYLE = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "15px", marginTop: "15px" };
const PIPELINE_CARD_STYLE = { background: "#fff", padding: "15px", borderRadius: "10px", textAlign: "center", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" };
const KPI_CARDS = [
  { label: "Total Applicants", key: "totalApplicants", color: "#4CAF50" },
  { label: "Ongoing", key: "ongoing", color: "#2196F3" },
  { label: "Completed", key: "completed", color: "#FF9800" }
];
const ALERT_CARDS = [
  { label: "Pending Documents", key: "pendingDocs" },
  { label: "Pending Approvals", key: "pendingApproval" }
];
const PAYMENT_CARDS = [
  { label: "Collected", key: "totalCollected" },
  { label: "Pending", key: "totalPending" }
];

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.items) ? response.items : [];
}

function compactFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [companies, setCompanies] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboard = useCallback(async (activeFilters) => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const params = new URLSearchParams(compactFilters(activeFilters));
      const response = await API.get(`/dashboard?${params.toString()}`);
      setData(response.data);
    } catch (error) {
      logError("Unable to load legacy dashboard", error);
      setErrorMessage(getApiErrorMessage(error, "Unable to load the dashboard. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadLookupData = useCallback(async () => {
    try {
      const [companiesData, agenciesData] = await Promise.all([
        getCached("/companies", { ttlMs: LOOKUP_CACHE_TTL_MS }),
        getCached("/agencies", { ttlMs: LOOKUP_CACHE_TTL_MS })
      ]);
      setCompanies(normalizeListResponse(companiesData));
      setAgencies(normalizeListResponse(agenciesData));
    } catch (error) {
      logError("Unable to load dashboard filter options", error);
    }
  }, []);

  const loadUser = useCallback(async () => {
    try {
      setUser(await getCached("/auth/me", { ttlMs: USER_CACHE_TTL_MS }));
    } catch (error) {
      logError("Unable to load dashboard user", error);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(INITIAL_FILTERS);
    void loadLookupData();
    void loadUser();
  }, [loadDashboard, loadLookupData, loadUser]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  if (isLoading && !data) return <PageLoader label="Loading dashboard..." />;
  if (errorMessage && !data) return <div style={{ padding: "20px" }} role="alert"><p>{errorMessage}</p><button type="button" onClick={() => loadDashboard(filters)}>Try again</button></div>;

  return (
    <div style={{ padding: "20px", background: "#f5f7fb", minHeight: "100vh" }}>
      <h2 style={{ marginBottom: "20px" }}>Dashboard</h2>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <div style={FILTER_BAR_STYLE}>
        <select value={filters.companyId} onChange={(event) => updateFilter("companyId", event.target.value)}><option value="">All Companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
        {user && isSuperUserLikeRole(user.role) ? <select value={filters.agencyId} onChange={(event) => updateFilter("agencyId", event.target.value)}><option value="">All Agencies</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select> : null}
        <input type="date" value={filters.fromDate} onChange={(event) => updateFilter("fromDate", event.target.value)} />
        <input type="date" value={filters.toDate} onChange={(event) => updateFilter("toDate", event.target.value)} />
        <button type="button" onClick={() => loadDashboard(filters)} disabled={isLoading}>{isLoading ? "Loading..." : "Apply"}</button>
      </div>
      <div style={CARD_CONTAINER_STYLE}>{KPI_CARDS.map((card) => <div key={card.key} style={{ ...BASE_CARD_STYLE, borderLeft: `5px solid ${card.color}` }}><p>{card.label}</p><h2>{data?.[card.key] || 0}</h2></div>)}</div>
      <section style={{ marginTop: "30px" }}><h3>Pipeline Status</h3><div style={PIPELINE_CONTAINER_STYLE}>{Array.from({ length: 13 }, (_, index) => index + 1).map((stage) => <div key={stage} style={PIPELINE_CARD_STYLE}><p>Stage {stage}</p><h3>{data?.stageCounts?.[stage] || 0}</h3></div>)}</div></section>
      <section style={{ marginTop: "30px" }}><h3>Alerts</h3><div style={CARD_CONTAINER_STYLE}>{ALERT_CARDS.map((card) => <div key={card.key} style={{ ...BASE_CARD_STYLE, borderLeft: "5px solid red" }}><p>{card.label}</p><h2>{data?.alerts?.[card.key] || 0}</h2></div>)}</div></section>
      <section style={{ marginTop: "30px" }}><h3>Payments</h3><div style={CARD_CONTAINER_STYLE}>{PAYMENT_CARDS.map((card) => <div key={card.key} style={{ ...BASE_CARD_STYLE, borderLeft: "5px solid green" }}><p>{card.label}</p><h2>{data?.payments?.[card.key] || 0}</h2></div>)}</div></section>
    </div>
  );
}

export default Dashboard;

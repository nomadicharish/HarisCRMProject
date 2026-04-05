import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import API from "../services/api";
import CreateApplicants from "./CreateApplicants";
import "../styles/applicantsDashboard.css";

const PAGE_SIZE = 25;

function formatPendingAmount(value) {
  return `\u20b9${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";
  return `${parts[0][0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}

function parseDate(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "object" && value._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function FilterSection({ title, items, selectedValue, onSelect, visible = true }) {
  if (!visible || !items.length) return null;

  return (
    <div className="dashboardFilterSection">
      <div className="dashboardFilterTitleRow">
        <span className="dashboardFilterTitle">{title}</span>
        <span className="dashboardFilterCaret">^</span>
      </div>

      <div className="dashboardFilterList">
        {items.map((item) => {
          const checked = selectedValue === item.value;
          return (
            <label key={item.value} className="dashboardFilterOption">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onSelect(checked ? "" : item.value)}
              />
              <span className="dashboardFilterOptionLabel">{item.label}</span>
              <span className="dashboardFilterCount">{item.count}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ApplicantsDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [countries, setCountries] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const searchText = searchParams.get("q") || "";
  const applicantType = searchParams.get("type") || "";
  const countryId = searchParams.get("country") || "";
  const companyId = searchParams.get("company") || "";
  const agencyId = searchParams.get("agency") || "";
  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));

  const updateFilters = useCallback(
    (updates) => {
      const next = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "" || value === 1) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });

      if (!Object.prototype.hasOwnProperty.call(updates, "page")) {
        next.delete("page");
      }

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [userRes, applicantsRes, countriesRes, companiesRes, agenciesRes] = await Promise.all([
        API.get("/auth/me"),
        API.get("/applicants"),
        API.get("/countries"),
        API.get("/companies"),
        API.get("/agencies")
      ]);

      setUser(userRes.data || null);
      setApplicants(Array.isArray(applicantsRes.data) ? applicantsRes.data : []);
      setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
      setCompanies(Array.isArray(companiesRes.data) ? companiesRes.data : []);
      setAgencies(Array.isArray(agenciesRes.data) ? agenciesRes.data : []);
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, refreshKey]);

  const isSuperUser = user?.role === "SUPER_USER";
  const isEmployer = user?.role === "EMPLOYER";

  const visibleCompanies = useMemo(() => {
    if (!countryId) return companies;
    return companies.filter((company) => company.countryId === countryId);
  }, [companies, countryId]);

  useEffect(() => {
    if (companyId && !visibleCompanies.some((company) => company.id === companyId)) {
      updateFilters({ company: "", page: 1 });
    }
  }, [companyId, updateFilters, visibleCompanies]);

  const filteredApplicants = useMemo(() => {
    return applicants.filter((applicant) => {
      const fullName =
        applicant.fullName ||
        [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim();

      if (searchText && !normalizeText(fullName).includes(normalizeText(searchText))) {
        return false;
      }

      if (applicantType && applicant.workflowStatus !== applicantType) {
        return false;
      }

      if (countryId && applicant.countryId !== countryId) {
        return false;
      }

      if (companyId && applicant.companyId !== companyId) {
        return false;
      }

      if (agencyId && applicant.agencyId !== agencyId) {
        return false;
      }

      return true;
    });
  }, [agencyId, applicantType, applicants, companyId, countryId, searchText]);

  const sortedApplicants = useMemo(() => {
    return [...filteredApplicants].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
  }, [filteredApplicants]);

  const totalApplicants = sortedApplicants.length;
  const totalPages = Math.max(1, Math.ceil(totalApplicants / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (safePage !== currentPage) {
      updateFilters({ page: safePage });
    }
  }, [currentPage, safePage, updateFilters]);

  const paginatedApplicants = useMemo(() => {
    const startIndex = (safePage - 1) * PAGE_SIZE;
    return sortedApplicants.slice(startIndex, startIndex + PAGE_SIZE);
  }, [safePage, sortedApplicants]);

  const applicantTypeOptions = useMemo(() => {
    const options = [
      {
        value: "in_progress",
        label: "In Progress",
        count: applicants.filter((applicant) => applicant.workflowStatus === "in_progress").length
      }
    ];

    if (!isEmployer) {
      options.push({
        value: "attention_required",
        label: "Attention required",
        count: applicants.filter((applicant) => applicant.attentionRequired).length
      });
    }

    options.push({
      value: "completed",
      label: "Completed",
      count: applicants.filter((applicant) => applicant.workflowStatus === "completed").length
    });

    return options;
  }, [applicants, isEmployer]);

  const countryOptions = useMemo(
    () =>
      countries.map((country) => ({
        value: country.id,
        label: country.name,
        count: applicants.filter((applicant) => applicant.countryId === country.id).length
      })),
    [applicants, countries]
  );

  const companyOptions = useMemo(
    () =>
      visibleCompanies.map((company) => ({
        value: company.id,
        label: company.name,
        count: applicants.filter((applicant) => applicant.companyId === company.id).length
      })),
    [applicants, visibleCompanies]
  );

  const agencyOptions = useMemo(
    () =>
      agencies.map((agency) => ({
        value: agency.id,
        label: agency.name,
        count: applicants.filter((applicant) => applicant.agencyId === agency.id).length
      })),
    [agencies, applicants]
  );

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const typeMatch = applicantTypeOptions.find((item) => item.value === applicantType);
    const countryMatch = countries.find((item) => item.id === countryId);
    const companyMatch = companies.find((item) => item.id === companyId);
    const agencyMatch = agencies.find((item) => item.id === agencyId);

    if (typeMatch) chips.push({ key: "type", label: typeMatch.label });
    if (countryMatch) chips.push({ key: "country", label: countryMatch.name });
    if (companyMatch) chips.push({ key: "company", label: companyMatch.name });
    if (agencyMatch) chips.push({ key: "agency", label: agencyMatch.name });

    return chips;
  }, [agencies, agencyId, applicantType, applicantTypeOptions, companies, companyId, countries, countryId]);

  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const handleOpenApplicant = (applicantId) => {
    navigate(`/applicants/${applicantId}${window.location.search || ""}`);
  };

  if (loading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardTopbar">
        <div className="dashboardBrand">Talent Acquisition</div>

        <div className="dashboardTabs">
          <button type="button" className="dashboardTab dashboardTabActive">
            Applicants
          </button>
          <button type="button" className="dashboardTab" disabled>
            Company
          </button>
          <button type="button" className="dashboardTab" disabled>
            Documents
          </button>
        </div>

        <div className="dashboardTopbarRight">
          <div className="dashboardActionGroup">
            {isSuperUser ? (
              <>
                <button type="button" className="dashboardPrimaryBtn">
                  Add Company
                </button>
                <button type="button" className="dashboardPrimaryBtn">
                  Add Employer
                </button>
                <button type="button" className="dashboardPrimaryBtn">
                  Add Agency
                </button>
              </>
            ) : null}

            <button type="button" className="dashboardPrimaryBtn" onClick={() => setShowAddApplicant(true)}>
              Add Job seeker +
            </button>
          </div>

          <div className="dashboardUserName">{user?.name || "User"}</div>
        </div>
      </div>

      <div className="dashboardContent">
        <aside className="dashboardSidebar">
          <div className="dashboardSearchWrap">
            <input
              type="text"
              className="dashboardSearchInput"
              placeholder="Search by name"
              value={searchText}
              onChange={(event) => updateFilters({ q: event.target.value, page: 1 })}
            />
          </div>

          <div className="dashboardFilterCard">
            <div className="dashboardFilterHeader">
              <span className="dashboardFilterHeading">Filter</span>
              <button type="button" className="dashboardResetBtn" onClick={resetFilters}>
                Reset
              </button>
            </div>

            <FilterSection
              title="Applicant Type"
              items={applicantTypeOptions}
              selectedValue={applicantType}
              onSelect={(value) => updateFilters({ type: value, page: 1 })}
            />

            <FilterSection
              title="Country"
              items={countryOptions}
              selectedValue={countryId}
              onSelect={(value) => updateFilters({ country: value, page: 1 })}
            />

            <FilterSection
              title="Company"
              items={companyOptions}
              selectedValue={companyId}
              onSelect={(value) => updateFilters({ company: value, page: 1 })}
            />

            <FilterSection
              title="Agency"
              items={agencyOptions}
              selectedValue={agencyId}
              onSelect={(value) => updateFilters({ agency: value, page: 1 })}
              visible={isSuperUser}
            />
          </div>
        </aside>

        <main className="dashboardMain">
          <div className="dashboardResultsHeader">
            <div>
              <div className="dashboardResultsCount">Showing {totalApplicants} applicants</div>
              {activeFilterChips.length ? (
                <div className="dashboardChipRow">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      className="dashboardChip"
                      onClick={() => updateFilters({ [chip.key]: "", page: 1 })}
                    >
                      {chip.label} x
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="dashboardSortText">Sort by Date Created</div>
          </div>

          <div className="dashboardTableCard">
            <table className="dashboardTable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Company</th>
                  {!isEmployer ? <th>Payment Status</th> : null}
                </tr>
              </thead>
              <tbody>
                {paginatedApplicants.length === 0 ? (
                  <tr>
                    <td colSpan={isEmployer ? 3 : 4} className="dashboardEmptyState">
                      No applicants found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  paginatedApplicants.map((applicant) => {
                    const fullName =
                      applicant.fullName ||
                      [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
                      "Applicant";

                    return (
                      <tr key={applicant.id} className="dashboardTableRow" onClick={() => handleOpenApplicant(applicant.id)}>
                        <td>
                          <div className="dashboardNameCell">
                            {applicant.attentionRequired ? <span className="dashboardWarningIcon">!</span> : null}
                            <span className="dashboardNameText">{fullName}</span>
                          </div>
                        </td>
                        <td>
                          <span className="dashboardStatusPill">{applicant.stageLabel || "Candidate Created"}</span>
                        </td>
                        <td>{applicant.companyName || "-"}</td>
                        {!isEmployer ? (
                          <td>
                            {applicant.payment?.pendingInr > 0
                              ? `Pending ${formatPendingAmount(applicant.payment.pendingInr)}`
                              : "Completed"}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
      </div>

      {showAddApplicant ? (
        <CreateApplicants
          onClose={() => setShowAddApplicant(false)}
          onSaved={() => {
            setShowAddApplicant(false);
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}

export default ApplicantsDashboard;

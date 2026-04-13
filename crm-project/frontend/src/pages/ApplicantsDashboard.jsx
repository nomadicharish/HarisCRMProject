import React, { useCallback, useEffect, useMemo, useState } from "react";
import CountryManagerModal from "../components/dashboard/CountryManagerModal";
import DashboardTopbar from "../components/common/DashboardTopbar";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useNavigate, useSearchParams } from "react-router-dom";
import EntityFormModal from "../components/dashboard/EntityFormModal";
import API from "../services/api";
import CreateApplicants from "./CreateApplicants";
import "../styles/applicantsDashboard.css";

const SEARCH_ICON_SRC = "/search.png";
const RIGHT_ICON_SRC = "/right.png";

const PAGE_SIZE = 25;
const TAB_CONFIG = {
  applicants: { label: "Applicants", actionLabel: "Add Applicant" },
  companies: { label: "Companies", actionLabel: "Add Company" },
  employers: { label: "Employers", actionLabel: "Add Employer" },
  agencies: { label: "Agencies", actionLabel: "Add Agency" }
};

function formatPendingAmount(value) {
  return `\u20b9${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

function formatEuroAmount(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `EUR ${amount.toLocaleString("en-IN")}` : "-";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
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

function FilterSection({ title, items, selectedValues, onToggle, visible = true }) {
  if (!visible || !items.length) return null;

  return (
    <div className="dashboardFilterSection">
      <div className="dashboardFilterTitle">{title}</div>

      <div className="dashboardFilterList">
        {items.map((item) => {
          const checked = selectedValues.includes(item.value);
          return (
            <label key={item.value} className="dashboardFilterOption">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.value)}
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

function formatContactNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  try {
    const phoneNumber = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw}`);
    if (!phoneNumber) return raw;
    return `+${phoneNumber.countryCallingCode}-${phoneNumber.nationalNumber}`;
  } catch {
    return raw;
  }
}

function ApplicantsDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [countries, setCountries] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [entityModalType, setEntityModalType] = useState("");
  const [entityEditData, setEntityEditData] = useState(null);
  const [showCountryManager, setShowCountryManager] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeTab = TAB_CONFIG[searchParams.get("tab")] ? searchParams.get("tab") : "applicants";
  const searchText = searchParams.get("q") || "";
  const applicantTypes = getMultiParam(searchParams, "type");
  const countryIds = getMultiParam(searchParams, "country");
  const companyIds = getMultiParam(searchParams, "company");
  const agencyIds = getMultiParam(searchParams, "agency");
  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));

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

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [userRes, applicantsRes, countriesRes, companiesRes, employersRes, agenciesRes] = await Promise.all([
        API.get("/auth/me"),
        API.get("/applicants"),
        API.get("/countries"),
        API.get("/companies"),
        API.get("/employers"),
        API.get("/agencies")
      ]);

      setUser(userRes.data || null);
      setApplicants(Array.isArray(applicantsRes.data) ? applicantsRes.data : []);
      setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
      setCompanies(Array.isArray(companiesRes.data) ? companiesRes.data : []);
      setEmployers(Array.isArray(employersRes.data) ? employersRes.data : []);
      setAgencies(Array.isArray(agenciesRes.data) ? agenciesRes.data : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, refreshKey]);

  const isSuperUser = user?.role === "SUPER_USER";
  const isEmployer = user?.role === "EMPLOYER";
  const isAgency = user?.role === "AGENCY";
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

  const filteredApplicants = useMemo(() => {
    return applicants.filter((applicant) => {
      const fullName =
        applicant.fullName ||
        [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim();

      if (searchText && !normalizeText(fullName).includes(normalizeText(searchText))) {
        return false;
      }

      if (applicantTypes.length) {
        const matchesApplicantType = applicantTypes.some((type) => {
          if (type === "attention_required") return Boolean(applicant.attentionRequired);
          return applicant.workflowStatus === type;
        });

        if (!matchesApplicantType) {
          return false;
        }
      }

      if (countryIds.length && !countryIds.includes(applicant.countryId)) {
        return false;
      }

      if (companyIds.length && !companyIds.includes(applicant.companyId)) {
        return false;
      }

      if (agencyIds.length && !agencyIds.includes(applicant.agencyId)) {
        return false;
      }

      return true;
    });
  }, [agencyIds, applicantTypes, applicants, companyIds, countryIds, searchText]);

  const companyRows = useMemo(() => {
    return companies
      .filter((company) => {
        if (searchText && !normalizeText(company.name).includes(normalizeText(searchText))) {
          return false;
        }

        if (countryIds.length && !countryIds.includes(company.countryId)) {
          return false;
        }

        return true;
      })
      .map((company) => ({
        ...company,
        countryName: countryMap[company.countryId] || "-",
        employerNames: (company.employerIds || [])
          .map((id) => employerMap[id]?.name)
          .filter(Boolean)
          .join(", ")
      }));
  }, [companies, countryIds, countryMap, employerMap, searchText]);

  const employerRows = useMemo(() => {
    return employers.filter((employer) => {
      const matchesSearch =
        !searchText ||
        [employer.name, employer.email, companyMap[employer.companyId]?.name]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(normalizeText(searchText)));

      if (!matchesSearch) return false;
      if (countryIds.length && !countryIds.includes(employer.countryId)) return false;
      if (companyIds.length && !companyIds.includes(employer.companyId)) return false;

      return true;
    });
  }, [companyIds, companyMap, countryIds, employers, searchText]);

  const agencyRows = useMemo(() => {
    return agencies.filter((agency) => {
      const agencyCompanyIds = (agency.assignedCompanyIds || []).filter(Boolean);
      const agencyCountryIds = agencyCompanyIds
        .map((companyId) => companyMap[companyId]?.countryId)
        .filter(Boolean);

      const matchesSearch =
        !searchText ||
        [agency.name, agency.email, ...agencyCompanyIds.map((companyId) => companyMap[companyId]?.name)]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(normalizeText(searchText)));

      if (!matchesSearch) return false;
      if (countryIds.length && !countryIds.some((countryId) => agencyCountryIds.includes(countryId))) return false;
      if (companyIds.length && !companyIds.some((companyId) => agencyCompanyIds.includes(companyId))) return false;

      return true;
    });
  }, [agencies, companyIds, companyMap, countryIds, searchText]);

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

  const totalRows = currentRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (safePage !== currentPage) {
      updateFilters({ page: safePage });
    }
  }, [currentPage, safePage, updateFilters]);

  const paginatedRows = useMemo(() => {
    const startIndex = (safePage - 1) * PAGE_SIZE;
    return currentRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentRows, safePage]);

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
          ? visibleCompanies.filter((company) => company.countryId === country.id).length
          : applicants.filter((applicant) => applicant.countryId === country.id).length
      }))
      .filter((item) => item.count > 0 || !mappedCountryIds);
  }, [applicants, countries, isAgency, isEmployer, visibleCompanies]);

  const companyCountryOptions = useMemo(
    () =>
      countries
        .map((country) => ({
          value: country.id,
          label: country.name,
          count: companies.filter((company) => company.countryId === country.id).length
        }))
        .filter((item) => item.count > 0),
    [companies, countries]
  );

  const employerCountryOptions = useMemo(
    () =>
      countries
        .map((country) => ({
          value: country.id,
          label: country.name,
          count: employers.filter((employer) => employer.countryId === country.id).length
        }))
        .filter((item) => item.count > 0),
    [countries, employers]
  );

  const agencyCountryOptions = useMemo(
    () =>
      countries
        .map((country) => ({
          value: country.id,
          label: country.name,
          count: agencies.filter((agency) =>
            (agency.assignedCompanyIds || []).some(
              (companyId) => companyMap[companyId]?.countryId === country.id
            )
          ).length
        }))
        .filter((item) => item.count > 0),
    [agencies, companyMap, countries]
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

  const employerCompanyOptions = useMemo(
    () =>
      visibleCompanies
        .map((company) => ({
          value: company.id,
          label: company.name,
          count: employers.filter((employer) => employer.companyId === company.id).length
        }))
        .filter((item) => item.count > 0),
    [employers, visibleCompanies]
  );

  const agencyCompanyOptions = useMemo(
    () =>
      visibleCompanies
        .map((company) => ({
          value: company.id,
          label: company.name,
          count: agencies.filter((agency) => (agency.assignedCompanyIds || []).includes(company.id)).length
        }))
        .filter((item) => item.count > 0),
    [agencies, visibleCompanies]
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
    if (activeTab !== "applicants") {
      next.set("tab", activeTab);
    }
    setSearchParams(next, { replace: true });
  };

  const handleOpenApplicant = (applicantId) => {
    navigate(`/applicants/${applicantId}${window.location.search || ""}`);
  };

  const visibleTabs = useMemo(() => {
    if (isSuperUser) return ["applicants", "companies", "employers", "agencies"];
    if (isAgency || isEmployer) return ["applicants", "companies"];
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
    if (tabKey !== "applicants") {
      next.set("tab", tabKey);
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

  const headerText = useMemo(() => {
    if (activeTab === "companies") return `Showing ${totalRows} companies`;
    if (activeTab === "employers") return `Showing ${totalRows} employers`;
    if (activeTab === "agencies") return `Showing ${totalRows} agencies`;
    return `Showing ${totalRows} applicants`;
  }, [activeTab, totalRows]);

  const searchPlaceholder = useMemo(() => {
    if (activeTab === "companies") return "Search by company name";
    if (activeTab === "employers") return "Search by employer name";
    if (activeTab === "agencies") return "Search by agency name";
    return "Search by name";
  }, [activeTab]);

  const currentActionLabel = TAB_CONFIG[activeTab].actionLabel;
  const showHeaderAction =
    (activeTab === "applicants" && !isEmployer) ||
    (activeTab !== "applicants" && isSuperUser);

  const openCurrentAction = () => {
    if (activeTab === "applicants") {
      setShowAddApplicant(true);
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

  if (loading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

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
        <aside className="dashboardSidebar">
          <div className="dashboardFilterCard">
            <div className="dashboardSearchWrap">
              <img src={SEARCH_ICON_SRC} alt="" className="dashboardSearchIcon" />
              <input
                type="text"
                className="dashboardSearchInput"
                placeholder={searchPlaceholder}
                value={searchText}
                onChange={(event) => updateFilters({ q: event.target.value, page: 1 })}
              />
            </div>

            <div className="dashboardFilterHeader">
              <span className="dashboardFilterHeading">Filter</span>
              <button type="button" className="dashboardResetBtn" onClick={resetFilters}>
                Reset
              </button>
            </div>

            <FilterSection
              title="Applicant Type"
              items={applicantTypeOptions}
              selectedValues={applicantTypes}
              onToggle={(value) => toggleFilterValue("type", applicantTypes, value)}
              visible={activeTab === "applicants"}
            />

            <FilterSection
              title="Countries"
              items={
                activeTab === "companies"
                  ? companyCountryOptions
                  : activeTab === "employers"
                    ? employerCountryOptions
                    : activeTab === "agencies"
                      ? agencyCountryOptions
                      : countryOptions
              }
              selectedValues={countryIds}
              onToggle={(value) => toggleFilterValue("country", countryIds, value)}
            />

            <FilterSection
              title="Companies"
              items={
                activeTab === "employers"
                  ? employerCompanyOptions
                  : activeTab === "agencies"
                    ? agencyCompanyOptions
                    : companyOptions
              }
              selectedValues={companyIds}
              onToggle={(value) => toggleFilterValue("company", companyIds, value)}
              visible={activeTab !== "companies"}
            />

            <FilterSection
              title="Agencies"
              items={agencyOptions}
              selectedValues={agencyIds}
              onToggle={(value) => toggleFilterValue("agency", agencyIds, value)}
              visible={activeTab === "applicants" && isSuperUser}
            />
          </div>
        </aside>

        <main className="dashboardMain">
          <div className="dashboardResultsHeader">
            <div>
              <div className="dashboardResultsCount">{headerText}</div>
              {activeFilterChips.length ? (
                <div className="dashboardChipRow">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={`${chip.key}-${chip.value}`}
                      type="button"
                      className="dashboardChip"
                      onClick={() =>
                        toggleFilterValue(
                          chip.key,
                          chip.key === "type"
                            ? applicantTypes
                            : chip.key === "country"
                              ? countryIds
                              : chip.key === "company"
                                ? companyIds
                                : agencyIds,
                          chip.value
                        )
                      }
                    >
                      {chip.label} x
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {showHeaderAction ? (
              <div className="dashboardActionGroup">
                {activeTab === "companies" && isSuperUser ? (
                  <button
                    type="button"
                    className="dashboardPrimaryBtn"
                    onClick={() => setShowCountryManager(true)}
                  >
                    Add/Update Country
                  </button>
                ) : null}

                <button type="button" className="dashboardPrimaryBtn" onClick={openCurrentAction}>
                  {currentActionLabel}
                </button>
              </div>
            ) : null}
          </div>

          <div className="dashboardTableCard">
            {activeTab === "applicants" ? (
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
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={isEmployer ? 3 : 4} className="dashboardEmptyState">
                        No applicants found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((applicant) => {
                      const fullName =
                        applicant.fullName ||
                        [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim() ||
                        "Applicant";

                      return (
                        <tr
                          key={applicant.id}
                          className="dashboardTableRow"
                          onClick={() => handleOpenApplicant(applicant.id)}
                        >
                          <td>
                            <div className="dashboardNameCell">
                              <span className="dashboardNameText">{fullName}</span>
                              {applicant.attentionRequired ? <span className="dashboardWarningIcon">!</span> : null}
                            </div>
                          </td>
                          <td>
                            <span className="dashboardStatusPill">
                              {applicant.statusText || applicant.stageLabel || "Candidate Created"}
                            </span>
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
            ) : null}

            {activeTab === "companies" ? (
              <table className="dashboardTable">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Country</th>
                    {!isSuperUser ? <th>Applicants</th> : null}
                    {isSuperUser ? <th>Employer POC</th> : null}
                    {isSuperUser ? <th>Payment / Candidate</th> : null}
                    {isSuperUser ? <th>Applicants</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperUser ? 5 : 3} className="dashboardEmptyState">
                        No companies found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((company) => (
                      <tr
                        key={company.id}
                        className={isSuperUser ? "dashboardTableRow" : ""}
                        onClick={isSuperUser ? () => navigate(`/companies/${company.id}/edit`) : undefined}
                      >
                        <td>
                          {isSuperUser ? (
                            <button
                              type="button"
                              className="dashboardInlineLinkBtn dashboardCompanyNameBtn"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/companies/${company.id}/edit`);
                              }}
                            >
                              {company.name || "-"}
                            </button>
                          ) : (
                            <span>{company.name || "-"}</span>
                          )}
                        </td>
                        <td>{company.countryName}</td>
                        {!isSuperUser ? (
                          <td>
                            <button
                              type="button"
                              className="dashboardInlineLinkBtn dashboardViewApplicantsBtn"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenApplicantsForCompany(company.id);
                              }}
                            >
                              View Applicants <img src={RIGHT_ICON_SRC} alt="" className="dashboardInlineIcon" />
                            </button>
                          </td>
                        ) : null}
                        {isSuperUser ? <td>{company.employerNames || "-"}</td> : null}
                        {isSuperUser ? <td>{formatEuroAmount(company.companyPaymentPerApplicant)}</td> : null}
                        {isSuperUser ? (
                        <td>
                          <button
                            type="button"
                            className="dashboardInlineLinkBtn"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenApplicantsForCompany(company.id);
                            }}
                          >
                            View Applicants <img src={RIGHT_ICON_SRC} alt="" className="dashboardInlineIcon" />
                          </button>
                        </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : null}

            {activeTab === "employers" ? (
              <table className="dashboardTable">
                <thead>
                  <tr>
                    <th>Employer Name</th>
                    <th>Company</th>
                    <th>Country</th>
                    <th>Contact Number</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="dashboardEmptyState">
                        No employers found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((employer) => (
                      <tr
                        key={employer.id}
                        className="dashboardTableRow"
                        onClick={() => handleOpenEntityModal("employer", employer)}
                      >
                        <td>{employer.name || "-"}</td>
                        <td>{companyMap[employer.companyId]?.name || "-"}</td>
                        <td>{countryMap[employer.countryId] || "-"}</td>
                        <td>{formatContactNumber(employer.contactNumber)}</td>
                        <td>{employer.email || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : null}

            {activeTab === "agencies" ? (
              <table className="dashboardTable">
                <thead>
                  <tr>
                    <th>Agency Name</th>
                    <th>Companies</th>
                    <th>Country</th>
                    <th>Contact Number</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="dashboardEmptyState">
                        No agencies found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((agency) => {
                      const assignedCompanyNames = (agency.assignedCompanyIds || [])
                        .map((companyId) => companyMap[companyId]?.name)
                        .filter(Boolean);
                      const assignedCountryNames = Array.from(
                        new Set(
                          (agency.assignedCompanyIds || [])
                            .map((companyId) => companyMap[companyId]?.countryId)
                            .filter(Boolean)
                            .map((countryId) => countryMap[countryId])
                            .filter(Boolean)
                        )
                      );

                      return (
                        <tr
                          key={agency.id}
                          className="dashboardTableRow"
                          onClick={() => handleOpenEntityModal("agency", agency)}
                        >
                          <td>{agency.name || "-"}</td>
                          <td>{assignedCompanyNames.length ? assignedCompanyNames.join(", ") : "-"}</td>
                          <td>{assignedCountryNames.length ? assignedCountryNames.join(", ") : "-"}</td>
                          <td>{formatContactNumber(agency.contactNumber)}</td>
                          <td>{agency.email || "-"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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

      {entityModalType ? (
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
          onSaved={async () => {
            setEntityModalType("");
            setEntityEditData(null);
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}

      {showCountryManager ? (
        <CountryManagerModal
          countries={countries}
          onClose={() => setShowCountryManager(false)}
          onSaved={async () => {
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}

export default ApplicantsDashboard;





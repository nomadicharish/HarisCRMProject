import React, { useCallback, useEffect, useMemo, useState } from "react";
import CountryManagerModal from "../components/dashboard/CountryManagerModal";
import DashboardTopbar from "../components/common/DashboardTopbar";
import { useNavigate, useSearchParams } from "react-router-dom";
import EntityFormModal from "../components/dashboard/EntityFormModal";
import ApplicantsTable from "../components/dashboard/ApplicantsTable";
import CompaniesTable from "../components/dashboard/CompaniesTable";
import EmployersTable from "../components/dashboard/EmployersTable";
import AgenciesTable from "../components/dashboard/AgenciesTable";
import DashboardFiltersSidebar from "../components/dashboard/DashboardFiltersSidebar";
import DashboardResultsHeader from "../components/dashboard/DashboardResultsHeader";
import { getCached, hasFreshCache, invalidateCache } from "../services/cachedApi";
import CreateApplicants from "./CreateApplicants";
import "../styles/applicantsDashboard.css";

const RIGHT_ICON_SRC = "/right.png";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const pendingNumberFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const euroNumberFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const TAB_CONFIG = {
  applicants: { label: "Applicants", actionLabel: "Add Applicant" },
  companies: { label: "Companies", actionLabel: "Add Company" },
  employers: { label: "Employers", actionLabel: "Add Employer" },
  agencies: { label: "Agencies", actionLabel: "Add Agency" }
};

function formatPendingAmount(value) {
  return `\u20b9${pendingNumberFormatter.format(Number(value || 0))}`;
}

function formatEuroAmount(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `EUR ${euroNumberFormatter.format(amount)}` : "-";
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

function ApplicantsDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [user, setUser] = useState(null);
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
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [entityModalType, setEntityModalType] = useState("");
  const [entityEditData, setEntityEditData] = useState(null);
  const [showCountryManager, setShowCountryManager] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const isSuperUser = user?.role === "SUPER_USER";
  const isEmployer = user?.role === "EMPLOYER";
  const isAgency = user?.role === "AGENCY";

  const activeTab = TAB_CONFIG[searchParams.get("tab")] ? searchParams.get("tab") : "applicants";
  const searchText = searchParams.get("q") || "";
  const applicantTypes = useMemo(() => getMultiParam(searchParams, "type"), [searchParamsKey]);
  const countryIds = useMemo(() => getMultiParam(searchParams, "country"), [searchParamsKey]);
  const companyIds = useMemo(() => getMultiParam(searchParams, "company"), [searchParamsKey]);
  const agencyIds = useMemo(() => getMultiParam(searchParams, "agency"), [searchParamsKey]);
  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));

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
        agency: agencyIds.join(",")
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

      setLoading(!hasBootstrapCache);
      setIsRefreshing(hasBootstrapCache);

      const [userData, countriesData, applicantsData] = await Promise.all([
        getCached("/auth/me", { ttlMs: 120000 }),
        getCached("/countries", { ttlMs: 120000 }),
        getCached("/applicants", { params: applicantsParams, ttlMs: 15000 })
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

      if (activeTab === "companies") {
        const companiesData = await getCached("/companies", {
          params: {
            paginated: "true",
            page: currentPage,
            limit: PAGE_SIZE,
            q: searchText || "",
            countryId: countryIds[0] || "",
            company: companyIds.join(","),
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
        const employersData = await getCached("/employers", { params: { paginated: "false" }, ttlMs: 60000 });
        setEmployers(Array.isArray(employersData) ? employersData : []);
      } else if (activeTab === "employers") {
        const [companiesData, employersData] = await Promise.all([
          getCached("/companies", { params: { paginated: "false" }, ttlMs: 60000 }),
          getCached("/employers", { params: entityParams, ttlMs: 30000 })
        ]);
        setCompanies(Array.isArray(companiesData) ? companiesData : []);
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
          getCached("/companies", { params: { paginated: "false" }, ttlMs: 60000 }),
          getCached("/agencies", { params: entityParams, ttlMs: 30000 })
        ]);
        setCompanies(Array.isArray(companiesData) ? companiesData : []);
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
          getCached("/companies", { params: { paginated: "false" }, ttlMs: 60000 }),
          isSuperUser ? getCached("/agencies", { params: { paginated: "false" }, ttlMs: 30000 }) : Promise.resolve([])
        ]);
        setCompanies(Array.isArray(companiesData) ? companiesData : []);
        setAgencies(Array.isArray(agenciesData) ? agenciesData : []);
      }

      setIsRefreshing(false);
    } catch (error) {
      console.error(error);
      setIsRefreshing(false);
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    agencyIds,
    applicantTypes,
    companyIds,
    countryIds,
    currentPage,
    isSuperUser,
    searchText
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
  }, [activeTab, currentRows, safePage]);

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
        })),
    [employers, visibleCompanies]
  );

  const agencyCompanyOptions = useMemo(
    () =>
      visibleCompanies
        .map((company) => ({
          value: company.id,
          label: company.name,
          count: agencies.filter((agency) => (agency.assignedCompanyIds || []).includes(company.id)).length
        })),
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

  const applyOptimisticApplicantChange = useCallback((change) => {
    if (!change?.operation) return false;
    const { operation, id, payload = {} } = change;

    if (operation === "update" && id) {
      setApplicants((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...payload,
                fullName: [payload.firstName || item.firstName, payload.lastName || item.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim()
              }
            : item
        )
      );
      return true;
    }

    if (operation === "create" && id) {
      const createdApplicant = {
        id,
        ...payload,
        firstName: payload.firstName || "",
        lastName: payload.lastName || "",
        fullName: [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim(),
        stage: 1,
        approvalStatus: "pending",
        workflowStatus: "in_progress",
        statusText: "Candidate pending for approval",
        createdAt: Date.now(),
        payment: { pendingInr: Number(payload.amountPaid || 0) > 0 ? 0 : 1 }
      };
      setApplicants((prev) => [createdApplicant, ...prev]);
      return true;
    }

    return false;
  }, []);

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
            activeTab={activeTab}
            isSuperUser={isSuperUser}
            onShowCountryManager={() => setShowCountryManager(true)}
            onOpenCurrentAction={openCurrentAction}
            currentActionLabel={currentActionLabel}
          />

          <div className="dashboardTableCard">
            {activeTab === "applicants" ? (
              <ApplicantsTable
                rows={paginatedRows}
                isEmployer={isEmployer}
                onOpenApplicant={handleOpenApplicant}
                formatPendingAmount={formatPendingAmount}
              />
            ) : null}

            {activeTab === "companies" ? (
              <CompaniesTable
                rows={paginatedRows}
                isSuperUser={isSuperUser}
                rightIconSrc={RIGHT_ICON_SRC}
                formatEuroAmount={formatEuroAmount}
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
      </div>

      {showAddApplicant ? (
        <CreateApplicants
          user={user}
          onClose={() => setShowAddApplicant(false)}
          onSaved={(change) => {
            setShowAddApplicant(false);
            invalidateCache("/applicants");
            const applied = applyOptimisticApplicantChange(change);
            if (!applied) {
              setRefreshKey((value) => value + 1);
            }
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
      ) : null}

      {showCountryManager ? (
        <CountryManagerModal
          countries={countries}
          onClose={() => setShowCountryManager(false)}
          onSaved={async () => {
            invalidateCache("/countries");
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}

export default ApplicantsDashboard;





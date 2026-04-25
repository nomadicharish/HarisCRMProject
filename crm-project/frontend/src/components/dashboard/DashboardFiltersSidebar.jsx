import React from "react";
import FilterSection from "./FilterSection";

function DashboardFiltersSidebar({
  searchPlaceholder,
  searchInput,
  onSearchInputChange,
  onResetFilters,
  activeTab,
  applicantTypeOptions,
  applicantTypes,
  countryIds,
  companyIds,
  agencyIds,
  companyCountryOptions,
  employerCountryOptions,
  agencyCountryOptions,
  countryOptions,
  employerCompanyOptions,
  agencyCompanyOptions,
  companyOptions,
  agencyOptions,
  isSuperUser,
  onToggleFilterValue
}) {
  return (
    <aside className="dashboardSidebar">
      <div className="dashboardFilterCard">
        <div className="dashboardSearchWrap">
          <span className="dashboardSearchIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path
                d="M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14Zm0 0v0m6 12l3 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type="text"
            className="dashboardSearchInput"
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
          />
        </div>

        <div className="dashboardFilterHeader">
          <span className="dashboardFilterHeading">Filter</span>
          <button type="button" className="dashboardResetBtn" onClick={onResetFilters}>
            Reset
          </button>
        </div>

        <FilterSection
          title="Applicant Type"
          items={applicantTypeOptions}
          selectedValues={applicantTypes}
          onToggle={(value) => onToggleFilterValue("type", applicantTypes, value)}
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
          onToggle={(value) => onToggleFilterValue("country", countryIds, value)}
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
          onToggle={(value) => onToggleFilterValue("company", companyIds, value)}
        />

        <FilterSection
          title="Agencies"
          items={agencyOptions}
          selectedValues={agencyIds}
          onToggle={(value) => onToggleFilterValue("agency", agencyIds, value)}
          visible={activeTab === "applicants" && isSuperUser}
        />
      </div>
    </aside>
  );
}

export default DashboardFiltersSidebar;

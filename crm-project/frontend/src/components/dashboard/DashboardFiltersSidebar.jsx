import React from "react";
import FilterSection from "./FilterSection";

function DashboardFiltersSidebar({
  searchIconWebp,
  searchIconPng,
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
          <picture>
            <source srcSet={searchIconWebp} type="image/webp" />
            <img src={searchIconPng} alt="" className="dashboardSearchIcon" />
          </picture>
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
          visible={activeTab !== "companies"}
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

import React, { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import FilterSection from "./FilterSection";
import { formatDateInput, parseDateInput } from "../../utils/dateInput";

const EnrollmentDateInput = React.forwardRef(({ value, onClick, placeholder }, ref) => (
  <button type="button" className="dashboardEnrollmentDateInput" onClick={onClick} ref={ref}>
    <span>{value || placeholder}</span>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  </button>
));

EnrollmentDateInput.displayName = "EnrollmentDateInput";

function EnrollmentDateFilter({ fromDate, toDate, onApply, onClear }) {
  const [enrollmentDates, setEnrollmentDates] = useState({ fromDate, toDate });
  const [collapsed, setCollapsed] = useState(() => !(fromDate || toDate));
  return <section className="dashboardEnrollmentFilter">
    <button type="button" className="dashboardFilterTitleBtn" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}><span className="dashboardFilterTitle">Enrollment Date</span><span className={`dashboardFilterChevron ${collapsed ? "dashboardFilterChevronCollapsed" : ""}`}>^</span></button>
    {!collapsed ? <>
      <label>Start Date<DatePicker selected={parseDateInput(enrollmentDates.fromDate)} onChange={(date) => setEnrollmentDates((current) => ({ ...current, fromDate: formatDateInput(date) }))} maxDate={parseDateInput(enrollmentDates.toDate) || undefined} dateFormat="dd/MM/yyyy" showMonthDropdown showYearDropdown dropdownMode="select" shouldCloseOnSelect customInput={<EnrollmentDateInput placeholder="Select start date" />} /></label>
      <label>End Date<DatePicker selected={parseDateInput(enrollmentDates.toDate)} onChange={(date) => setEnrollmentDates((current) => ({ ...current, toDate: formatDateInput(date) }))} minDate={parseDateInput(enrollmentDates.fromDate) || undefined} dateFormat="dd/MM/yyyy" showMonthDropdown showYearDropdown dropdownMode="select" shouldCloseOnSelect customInput={<EnrollmentDateInput placeholder="Select end date" />} /></label>
      <button type="button" className="dashboardEnrollmentApplyBtn" onClick={() => onApply(enrollmentDates)}>Apply Enrollment Filter</button>
      <button type="button" className="dashboardEnrollmentClearBtn" onClick={() => { setEnrollmentDates({ fromDate: "", toDate: "" }); onClear(); }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Clear Enrollment Filter</button>
    </> : null}
  </section>;
}

function DashboardFiltersSidebar({
  searchPlaceholder,
  searchInput,
  onSearchInputChange,
  onResetFilters,
  activeTab,
  applicantTypeOptions,
  applicantTypes,
  companyIds,
  agencyIds,
  employerCompanyOptions,
  agencyCompanyOptions,
  companyOptions,
  agencyOptions,
  isSuperUser,
  userRole,
  onToggleFilterValue,
  enrollmentFromDate,
  enrollmentToDate,
  onApplyEnrollmentDate,
  onClearEnrollmentDate
}) {
  const hiddenStagesByRole = {
    EMPLOYER: new Set([
      "stage_documents_pending_approval",
      "stage_documents_rejected",
      "stage_contract_pending_approval",
      "stage_embassy_appointment_pending_approval",
      "stage_embassy_interview_pending_approval",
      "stage_visa_collection_pending_approval"
    ]),
    AGENCY: new Set([
      "stage_contract_pending_approval",
      "stage_embassy_appointment_pending_approval",
      "stage_embassy_interview_pending_approval",
      "stage_visa_collection_pending_approval"
    ])
  };
  const visibleApplicantStages = (hiddenStagesByRole[userRole] || new Set()).size
    ? applicantTypeOptions.filter((item) => !hiddenStagesByRole[userRole].has(item.value))
    : applicantTypeOptions;
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
          <span className="dashboardFilterHeading">Filters</span>
          <button type="button" className="dashboardResetBtn" onClick={onResetFilters}>
            Reset
          </button>
        </div>

        <FilterSection
          title="Applicant Stage"
          items={visibleApplicantStages}
          selectedValues={applicantTypes}
          onToggle={(value) => onToggleFilterValue("type", applicantTypes, value)}
          visible={activeTab === "applicants" && userRole !== "JUNIOR_ACCOUNTANT"}
        />

        {activeTab === "applicants" ? <EnrollmentDateFilter key={`${enrollmentFromDate}-${enrollmentToDate}`} fromDate={enrollmentFromDate} toDate={enrollmentToDate} onApply={onApplyEnrollmentDate} onClear={onClearEnrollmentDate} /> : null}

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

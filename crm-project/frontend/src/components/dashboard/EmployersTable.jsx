import React from "react";
import VirtualizedRows from "./VirtualizedRows";

function formatContactNumber(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "-";
  if (digits.length === 10) return `+91-${digits}`;
  if (digits.length > 10) return `+${digits.slice(0, digits.length - 10)}-${digits.slice(-10)}`;
  return String(value || "").trim() || "-";
}

function getEmployerCompanyIds(employer = {}) {
  if (Array.isArray(employer.companyIds) && employer.companyIds.length) return employer.companyIds;
  return employer.companyId ? [employer.companyId] : [];
}

function getEmployerCountryIds(employer = {}, companyMap = {}) {
  if (Array.isArray(employer.countryIds) && employer.countryIds.length) return employer.countryIds;
  const companyCountryIds = getEmployerCompanyIds(employer)
    .map((companyId) => companyMap[companyId]?.countryId)
    .filter(Boolean);
  return companyCountryIds.length ? Array.from(new Set(companyCountryIds)) : employer.countryId ? [employer.countryId] : [];
}

function formatEmployerCompanies(employer = {}, companyMap = {}) {
  const names = getEmployerCompanyIds(employer)
    .map((companyId) => companyMap[companyId]?.name)
    .filter(Boolean);
  return names.length ? names.join(", ") : "-";
}

function formatEmployerCountries(employer = {}, companyMap = {}, countryMap = {}) {
  const names = getEmployerCountryIds(employer, companyMap)
    .map((countryId) => countryMap[countryId])
    .filter(Boolean);
  return names.length ? names.join(", ") : "-";
}

function EmployersTable({ rows = [], companyMap = {}, countryMap = {}, onOpenEmployer }) {
  const gridTemplateColumns = "2fr 2fr 1.5fr 1.5fr 2fr";

  if (rows.length > 40) {
    return (
      <div className="dashboardVirtualTable">
        <div className="dashboardVirtualHeader" style={{ gridTemplateColumns }}>
          <div>Employer Name</div>
          <div>Company</div>
          <div>Country</div>
          <div>Contact Number</div>
          <div>Email</div>
        </div>
        <VirtualizedRows
          items={rows}
          rowHeight={58}
          height={460}
          renderItem={(employer) => (
            <div
              className="dashboardVirtualRow"
              style={{ gridTemplateColumns }}
              onClick={() => onOpenEmployer(employer)}
              role="button"
              tabIndex={0}
            >
              <div>{employer.name || "-"}</div>
              <div>{formatEmployerCompanies(employer, companyMap)}</div>
              <div>{formatEmployerCountries(employer, companyMap, countryMap)}</div>
              <div>{formatContactNumber(employer.contactNumber)}</div>
              <div>{employer.email || "-"}</div>
            </div>
          )}
        />
      </div>
    );
  }

  return (
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
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="dashboardEmptyState">
              No employers found for the selected filters.
            </td>
          </tr>
        ) : (
          rows.map((employer) => (
            <tr
              key={employer.id}
              className="dashboardTableRow"
              onClick={() => onOpenEmployer(employer)}
            >
              <td>{employer.name || "-"}</td>
              <td>{formatEmployerCompanies(employer, companyMap)}</td>
              <td>{formatEmployerCountries(employer, companyMap, countryMap)}</td>
              <td>{formatContactNumber(employer.contactNumber)}</td>
              <td>{employer.email || "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default EmployersTable;

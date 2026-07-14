import React from "react";
import VirtualizedRows from "./VirtualizedRows";

function formatContactNumber(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "-";
  if (digits.length === 10) return `+91-${digits}`;
  if (digits.length > 10) return `+${digits.slice(0, digits.length - 10)}-${digits.slice(-10)}`;
  return String(value || "").trim() || "-";
}

function getAgencyCompanyIds(agency = {}, companyMap = {}) {
  const ids = new Set(Array.isArray(agency.assignedCompanyIds) ? agency.assignedCompanyIds : []);
  Object.values(companyMap).forEach((company) => {
    if (Array.isArray(company?.agencyIds) && company.agencyIds.includes(agency.id)) {
      ids.add(company.id);
    }
  });
  return Array.from(ids);
}

function AgenciesTable({ rows = [], companyMap = {}, countryMap = {}, onOpenAgency }) {
  const gridTemplateColumns = "2fr 2fr 2fr 1.5fr 2fr";

  if (rows.length > 40) {
    return (
      <div className="dashboardVirtualTable">
        <div className="dashboardVirtualHeader" style={{ gridTemplateColumns }}>
          <div>Agency Name</div>
          <div>Companies</div>
          <div>Country</div>
          <div>Contact Number</div>
          <div>Email</div>
        </div>
        <VirtualizedRows
          items={rows}
          rowHeight={58}
          height={460}
          renderItem={(agency) => {
            const assignedCompanyIds = getAgencyCompanyIds(agency, companyMap);
            const assignedCompanyNames = assignedCompanyIds
              .map((companyId) => companyMap[companyId]?.name)
              .filter(Boolean);
            const assignedCountryNames = Array.from(
              new Set(
                assignedCompanyIds
                  .map((companyId) => companyMap[companyId]?.countryId)
                  .filter(Boolean)
                  .map((countryId) => countryMap[countryId])
                  .filter(Boolean)
              )
            );

            return (
              <div
                className="dashboardVirtualRow"
                style={{ gridTemplateColumns }}
                onClick={() => onOpenAgency(agency)}
                role="button"
                tabIndex={0}
              >
                <div>{agency.name || "-"}</div>
                <div>{assignedCompanyNames.length ? assignedCompanyNames.join(", ") : "-"}</div>
                <div>{assignedCountryNames.length ? assignedCountryNames.join(", ") : "-"}</div>
                <div>{formatContactNumber(agency.contactNumber)}</div>
                <div>{agency.email || "-"}</div>
              </div>
            );
          }}
        />
      </div>
    );
  }

  return (
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
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="dashboardEmptyState">
              No agencies found for the selected filters.
            </td>
          </tr>
        ) : (
          rows.map((agency) => {
            const assignedCompanyIds = getAgencyCompanyIds(agency, companyMap);
            const assignedCompanyNames = assignedCompanyIds
              .map((companyId) => companyMap[companyId]?.name)
              .filter(Boolean);
            const assignedCountryNames = Array.from(
              new Set(
                assignedCompanyIds
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
                onClick={() => onOpenAgency(agency)}
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
  );
}

export default AgenciesTable;

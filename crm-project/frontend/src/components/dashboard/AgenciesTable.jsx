import React from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";

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

function AgenciesTable({ rows = [], companyMap = {}, countryMap = {}, onOpenAgency }) {
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

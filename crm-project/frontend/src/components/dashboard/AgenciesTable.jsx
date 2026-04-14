import React from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import VirtualizedRows from "./VirtualizedRows";

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

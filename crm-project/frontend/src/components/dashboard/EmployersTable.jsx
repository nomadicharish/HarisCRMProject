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
              <div>{companyMap[employer.companyId]?.name || "-"}</div>
              <div>{countryMap[employer.countryId] || "-"}</div>
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
              <td>{companyMap[employer.companyId]?.name || "-"}</td>
              <td>{countryMap[employer.countryId] || "-"}</td>
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

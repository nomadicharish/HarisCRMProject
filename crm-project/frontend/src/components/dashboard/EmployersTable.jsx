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

function EmployersTable({ rows = [], companyMap = {}, countryMap = {}, onOpenEmployer }) {
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

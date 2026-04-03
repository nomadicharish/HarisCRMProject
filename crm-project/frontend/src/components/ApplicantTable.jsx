import React from "react";
import { useNavigate } from "react-router-dom";

function ApplicantTable({ applicants = [], user, onEdit }) {

const navigate = useNavigate();

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "#f5f5f5" }}>
          <th>Name</th>
          <th>Job Role</th>
          <th>Status</th>
          <th>Company</th>
          <th>Employer POC</th>
          <th>Payment Status</th>
          <th>Edit</th>
        </tr>
      </thead>

      <tbody>
        {applicants.map((applicant) => (
          <tr
            key={applicant.id}
            onClick={() => navigate(`/applicants/${applicant.id}`)}
            style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
          >
            <td>
              {applicant.firstName} {applicant.lastName}
            </td>

            <td>{applicant.jobRole || "-"}</td>

            <td>
              <span
                style={{
                  padding: "4px 8px",
                  background: "#e6f4ff",
                  borderRadius: "6px",
                }}
              >
                Stage {applicant.stage}
              </span>
            </td>

            <td>{applicant.companyName || "-"}</td>

            <td>{applicant.employerPOC || "-"}</td>

            <td>
              {applicant.payment?.pending > 0 ? (
                <span style={{ color: "orange" }}>Pending</span>
              ) : (
                <span style={{ color: "green" }}>Completed</span>
              )}
            </td>
            <td>
              {user?.role === "SUPER_USER" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent row click
                      onEdit(applicant);
                    }}
                  >
                    Edit
                  </button>
                )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ApplicantTable;

import React, { useEffect, useState } from "react";
import ApplicantTable from "../components/ApplicantTable";
import { getApplicants } from "../services/applicantService";
import { useNavigate } from "react-router-dom";
import CreateApplicants from "./CreateApplicants";

function Applicants() {
  const [showModal, setShowModal] = useState(false);
  const [applicants, setApplicants] = useState([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadApplicants();
  }, []);

  const loadApplicants = async () => {
    try {
      const data = await getApplicants();
      setApplicants(data);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredApplicants = applicants.filter((a) =>
    `${a.firstName} ${a.lastName}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: "30px" }}>
      <h2>Applicants</h2>

      {/* Search + Add */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <input
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px",
            width: "300px",
            borderRadius: "6px",
            border: "1px solid #ddd",
          }}
        />

        <button
            onClick={() => setShowModal(true)}
            style={{
                background: "#4CAF50",
                color: "white",
                padding: "10px 16px",
                border: "none",
                borderRadius: "6px",
            }}
            >
        + Add Job Seeker
        </button>

        {showModal && (
          <CreateApplicants onClose={() => setShowModal(false)} />
        )}
      </div>

      {/* Applicant Table */}
      <ApplicantTable applicants={filteredApplicants} />
    </div>
  );
}

export default Applicants;
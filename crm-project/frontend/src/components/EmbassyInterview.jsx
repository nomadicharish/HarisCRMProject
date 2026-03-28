import React, { useEffect, useState } from "react";
import API from "../services/api";

function EmbassyInterview({ applicantId, user, loadApplicant }) {

  const [data, setData] = useState(null);
  const [dateTime, setDateTime] = useState("");

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/interview`);
    setData(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const save = async () => {
    await API.post(`/applicants/${applicantId}/interview`, { dateTime });
    setDateTime("");
    loadData();
    loadApplicant();
  };

  const approve = async () => {
    await API.patch(`/applicants/${applicantId}/interview/approve`);
    loadData();
    loadApplicant();
  };

  return (
    <div className="card">

      <h3>Embassy Interview</h3>

      {/* VIEW */}
      {data && (
        <div>
          <p>Date & Time: {new Date(data.dateTime).toLocaleString()}</p>

          <p>
            Status: {data.approved ? "✅ Approved" : "⏳ Pending Approval"}
          </p>
        </div>
      )}

      {/* ADD */}
      {(user?.role === "SUPER_USER" || user?.role === "EMPLOYER") && (
        <div>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
          />

          <button onClick={save}>
            Save Interview
          </button>
        </div>
      )}

      {/* APPROVE */}
      {user?.role === "SUPER_USER" && data && !data.approved && (
        <button onClick={approve}>
          Approve Interview
        </button>
      )}

    </div>
  );
}

export default EmbassyInterview;
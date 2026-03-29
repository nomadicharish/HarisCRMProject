import React, { useEffect, useState } from "react";
import API from "../services/api";

function InterviewBiometric({ applicantId, user, loadApplicant }) {

  const [data, setData] = useState(null);
  const [file, setFile] = useState(null);

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/interview-biometric`);
    setData(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const upload = async () => {

    if (!file) return alert("Select file");

    const formData = new FormData();
    formData.append("file", file);

    await API.post(`/applicants/${applicantId}/interview-biometric`, formData);

    setFile(null);

    loadData();
    loadApplicant(); // 🔥 refresh stage
  };

  return (
    <div className="card">

      <h3>Embassy Interview Biometric Slip</h3>

      {/* VIEW */}
      {data && (
        <div>
          <a href={data.fileUrl} target="_blank">
            View / Download
          </a>
        </div>
      )}

      {/* UPLOAD */}
      {user?.role === "AGENCY" && !data && (
        <div>

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          {file && (
            <button onClick={upload}>
              Upload Slip
            </button>
          )}

        </div>
      )}

    </div>
  );
}

export default InterviewBiometric;
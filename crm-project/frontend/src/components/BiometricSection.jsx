import React, { useEffect, useState } from "react";
import API from "../services/api";

function BiometricSection({ applicantId, user, loadApplicant }) {

  const [data, setData] = useState(null);
  const [file, setFile] = useState(null);

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/biometric`);
    setData(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const upload = async () => {

    if (!file) return alert("Select file");

    const formData = new FormData();
    formData.append("file", file);

    await API.post(`/applicants/${applicantId}/biometric`, formData);

    setFile(null);

    loadData();
    loadApplicant(); // 🔥 update stage UI
  };

  return (
    <div className="card">

      <h3>Biometric Slip</h3>

      {/* VIEW */}
      {data && (
        <div>
          <a href={data.fileUrl} target="_blank">
            View / Download Slip
          </a>
        </div>
      )}

      {/* UPLOAD (AGENCY ONLY) */}
      {user?.role === "AGENCY" && !data && (
        <div>

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          {file && (
            <button onClick={upload}>
              Upload Biometric Slip
            </button>
          )}

        </div>
      )}

    </div>
  );
}

export default BiometricSection;
import React, { useEffect, useState } from "react";
import API from "../services/api";

function ContractSection({ applicantId, user }) {

  const [contract, setContract] = useState(null);
  const [file, setFile] = useState(null);

  const loadContract = async () => {
    const res = await API.get(`/applicants/${applicantId}/contract`);
    setContract(res.data);
  };

  useEffect(() => {
    loadContract();
  }, []);

  const uploadContract = async () => {
    if (!file) return alert("Select file");

    const formData = new FormData();
    formData.append("file", file);

    await API.post(`/applicants/${applicantId}/contract`, formData);

    setFile(null);
    loadContract();
  };

  return (
    <div className="card">

      <h3>Contract</h3>

      {/* VIEW */}
      {contract && (
        <div>
          <a href={contract.fileUrl} target="_blank">
            View / Download Contract
          </a>

          <p style={{ fontSize: "12px" }}>
            Uploaded by: {contract.uploadedByRole}
          </p>
        </div>
      )}

      {/* UPLOAD (ONLY SUPER USER & EMPLOYER) */}
      {(user?.role === "SUPER_USER" || user?.role === "EMPLOYER") && (
        <div>

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          {file && (
            <button onClick={uploadContract}>
              Upload Contract
            </button>
          )}

        </div>
      )}

    </div>
  );
}

export default ContractSection;
import React, { useEffect, useState } from "react";
import API from "../services/api";
import { ALLOWED_DOCUMENT_ACCEPT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
import { toast } from "../utils/toast";

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

    if (!file) return toast.error("Select a file to upload");
    const fileValidation = validateDocumentFiles([file]);
    if (!fileValidation.valid) return toast.error(fileValidation.message);

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
          <a href={data.fileUrl} target="_blank" rel="noreferrer">View Slip</a>
          <a href={data.fileUrl} download>Download Slip</a>
        </div>
      )}

      {/* UPLOAD (AGENCY ONLY) */}
      {user?.role === "AGENCY" && !data && (
        <div>

          <input
            type="file"
            accept={ALLOWED_DOCUMENT_ACCEPT}
            onChange={(e) => setFile(getValidatedDocumentFile(e.target.files[0], toast.error))}
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

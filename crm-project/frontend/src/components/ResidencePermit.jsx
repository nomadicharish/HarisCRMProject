import React, { useEffect, useState } from "react";
import API from "../services/api";

function ResidencePermit({ applicantId, user, loadApplicant }) {

  const [data, setData] = useState(null);
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/residence-permit`);
    console.log("RES DATA:", res.data); // 👈 ADD
    setData(res.data);
  };
  useEffect(() => {
    loadData();
  }, []);

  const upload = async (type, file) => {
    if (!file) return alert("Select file");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    await API.post(
      `/applicants/${applicantId}/residence-permit`,
      formData
    );

    setFrontFile(null);
    setBackFile(null);

    loadData();
    loadApplicant(); // 🔥 update stage
  };

  return (
    <div className="card">

  <h3>Residence Permit</h3>

  {/* VIEW SECTION */}
  <div style={{ marginBottom: "15px" }}>

    {data?.frontUrl && (
      <div>
        <b>Front Side:</b>{" "}
        <a href={data.frontUrl} target="_blank">View</a>
      </div>
    )}

    {data?.backUrl && (
      <div>
        <b>Back Side:</b>{" "}
        <a href={data.backUrl} target="_blank">View</a>
      </div>
    )}

  </div>

  {/* FRONT UPLOAD */}
  {user?.role === "AGENCY" && !data?.frontUrl && (
    <div style={{ marginBottom: "15px" }}>

      <label><b>Upload Front Side *</b></label><br />

      <input
        type="file"
        onChange={(e) => setFrontFile(e.target.files[0])}
      />

      {frontFile && (
        <button onClick={() => upload("FRONT", frontFile)}>
          Upload Front
        </button>
      )}

    </div>
  )}

  {/* BACK UPLOAD */}
  {user?.role === "AGENCY" && !data?.backUrl && (
    <div>

      <label><b>Upload Back Side *</b></label><br />

      <input
        type="file"
        onChange={(e) => setBackFile(e.target.files[0])}
      />

      {backFile && (
        <button onClick={() => upload("BACK", backFile)}>
          Upload Back
        </button>
      )}

    </div>
  )}

</div>
  );
}

export default ResidencePermit;
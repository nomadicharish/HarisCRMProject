import React, { useEffect, useState } from "react";
import API from "../services/api";
import { ALLOWED_DOCUMENT_ACCEPT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";

function InterviewTicket({ applicantId, user }) {

  const [data, setData] = useState(null);

  const [form, setForm] = useState({
    date: "",
    time: ""
  });

  const [file, setFile] = useState(null);

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/interview-ticket`);
    setData(res.data);
  };

  const openPrivateFile = async () => {
    if (!data?.fileUrl) return;
    const response = await API.get(`/applicants/${applicantId}/private-file`, {
      params: { url: data.fileUrl },
      responseType: "blob"
    });
    const url = URL.createObjectURL(response.data);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const submit = async () => {
    const fileValidation = validateDocumentFiles([file]);
    if (!fileValidation.valid) return alert(fileValidation.message);

    const formData = new FormData();

    formData.append("date", form.date);
    formData.append("time", form.time);

    if (file) {
      formData.append("file", file);
    }

    await API.post(`/applicants/${applicantId}/interview-ticket`, formData);

    setForm({ date: "", time: "" });
    setFile(null);

    loadData();
  };

  return (
    <div className="card">

      <h3>Embassy Interview Travel Ticket</h3>

      {/* VIEW */}
      {data && (
        <div>

          <p>Date: {data.date}</p>
          <p>Time: {data.time}</p>

          {data.fileUrl && (
            <button type="button" onClick={openPrivateFile}>
              Download Ticket
            </button>
          )}

        </div>
      )}

      {/* ADD (AGENCY ONLY) */}
      {user?.role === "AGENCY" && (
        <div>

          <input
            type="date"
            name="date"
            value={form.date}
            onChange={handleChange}
          />

          <input
            type="time"
            name="time"
            value={form.time}
            onChange={handleChange}
          />

          <input
            type="file"
            accept={ALLOWED_DOCUMENT_ACCEPT}
            onChange={(e) => setFile(getValidatedDocumentFile(e.target.files[0], alert))}
          />

          <button onClick={submit}>
            Save Ticket
          </button>

        </div>
      )}

    </div>
  );
}

export default InterviewTicket;

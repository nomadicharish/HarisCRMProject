import React, { useEffect, useState } from "react";
import API from "../services/api";

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
            <a href={data.fileUrl} target="_blank">
              Download Ticket
            </a>
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
            onChange={(e) => setFile(e.target.files[0])}
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
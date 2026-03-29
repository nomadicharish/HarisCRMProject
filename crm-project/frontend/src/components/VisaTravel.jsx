import React, { useEffect, useState } from "react";
import API from "../services/api";

function VisaTravel({ applicantId, user }) {

  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    date: "",
    time: "",
    ticketNumber: ""
  });
  const [file, setFile] = useState(null);

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/visa-travel`);
    setData(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submit = async () => {

    const formData = new FormData();

    formData.append("date", form.date);
    formData.append("time", form.time);
    formData.append("ticketNumber", form.ticketNumber);

    if (file) {
      formData.append("file", file);
    }

    await API.post(`/applicants/${applicantId}/visa-travel`, formData);

    setForm({ date: "", time: "", ticketNumber: "" });
    setFile(null);

    loadData();
  };

  return (
    <div className="card">

      <h3>Visa Travel Details</h3>

      {/* VIEW */}
      {data && (
        <div>
          <p>Date: {data.date}</p>
          <p>Time: {data.time}</p>

          {data.ticketNumber && (
            <p>Ticket No: {data.ticketNumber}</p>
          )}

          {data.fileUrl && (
            <a href={data.fileUrl} target="_blank">
              Download Ticket
            </a>
          )}
        </div>
      )}

      {/* ADD */}
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
            type="text"
            placeholder="Ticket Number (optional)"
            name="ticketNumber"
            value={form.ticketNumber}
            onChange={handleChange}
          />

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button onClick={submit}>
            Save Travel Details
          </button>

        </div>
      )}

    </div>
  );
}

export default VisaTravel;
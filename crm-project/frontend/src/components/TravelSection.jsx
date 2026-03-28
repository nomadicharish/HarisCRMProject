import React, { useEffect, useState } from "react";
import API from "../services/api";

function TravelSection({ applicantId, user }) {

  const [data, setData] = useState(null);

  const [form, setForm] = useState({
    travelDate: "",
    time: "",
    ticketNumber: ""
  });

  const [file, setFile] = useState(null);

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/travel`);
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

  const handleSubmit = async () => {

    const formData = new FormData();

    formData.append("travelDate", form.travelDate);
    formData.append("time", form.time);
    formData.append("ticketNumber", form.ticketNumber);

    if (file) {
      formData.append("file", file);
    }

    await API.post(`/applicants/${applicantId}/travel`, formData);

    setForm({ travelDate: "", time: "", ticketNumber: "" });
    setFile(null);

    loadData();
  };

  return (
    <div className="card">

      <h3>Travel Details</h3>

      {/* VIEW */}
      {data && (
        <div>

          <p>Travel Date: {data.travelDate}</p>
          <p>Time: {data.time}</p>

          {data.ticketNumber && (
            <p>Ticket Number: {data.ticketNumber}</p>
          )}

          {data.fileUrl && (
            <a href={data.fileUrl} target="_blank">
              Download Ticket
            </a>
          )}

        </div>
      )}

      {/* ADD (AGENCY + SUPER USER) */}
      {(user?.role === "AGENCY" || user?.role === "SUPER_USER") && (
        <div>

          <input
            type="date"
            name="travelDate"
            value={form.travelDate}
            onChange={handleChange}
          />

          <input
            type="time"
            name="time"
            value={form.time}
            onChange={handleChange}
          />

          <input
            name="ticketNumber"
            placeholder="Ticket Number (Optional)"
            value={form.ticketNumber}
            onChange={handleChange}
          />

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button onClick={handleSubmit}>
            Save Travel Details
          </button>

        </div>
      )}

    </div>
  );
}

export default TravelSection;
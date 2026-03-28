import React, { useEffect, useState } from "react";
import API from "../services/api";

function EmbassyAppointment({ applicantId, user, loadApplicant }) {

  const [appointment, setAppointment] = useState(null);
  const [dateTime, setDateTime] = useState("");
  const [file, setFile] = useState(null);

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/embassy-appointment`);
    setAppointment(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async () => {

    const formData = new FormData();
    formData.append("dateTime", dateTime);

    if (file) {
      formData.append("file", file);
    }

    await API.post(`/applicants/${applicantId}/embassy-appointment`, formData);

    setDateTime("");
    setFile(null);

    loadData();
    loadApplicant(); // 🔥 refresh stage
  };

  return (
    <div className="card">

      <h3>Embassy Appointment</h3>

      {/* VIEW */}
      {appointment && (
        <div>
          <p>
            Date & Time:{" "}
            {new Date(appointment.dateTime).toLocaleString()}
          </p>

          {appointment.fileUrl && (
            <a href={appointment.fileUrl} target="_blank">
              Download Document
            </a>
          )}
        </div>
      )}

      {/* ADD (SUPER USER / EMPLOYER) */}
      {(user?.role === "SUPER_USER" || user?.role === "EMPLOYER") && (
        <div>

          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
          />

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button onClick={handleSubmit}>
            Save Appointment
          </button>

        </div>
      )}

    </div>
  );
}

export default EmbassyAppointment;
import React, { useCallback, useEffect, useState } from "react";
import API from "../services/api";

function DispatchSection({ applicantId }) {

  const [dispatches, setDispatches] = useState([]);

  const [form, setForm] = useState({
    note: "",
    trackingUrl: "",
    awbNumber: ""
  });

  const loadDispatches = useCallback(async () => {
    const res = await API.get(`/applicants/${applicantId}/dispatch`);
    setDispatches(res.data || []);
  }, [applicantId]);

  useEffect(() => {
    if (applicantId) loadDispatches();
  }, [applicantId, loadDispatches]);

  const formatDispatchDate = (createdAt) => {
    if (!createdAt) return "-";

    if (typeof createdAt === "number" || typeof createdAt === "string") {
      const date = new Date(createdAt);
      return Number.isNaN(date.getTime())
        ? "-"
        : date.toLocaleDateString();
    }

    if (typeof createdAt?.toDate === "function") {
      return createdAt.toDate().toLocaleDateString();
    }

    if (typeof createdAt === "object" && createdAt._seconds) {
      const date = new Date(createdAt._seconds * 1000);
      return Number.isNaN(date.getTime())
        ? "-"
        : date.toLocaleDateString();
    }

    return "-";
  };

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const addDispatch = async () => {
    await API.post(`/applicants/${applicantId}/dispatch`, form);

    setForm({ note: "", trackingUrl: "", awbNumber: "" });

    loadDispatches();
  };

  return (
    <div className="card">

      <h3>Dispatch Tracking</h3>

      {/* FORM */}
      <div style={{ marginBottom: "20px" }}>

        <input
          name="note"
          placeholder="Dispatch Note"
          value={form.note}
          onChange={handleChange}
        />

        <input
          name="trackingUrl"
          placeholder="Tracking URL"
          value={form.trackingUrl}
          onChange={handleChange}
        />

        <input
          name="awbNumber"
          placeholder="AWB Number"
          value={form.awbNumber}
          onChange={handleChange}
        />

        <button onClick={addDispatch}>
          Add Dispatch
        </button>

      </div>

      {/* LIST */}
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Note</th>
            <th>AWB</th>
            <th>Tracking</th>
            <th>Date</th>
          </tr>
        </thead>

        <tbody>
          {dispatches.map(d => (
            <tr key={d.id}>
              <td>{d.note}</td>
              <td>{d.awbNumber}</td>
              <td>
                {d.trackingUrl && (
                  <a href={d.trackingUrl} target="_blank" rel="noreferrer">
                    Track
                  </a>
                )}
              </td>
              <td>
                {formatDispatchDate(d.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}

export default DispatchSection;

import React, { useEffect, useState } from "react";
import API from "../services/api";

function VisaCollection({ applicantId, user, loadApplicant }) {

  const [data, setData] = useState(null);
  const [form, setForm] = useState({ date: "", time: "" });

  const loadData = async () => {
    const res = await API.get(`/applicants/${applicantId}/visa-collection`);
    setData(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submit = async () => {
    await API.post(`/applicants/${applicantId}/visa-collection`, form);
    loadData();
    loadApplicant();
  };

  const approve = async () => {
    await API.patch(`/applicants/${applicantId}/visa-collection/approve`);
    loadData();
    loadApplicant();
  };

  return (
    <div className="card">

      <h3>Visa Collection</h3>

      {/* VIEW */}
      {data && (
        <div>
          <p>Date: {data.date}</p>
          <p>Time: {data.time}</p>
          <p>Status: {data.status}</p>
        </div>
      )}

      {/* ADD */}
      {!data && ["EMPLOYER", "SUPER_USER"].includes(user?.role) && (
        <div>
          <input type="date" name="date" onChange={handleChange} />
          <input type="time" name="time" onChange={handleChange} />
          <button onClick={submit}>Save</button>
        </div>
      )}

      {/* APPROVE */}
      {user?.role === "SUPER_USER" && data?.status === "PENDING" && (
        <button onClick={approve}>
          Approve Visa Collection
        </button>
      )}

    </div>
  );
}

export default VisaCollection;
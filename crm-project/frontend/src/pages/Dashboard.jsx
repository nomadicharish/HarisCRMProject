import { useEffect, useState } from "react";
import API from "../services/api";

function Dashboard() {
  const [data, setData] = useState(null);

  const loadDashboard = async () => {
    try {

      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v)
      );

      const query = new URLSearchParams(cleanFilters).toString();

      const res = await API.get(`/dashboard?${query}`);

      setData(res.data);

    } catch (err) {
      console.error(err);
    }
  };

   
    const [filters, setFilters] = useState({
    companyId: "",
    agencyId: "",
    fromDate: "",
    toDate: ""
      });

    const [companies, setCompanies] = useState([]);
    const [agencies, setAgencies] = useState([]);

    const loadFilters = async () => {
      try {
        const c = await API.get("/companies");
        setCompanies(c.data);

        const a = await API.get("/agencies");
        setAgencies(a.data);
      } catch (err) {
        console.error(err);
      }
    };

    const [user, setUser] = useState(null);

    const loadUser = async () => {
      try {
        const res = await API.get("/auth/me");
        setUser(res.data);
      } catch (err) {
        console.error("Failed to load user", err);
      }
    };


     useEffect(() => {
      loadUser();
      loadDashboard();
      loadFilters();
    }, []);


  

  if (!data) return <p>Loading...</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h2>Dashboard</h2>

      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <div style={{ marginBottom: "20px" }}>

          {/* COMPANY */}
          <select
            value={filters.companyId}
            onChange={(e) =>
              setFilters({ ...filters, companyId: e.target.value })
            }
          >
            <option value="">All Companies</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* AGENCY */}
          {user && user.role === "SUPER_USER" && (
            <select
              value={filters.agencyId}
              onChange={(e) =>
                setFilters({ ...filters, agencyId: e.target.value })
              }
            >
              <option value="">All Agencies</option>
              {agencies.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {/* DATE FROM */}
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) =>
              setFilters({ ...filters, fromDate: e.target.value })
            }
          />

          {/* DATE TO */}
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) =>
              setFilters({ ...filters, toDate: e.target.value })
            }
          />

          {/* APPLY */}
          <button onClick={loadDashboard}>
            Apply Filters
          </button>

        </div>


        <div style={card}>
          <h3>Total Applicants</h3>
          <p>{data.totalApplicants}</p>
        </div>

        <div style={card}>
          <h3>Ongoing</h3>
          <p>{data.ongoing}</p>
        </div>

        <div style={card}>
          <h3>Completed</h3>
          <p>{data.completed}</p>
        </div>

      </div>

      <h3 style={{ marginTop: "30px" }}>Stage Breakdown</h3>

      <ul>
        {Object.entries(data.stageCounts).map(([stage, count]) => (
          <li key={stage}>
            Stage {stage}: {count}
          </li>
        ))}
      </ul>

    </div>
  );
}

const card = {
  padding: "20px",
  border: "1px solid #ddd", 
  borderRadius: "10px",
  width: "200px",
  textAlign: "center",
  background: "#f9f9f9"
};

export default Dashboard;
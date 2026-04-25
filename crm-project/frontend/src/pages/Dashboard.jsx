import { useEffect, useState } from "react";
import API from "../services/api";
import { getCached } from "../services/cachedApi";
import PageLoader from "../components/common/PageLoader";

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

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
        const [companiesData, agenciesData] = await Promise.all([
          getCached("/companies", { ttlMs: 60000 }),
          getCached("/agencies", { ttlMs: 60000 })
        ]);
        setCompanies(normalizeListResponse(companiesData));
        setAgencies(normalizeListResponse(agenciesData));
      } catch (err) {
        console.error(err);
      }
    };

    const [user, setUser] = useState(null);

    const loadUser = async () => {
      try {
        const userData = await getCached("/auth/me", { ttlMs: 120000 });
        setUser(userData);
      } catch (err) {
        console.error("Failed to load user", err);
      }
    };

    const filterBar = {
      display: "flex",
      gap: "10px",
      marginBottom: "20px",
      background: "#fff",
      padding: "15px",
      borderRadius: "10px",
      boxShadow: "0 2px 5px rgba(0,0,0,0.05)"
    };

    const cardContainer = {
      display: "flex",
      gap: "20px"
    };

    const card = {
      flex: 1,
      background: "#fff",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
    };

    const pipelineContainer = {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gap: "15px",
      marginTop: "15px"
    };

    const pipelineCard = {
      background: "#fff",
      padding: "15px",
      borderRadius: "10px",
      textAlign: "center",
      boxShadow: "0 2px 5px rgba(0,0,0,0.05)"
    };

    const alertCard = {
      flex: 1,
      background: "#fff",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      borderLeft: "5px solid red"
    };

    const paymentCard = {
      flex: 1,
      background: "#fff",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      borderLeft: "5px solid green"
    };


     useEffect(() => {
      loadUser();
      loadDashboard();
      loadFilters();
    }, []);


  

  if (!data) return <PageLoader label="Loading dashboard..." />;

  return (
    <div style={{ padding: "20px", background: "#f5f7fb", minHeight: "100vh" }}>
      
      <h2 style={{ marginBottom: "20px" }}>Dashboard</h2>

      {/* 🔍 FILTER BAR */}
      <div style={filterBar}>

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

        <input
          type="date"
          value={filters.fromDate}
          onChange={(e) =>
            setFilters({ ...filters, fromDate: e.target.value })
          }
        />

        <input
          type="date"
          value={filters.toDate}
          onChange={(e) =>
            setFilters({ ...filters, toDate: e.target.value })
          }
        />

        <button onClick={loadDashboard}>Apply</button>
      </div>

      {/* 📊 KPI CARDS */}
      <div style={cardContainer}>

        <div style={{ ...card, borderLeft: "5px solid #4CAF50" }}>
          <p>Total Applicants</p>
          <h2>{data.totalApplicants}</h2>
        </div>

        <div style={{ ...card, borderLeft: "5px solid #2196F3" }}>
          <p>Ongoing</p>
          <h2>{data.ongoing}</h2>
        </div>

        <div style={{ ...card, borderLeft: "5px solid #FF9800" }}>
          <p>Completed</p>
          <h2>{data.completed}</h2>
        </div>

      </div>

      {/* 🚀 STAGE PIPELINE */}
      <div style={{ marginTop: "30px" }}>
        <h3>Pipeline Status</h3>

        <div style={pipelineContainer}>
          {Array.from({ length: 11 }, (_, i) => i + 1).map(stage => (
            <div key={stage} style={pipelineCard}>
              <p>Stage {stage}</p>
              <h3>{data.stageCounts[stage] || 0}</h3>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "30px" }}>
        <h3>Alerts</h3>

        <div style={{ display: "flex", gap: "20px" }}>

          <div style={alertCard}>
            <p>📄 Pending Documents</p>
            <h2>{data.alerts?.pendingDocs || 0}</h2>
          </div>

          <div style={alertCard}>
            <p>⏳ Pending Approvals</p>
            <h2>{data.alerts?.pendingApproval || 0}</h2>
          </div>

        </div>
      </div>

      <div style={{ marginTop: "30px" }}>
        <h3>Payments</h3>

        <div style={{ display: "flex", gap: "20px" }}>

          <div style={paymentCard}>
            <p>💰 Collected</p>
            <h2>{data.payments?.totalCollected || 0}</h2>
          </div>

          <div style={paymentCard}>
            <p>🧾 Pending</p>
            <h2>{data.payments?.totalPending || 0}</h2>
          </div>

        </div>
      </div>

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

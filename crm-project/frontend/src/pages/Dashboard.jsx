function Dashboard() {
  const user = JSON.parse(localStorage.getItem("user"));

  return (
    <div style={{ padding: "20px" }}>
      <h2>Dashboard</h2>
      <p>Welcome {user?.email}</p>
      <p>Role: {user?.role}</p>
    </div>
  );
}

export default Dashboard;
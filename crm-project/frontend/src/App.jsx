import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Applicants from "./pages/Applicants";
import ApplicantProfile from "./pages/ApplicantProfile";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/applicants" element={<Applicants />} />
      <Route path="/applicants/:id" element={<ApplicantProfile />} />
    </Routes>
  );
}

export default App;
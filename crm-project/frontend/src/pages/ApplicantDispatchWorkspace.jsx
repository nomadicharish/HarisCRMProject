import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import DispatchSection from "../components/DispatchSection";
import DashboardTopbar from "../components/common/DashboardTopbar";
import "../styles/forms.css";
import "../styles/applicantProfile.css";
import "../styles/applicantsDashboard.css";

function ApplicantDispatchWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [applicant, setApplicant] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [userRes, applicantRes] = await Promise.all([
          API.get("/auth/me"),
          API.get(`/applicants/${id}`)
        ]);

        if (cancelled) return;
        setUser(userRes.data);
        setApplicant(applicantRes.data);
      } catch (error) {
        console.error(error);
        if (!cancelled) setApplicant(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

  if (!applicant) {
    return <div style={{ padding: "40px" }}>Applicant not found</div>;
  }

  const applicantStage = Number(applicant?.stage || 1);
  const canEdit = user?.role === "AGENCY" && applicantStage >= 3 && applicantStage < 5;

  return (
    <div className="page-container">
      <DashboardTopbar user={user} />
      <div className="page-content docsWorkspacePage">
        <DispatchSection
          applicantId={id}
          canEdit={canEdit}
          showTopBar={true}
          onSaved={() => navigate(`/applicants/${id}`)}
        />
      </div>
    </div>
  );
}

export default ApplicantDispatchWorkspace;

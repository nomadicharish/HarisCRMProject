import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import API from "../services/api";
import "../styles/forms.css";
import PipelineTracker from "../components/PipelineTracker";
import DispatchSection from "../components/DispatchSection";
import ContractSection from "../components/ContractSection";
import EmbassyAppointment from "../components/EmbassyAppointment";
import TravelSection from "../components/TravelSection";
import BiometricSection from "../components/BiometricSection";
import EmbassyInterview from "../components/EmbassyInterview";
import InterviewTicket from "../components/InterviewTicket";
import InterviewBiometric from "../components/InterviewBiometric";
import VisaCollection from "../components/VisaCollection";
import VisaTravel from "../components/VisaTravel";
import ResidencePermit from "../components/ResidencePermit";

function ApplicantProfile() {
  const { id } = useParams();
  const [applicant, setApplicant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState({});
  const [selectedFiles, setSelectedFiles] = useState({});

  const handleFileSelect = (docType, file) => {
    setSelectedFiles((prev) => ({
      ...prev,
      [docType]: file
    }));
  };

  const DOCUMENTS = [
    { key: "PASSPORT", label: "Passport Copy", required: true },
    { key: "PAN_CARD", label: "Pan Card Copy", required: true },
    { key: "EDUCATION_10TH", label: "10th Certificate", required: true },
    { key: "EDUCATION_12TH", label: "12th Certificate", required: true },
    { key: "DEGREE", label: "Degree", required: false },
    { key: "PHOTO", label: "Passport Photo", required: true },
    { key: "WORK_MEASUREMENT", label: "Work Measurement", required: false },
    { key: "IDP", label: "International Driving Permit", required: false },
    { key: "UNMARRIED_CERTIFICATE", label: "Unmarried Certificate", required: false },
    { key: "MARRIAGE_CERTIFICATE", label: "Marriage Certificate", required: false },
    { key: "BIRTH_CERTIFICATE", label: "Birth Certificate", required: true },
    { key: "MEDICAL_CERTIFICATE", label: "Medical Certificate", required: true }
  ];
  const loadDocuments = async () => {
    const res = await API.get(`/applicants/${id}/documents`);
    setDocuments(res.data || {});
  };

  const loadUser = async () => {
    const res = await API.get("/auth/me");
    setUser(res.data);
  };

  const loadApplicant = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}`);
      setApplicant(res.data);
    } catch (err) {
      console.error(err);
      setApplicant(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadApplicant();
    loadUser();
    loadDocuments();
  }, []);


  const leftCard = {
    width: "300px",
    background: "#fff",
    padding: "20px",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
  };

  const rightCard = {
    flex: 1,
    background: "#fff",
    padding: "20px",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
  };

  const pipelineRow = {
    padding: "10px",
    marginBottom: "10px",
    borderRadius: "8px"
  };

  const amountBox = {
    marginTop: "15px",
    padding: "10px",
    background: "#f0f4ff",
    borderRadius: "8px",
    fontWeight: "bold"
  };

  const ProfileCard = () => (
      <div style={{
        width: "280px",
        background: "#fff",
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
      }}>
        <h3 style={{ marginBottom: "10px" }}>{applicant.fullName}</h3>

        <p style={{ color: "#666" }}>Age {applicant.age}</p>

        <p style={{ marginTop: "10px" }}>
          📞 {applicant.phone}
        </p>

        <div style={{ marginTop: "10px", color: "#666" }}>
          <div><b>Address</b></div>
          <div>{applicant.address}</div>
        </div>

        <div style={{ marginTop: "10px" }}>
          <b>Employer</b>
          <div>{applicant.companyName}</div>
        </div>

        <div style={{
          marginTop: "15px",
          background: "#eef3ff",
          padding: "10px",
          borderRadius: "8px",
          fontWeight: "bold"
        }}>
          Pending Amount<br />
          ₹ {applicant.pendingAmount}
        </div>
      </div>
    );

    const Pipeline = () => {

        return (
          <div style={{
            flex: 1,
            background: "#fff",
            padding: "20px",
            borderRadius: "12px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
          }}>

            <h3>Complete pipeline</h3>

            {/* PROGRESS HEADER */}
            <div style={{
              background: "#eef3ff",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "20px"
            }}>
              <b>
                {applicant.stage}/11 Complete the process
              </b>
            </div>

            {STAGES.map(stage => {

              const isActive = applicant.stage === stage.id;
              const isCompleted = applicant.stage > stage.id;

              return (
                <div key={stage.id} style={{
                  padding: "14px",
                  borderRadius: "8px",
                  marginBottom: "10px",
                  background: isActive
                    ? "#eef3ff"
                    : isCompleted
                      ? "#f6f6f6"
                      : "#fff",
                  border: isActive
                    ? "1px solid #4f6ef7"
                    : "1px solid #eee"
                }}>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>

                    <div>
                      <b>{stage.name}</b>

                      {isCompleted && (
                        <div style={{ color: "green", fontSize: "12px" }}>
                          Completed
                        </div>
                      )}
                    </div>

                    {/* CTA BUTTONS */}
                    {isActive && stage.id === 2 && (
                      <button className="btn-primary">
                        Upload Documents
                      </button>
                    )}

                  </div>

                </div>
              );
            })}
          </div>
        );
      };

      const DocumentSection = () => {

          return (
            <div style={{
              marginTop: "20px",
              background: "#fff",
              padding: "20px",
              borderRadius: "12px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
            }}>

              <h3>Upload relevant documents for admin approval</h3>

              {/* STATUS BANNER */}
              {allApproved && (
                <div style={{
                  background: "#e6f7ec",
                  padding: "10px",
                  borderRadius: "8px",
                  marginBottom: "15px",
                  color: "green"
                }}>
                  All documents uploaded. Ready for approval
                </div>
              )}

              {/* DOCUMENT LIST */}
              {DOCUMENTS.map(doc => {

                const versions = documents[doc.key] || [];
                const latest = versions[0];

                return (
                  <div key={doc.key} style={{
                    padding: "12px",
                    borderBottom: "1px solid #eee"
                  }}>

                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>

                      <div>
                        {doc.label}

                        {latest?.status === "APPROVED" && (
                          <span style={{ color: "green", marginLeft: "10px" }}>
                            ✔ Approved
                          </span>
                        )}

                        {latest?.status === "REJECTED" && (
                          <span style={{ color: "red", marginLeft: "10px" }}>
                            ❌ Rejected
                          </span>
                        )}
                      </div>

                      <div>

                        {latest?.fileUrl && (
                          <a href={latest.fileUrl} target="_blank">
                            View
                          </a>
                        )}

                        {(!latest || latest.status === "REJECTED") && (
                          <>
                            <input
                              type="file"
                              onChange={(e) =>
                                handleFileSelect(doc.key, e.target.files[0])
                              }
                            />

                            <button onClick={() => uploadDoc(doc.key, selectedFiles[doc.key])}>
                              Upload
                            </button>
                          </>
                        )}

                      </div>

                    </div>

                  </div>
                );
              })}

            </div>
          );
        };

  if (loading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

  if (!applicant) {
    return <div style={{ padding: "40px" }}>Applicant not found</div>;
  }

  const firstName =
    applicant.firstName || applicant.personalDetails?.firstName || "";
  const lastName = applicant.lastName || applicant.personalDetails?.lastName || "";
  const phone = applicant.phone || applicant.personalDetails?.phone || "-";
  const address = applicant.address || applicant.personalDetails?.address || "-";

  const total = applicant.payment?.total ?? 0;
  const paid = applicant.payment?.paid ?? 0;
  const pending = applicant.payment?.pending ?? Math.max(0, total - paid);

  const approveStage = async () => {
    try {

      await API.patch(`/applicants/${id}/approve-stage`);

      alert("Stage approved!");
      loadApplicant();

    } catch (err) {
      console.error("FULL ERROR:", err.response?.data || err);
      alert(err.response?.data?.message || "Error approving stage");
    }
  };

  const uploadDoc = async (docType, file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", docType);

      await API.post(
        `/applicants/${id}/upload-document`,
        formData
      );

      // ✅ CLEAR selected file after upload
      setSelectedFiles((prev) => {
        const updated = { ...prev };
        delete updated[docType];
        return updated;
      });

      // ✅ Reload documents from backend
      await loadDocuments();

    } catch (err) {
      console.error(err);
      alert("Upload failed");
    }
  };

  const rejectDoc = async (docType, versionId) => {
    const reason = prompt("Enter reason");
    await API.patch(`/applicants/${id}/documents/${docType}/${versionId}/reject`, { reason });
    loadDocuments();
  };

  const deferDoc = async (docType) => {
    await API.patch(`/applicants/${id}/documents/${docType}/defer`);
    loadDocuments();
  };

  const requiredDocs = DOCUMENTS
    .filter(d => d.required)
    .map(d => d.key);

  const approveDoc = async (docType, versionId) => {
    await API.patch(`/applicants/${id}/documents/${docType}/${versionId}/approve`);
    loadDocuments();
    loadApplicant();
  };

  const allApproved = requiredDocs.every((docType) => {

    const versions = Array.isArray(documents[docType])
      ? documents[docType]
      : [];

    if (versions.length === 0) return false;

    // ✅ Find latest version manually
    const latest = versions.reduce((latest, current) => {
      return new Date(current.uploadedAt) > new Date(latest.uploadedAt)
        ? current
        : latest;
    });

    return latest.status === "APPROVED";
  });

  const manualStages = [1, 2, 4, 5, 7, 9, 11];
  const isManualStage = manualStages.includes(applicant.stage);
  const hasNextStage = applicant.stage < 11;
  const canApproveStage =
    isManualStage &&
    hasNextStage &&
    (applicant.stage !== 2 || allApproved); // Stage 2 needs doc approval


    const completeProcess = async () => {
      try {

        await API.patch(`/applicants/${id}/complete`);

        alert("Process Completed ✅");

        loadApplicant();

      } catch (err) {
        console.error(err);
        alert("Error completing process");
      }
    };

    const STAGES = [
      { id: 1, name: "Candidate account creation" },
      { id: 2, name: "Upload documents" },
      { id: 3, name: "Dispatch documents" },
      { id: 4, name: "Contract" },
      { id: 5, name: "Embassy appointment" },
      { id: 6, name: "Biometric" },
      { id: 7, name: "Interview" },
      { id: 8, name: "Visa collection" },
      { id: 9, name: "Travel" },
      { id: 10, name: "Residence permit" },
      { id: 11, name: "Completed" }
    ];

  return (
    <div className="page-container">
      <div className="page-content">

        <h2>Applicant Profile</h2>

        <div style={{ display: "flex", gap: "20px" }}>

          {/* LEFT */}
          <ProfileCard />

          {/* RIGHT */}
          <Pipeline />

        </div>

        {/* DOCUMENT SECTION ONLY FOR STAGE 2 */}
        {applicant.stage === 2 && <DocumentSection />}

      </div>
    </div>
      );
}

export default ApplicantProfile;

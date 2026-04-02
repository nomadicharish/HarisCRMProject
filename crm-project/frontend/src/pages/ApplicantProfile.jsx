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

          {/* LEFT CARD */}
          <div style={leftCard}>
            <h3>{applicant.fullName}</h3>
            <p>Age {applicant.age}</p>
            <p>{applicant.phone}</p>

            <p><b>Employer:</b> {applicant.companyName}</p>

            <div style={amountBox}>
              Pending: ₹ {applicant.pendingAmount}
            </div>
          </div>

          {/* RIGHT PIPELINE */}
          <div style={rightCard}>
            <h3>Complete Pipeline</h3>

            {STAGES.map(stage => (
              <div key={stage.id} style={pipelineRow}>
                {stage.name}
              </div>
            ))}
          </div>

        </div>

        <div className="card">
          <h3>Documents</h3>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>

              {DOCUMENTS.map(doc => {

                if (doc.key === "UNMARRIED_CERTIFICATE" && applicant.maritalStatus !== "Single") return null;
                if (doc.key === "MARRIAGE_CERTIFICATE" && applicant.maritalStatus !== "Married") return null;

                const versions = documents[doc.key] || [];
                const selected = selectedFiles[doc.key];

                // Latest version (important)
                const latest = versions[0];

                return (
                  <React.Fragment key={doc.key}>

                    {/* DOCUMENT HEADER ROW */}
                    <tr style={{ background: "#f9f9f9" }}>
                      <td>
                        <b>{doc.label}</b> {doc.required && "*"}
                      </td>

                      <td>
                        {!latest && "Not Uploaded"}

                        {latest?.status === "PENDING" && "⏳ Pending"}
                        {latest?.status === "APPROVED" && "✅ Approved"}
                        {latest?.status === "REJECTED" && "❌ Rejected"}
                        {latest?.status === "DEFERRED" && "⏸ Deferred"}
                      </td>

                      <td>

                        {/* FILE SELECT */}
                        {(!latest || latest.status === "REJECTED") && (
                          <>
                            <input
                              type="file"
                              onChange={(e) =>
                                handleFileSelect(doc.key, e.target.files[0])
                              }
                            />

                            {selected && (
                              <button onClick={() => uploadDoc(doc.key, selected)}>
                                Upload
                              </button>
                            )}
                          </>
                        )}

                        {/* DEFER */}
                        {!doc.required && !latest && (
                          <button onClick={() => deferDoc(doc.key)}>
                            Defer
                          </button>
                        )}

                      </td>
                    </tr>

                    {/* VERSION ROWS */}
                    {versions.map((v, index) => (
                      <tr key={v.id} style={{ background: "#fff" }}>

                        {/* VERSION LABEL */}
                        <td style={{ paddingLeft: "30px" }}>
                          Version {versions.length - index}
                        </td>

                        {/* STATUS */}
                        <td>
                          {v.status === "PENDING" && "⏳ Pending"}
                          {v.status === "APPROVED" && "✅ Approved"}
                          {v.status === "REJECTED" && "❌ Rejected"}
                        </td>

                        {/* ACTIONS */}
                        <td>

                          {/* VIEW */}
                          <a href={v.fileUrl} target="_blank">
                            View
                          </a>

                          {/* REJECTION REASON */}
                          {v.status === "REJECTED" && (
                            <div style={{ color: "red", fontSize: "12px" }}>
                              Reason: {v.rejectedReason}
                            </div>
                          )}

                          {/* APPROVE / REJECT */}
                          {user?.role === "SUPER_USER" && v.status === "PENDING" && (
                            <>
                              <button onClick={() => approveDoc(doc.key, v.id)}>
                                Approve
                              </button>

                              <button onClick={() => rejectDoc(doc.key, v.id)}>
                                Reject
                              </button>
                            </>
                          )}

                        </td>

                      </tr>
                    ))}

                  </React.Fragment>
                );
              })}

            </tbody>
          </table>
        </div>

        {applicant.stage >= 3 && (
          <DispatchSection applicantId={id} />
        )}

        {applicant.stage >= 4 && (
          <ContractSection applicantId={id} user={user} />
        )}

        {applicant.stage >= 5 && (
            <EmbassyAppointment
              applicantId={id}
              user={user}
              loadApplicant={loadApplicant}
            />
          )}

        {applicant.stage >= 6 && (
            <TravelSection applicantId={id} user={user} />
        )}

        {applicant.stage >= 6 && (
          <BiometricSection
            applicantId={id}
            user={user}
            loadApplicant={loadApplicant}
          />
        )}

        {applicant.stage >= 7 && (
          <EmbassyInterview
            applicantId={id}
            user={user}
            loadApplicant={loadApplicant}
          />
        )}

        {applicant.stage >= 8 && (
          <InterviewTicket applicantId={id} user={user} />
        )}

        {applicant.stage >= 8 && (
          <InterviewBiometric
            applicantId={id}
            user={user}
            loadApplicant={loadApplicant}
          />
        )}

        {applicant.stage >= 9 && (
          <VisaCollection
            applicantId={id}
            user={user}
            loadApplicant={loadApplicant}
          />
        )}

        {applicant.stage >= 10 && (
          <VisaTravel applicantId={id} user={user} />
        )}

        {applicant.stage >= 10 && (
          <ResidencePermit
            applicantId={id}
            user={user}
            loadApplicant={loadApplicant}
          />
        )}

        {user?.role === "SUPER_USER" && applicant.stage == 11 && (
          <button
            style={{
              marginTop: "20px",
              background: "green",
              color: "white",
              padding: "10px 15px",
              border: "none",
              cursor: "pointer"
            }}
            onClick={completeProcess}
          >
            Mark as Completed
          </button>
        )}

        {applicant.stage === 12 && (
          <p style={{ color: "green", fontWeight: "bold" }}>
            ✅ Candidate Arrived / Process Completed
          </p>
        )}


        <div className="card">
          <h3>Payment Summary</h3>
          <p>
            <b>Total:</b> {"\u20B9"} {total}
          </p>
          <p>
            <b>Paid:</b> {"\u20B9"} {paid}
          </p>
          <p>
            <b>Pending:</b> {"\u20B9"} {pending}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ApplicantProfile;

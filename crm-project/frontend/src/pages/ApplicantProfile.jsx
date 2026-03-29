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

  return (
    <div className="page-container">
      <div className="page-content">
        <h2>Applicant Profile</h2>

        <div className="card">
          <h3>Candidate Details</h3>
          <p>
            <b>Name:</b> {firstName} {lastName}
          </p>
          <p>
            <b>Phone:</b> {phone}
          </p>
          <p>
            <b>Address:</b> {address}
          </p>
          <p>
            <b>Company:</b> {applicant.companyName || "-"}
          </p>
          <p>
            <b>Agency:</b> {applicant.agencyName || "-"}
          </p>
        </div>

        <div className="card">
          <h3>Pipeline Progress</h3>
          <PipelineTracker currentStage={applicant.stage || 1} />
          {user?.role === "SUPER_USER" && (
            <button
              className="submit-btn"
              disabled={!canApproveStage}
              onClick={approveStage}
            >
              Approve & Move to Next Stage
            </button>
          )}
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

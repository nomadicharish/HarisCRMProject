import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import API from "../services/api";
import "../styles/forms.css";
import PipelineTracker from "../components/PipelineTracker";
import DocumentUploader from "../components/DocumentUploader";

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
  }, [loadApplicant]);

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

    loadApplicant(); // refresh data

  } catch (err) {
    console.error(err);
    alert("Error approving stage");
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

const rejectDoc = async (docType) => {
  const reason = prompt("Enter rejection reason");

  await API.patch(
    `/applicants/${id}/documents/${docType}/reject`,
    { reason }
  );

  loadDocuments();
};

const deferDoc = async (docType) => {
  await API.patch(`/applicants/${id}/documents/${docType}/defer`);
  loadDocuments();
};

const requiredDocs = DOCUMENTS
  .filter(d => d.required)
  .map(d => d.key);

const allApproved = requiredDocs.every(
  d => documents[d] && documents[d].status === "APPROVED"
);

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
              disabled={!allApproved}
              onClick={approveStage}
            >
              Approve & Move to Next Stage
            </button>
          )}
        </div>

        <div className="card">
          <h3>Documents</h3>

          {DOCUMENTS.map(doc => {

            // conditional docs
            if (doc.key === "UNMARRIED_CERTIFICATE" && applicant.maritalStatus !== "Single") return null;
            if (doc.key === "MARRIAGE_CERTIFICATE" && applicant.maritalStatus !== "Married") return null;

            const existing = documents[doc.key];
            const selected = selectedFiles[doc.key];

            return (
              <div key={doc.key} style={{ marginBottom: "15px" }}>

              <b>{doc.label}</b>

              {/* STATUS */}
              {existing && (
                <span>
                  {existing.status === "APPROVED" && " ✅ Approved"}
                  {existing.status === "PENDING" && " ⏳ Waiting for approval"}
                  {existing.status === "REJECTED" && " ❌ Rejected"}
                  {existing.status === "DEFERRED" && " ⏸ Deferred"}
                </span>
              )}

              {/* VIEW */}
              {existing && existing.fileUrl && (
                <div>
                  <a href={existing.fileUrl} target="_blank">
                    View Document
                  </a>
                </div>
              )}

              {/* FILE SELECT */}
              {(!existing || existing.status === "REJECTED") && (
                <input
                  type="file"
                  onChange={(e) => handleFileSelect(doc.key, e.target.files[0])}
                />
              )}

              {/* UPLOAD */}
              {selected && !existing && (
                <button onClick={() => uploadDoc(doc.key, selected)}>
                  Upload
                </button>
              )}

              {/* DEFER */}
              {doc.required && !existing && (
                <button onClick={() => deferDoc(doc.key)}>
                  Defer
                </button>
              )}

              {/* REJECT (SUPER USER) */}
              {user?.role === "SUPER_USER" && existing?.status === "PENDING" && (
                <button onClick={() => rejectDoc(doc.key)}>
                  Reject
                </button>
              )}

            </div>
            );
          })}
        </div>

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

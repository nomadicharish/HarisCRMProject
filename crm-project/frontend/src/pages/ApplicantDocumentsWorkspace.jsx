import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import API from "../services/api";
import { getCached, invalidateCache } from "../services/cachedApi";
import "../styles/applicantDocuments.css";
import {
  getDocumentReviewState,
  getVisibleApplicantDocuments,
  getLatestVersion
} from "../constants/applicantDocuments";
import DashboardTopbar from "../components/common/DashboardTopbar";
import BlockingLoader from "../components/common/BlockingLoader";
import PageLoader from "../components/common/PageLoader";

function StatusIcon({ tone = "success" }) {
  if (tone === "danger") {
    return <img src="/error.png" alt="" className="docsErrorIcon" aria-hidden="true" />;
  }

  const styles = {
    success: { bg: "#22c55e", fg: "#fff", symbol: "check" },
    warning: { bg: "#f59e0b", fg: "#fff", symbol: "warn" },
    neutral: { bg: "#cbd5e1", fg: "#fff", symbol: "dot" }
  };

  const style = styles[tone] || styles.neutral;

  return (
    <span
      className="docsInlineIcon"
      style={{ backgroundColor: style.bg, color: style.fg }}
      aria-hidden="true"
    >
      {style.symbol === "check" ? (
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
          <path
            d="M16.667 5.833 8.333 14.167 3.333 9.167"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 5.5v4.75M10 13.75h.01"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

function getTopBarState({
  canReview,
  rejectedRequired,
  uploadedRequired,
  approvedRequired,
  canSendForApproval,
  hasRejectedSelections,
  allRequiredPending,
  currentStage
}) {
  if (Number(currentStage) >= 3 && approvedRequired) {
    return {
      tone: "successSoft",
      title: "All required documents approved",
      actionLabel: ""
    };
  }

  if (canReview) {
    if (approvedRequired) {
      return {
        tone: "successSoft",
        title: "All required documents are approved",
        actionLabel: ""
      };
    }

    return {
      tone: "neutral",
      title: "Review submitted documents and approve or reject each document",
      actionLabel: ""
    };
  }

  if (rejectedRequired && hasRejectedSelections) {
    return {
      tone: "successSoft",
      title: "Looks like all issues are fixed, please resend for approval",
      actionLabel: "Send for approval"
    };
  }

  if (rejectedRequired) {
    return {
      tone: "danger",
      title: "There are few issues in the document, please fix it and resend",
      actionLabel: canSendForApproval ? "Send again" : ""
    };
  }

  if (allRequiredPending) {
    return {
      tone: "neutral",
      title: "Documents pending admin approval",
      actionLabel: ""
    };
  }

  if (canSendForApproval) {
    return {
      tone: "primary",
      title: "All required documents are selected. Request the admin for review & approval to go to next phase",
      actionLabel: "Send for approval"
    };
  }

  if (uploadedRequired) {
    return {
      tone: "successSoft",
      title: "Looks like all issues are fixed, please resend for approval",
      actionLabel: "Send for approval"
    };
  }

  return {
    tone: "neutral",
    title: "Upload relevant documents for admin approval",
    actionLabel: ""
  };
}

function DocumentRejectModal({ open, onClose, onSubmit, loading }) {
  const [comment, setComment] = useState("");

  if (!open) return null;

  return (
    <div className="docModalOverlay">
      <div className="docModalCard">
        <h3>Reject document</h3>
        <textarea
          className="docRejectTextarea"
          disabled={loading}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Add rejection comment"
        />
        <div className="docModalActions">
          <button
            type="button"
            className="btn btnSecondary"
            disabled={loading}
            onClick={() => {
              setComment("");
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btnDanger"
            disabled={loading || !comment.trim()}
            onClick={() => {
              onSubmit(comment.trim());
              setComment("");
            }}
          >
            {loading ? "Saving..." : "Reject document"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplicantDocumentsWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [applicant, setApplicant] = useState(null);
  const [documentConfigs, setDocumentConfigs] = useState([]);
  const [documents, setDocuments] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [rejectState, setRejectState] = useState({ open: false, docKey: "", versionId: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [userRes, documentsContextRes, docsRes] = await Promise.all([
          getCached("/auth/me", { ttlMs: 120000 }),
          getCached(`/applicants/${id}/documents-context`, { ttlMs: 15000 }),
          getCached(`/applicants/${id}/documents`, { ttlMs: 10000 })
        ]);

        if (cancelled) return;
        setUser(userRes || null);
        setApplicant(documentsContextRes?.applicant || null);
        setDocumentConfigs(Array.isArray(documentsContextRes?.documentConfigs) ? documentsContextRes.documentConfigs : []);
        setDocuments(docsRes || {});
      } catch (error) {
        console.error(error);
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
    return <PageLoader label="Loading documents..." />;
  }

  if (!applicant) {
    return <div style={{ padding: "40px" }}>Applicant not found</div>;
  }

  const canReview = user?.role === "SUPER_USER";
  const visibleDocs = getVisibleApplicantDocuments(applicant, documentConfigs);
  const reviewState = getDocumentReviewState(documents, applicant, documentConfigs);

  const requiredSelected = reviewState.requiredDocs.every((doc) => {
    const latest = reviewState.latestByType[doc.key];
    if (latest?.status === "APPROVED" || latest?.status === "PENDING") return true;
    return Boolean(selectedFiles[doc.key]);
  });

  const hasAnySelection = Object.values(selectedFiles).some(Boolean);
  const canSendForApproval = !canReview && hasAnySelection && requiredSelected;
  const hasRejectedSelections = reviewState.requiredDocs.some(
    (doc) => reviewState.latestByType[doc.key]?.status === "REJECTED" && Boolean(selectedFiles[doc.key])
  );
  const allRequiredPending =
    !reviewState.rejectedRequired &&
    reviewState.requiredDocs.length > 0 &&
    reviewState.requiredDocs.every((doc) => reviewState.latestByType[doc.key]?.status === "PENDING");
  const topBar = getTopBarState({
    canReview,
    canSendForApproval,
    hasRejectedSelections,
    allRequiredPending,
    currentStage: applicant.stage,
    ...reviewState
  });

  const getDocumentFileName = (docKey, latest, selectedFile) => {
    if (selectedFile?.name) return selectedFile.name;
    if (latest?.fileName) return latest.fileName;
    if (latest?.fileUrl) {
      try {
        const url = new URL(latest.fileUrl);
        const candidate = url.pathname.split("/").pop();
        if (candidate) return decodeURIComponent(candidate);
      } catch {
        return latest.fileUrl.split("/").pop() || `${docKey}.file`;
      }
    }
    return "";
  };

  const handleSendForApproval = async () => {
    const uploads = Object.entries(selectedFiles);
    if (uploads.length === 0) {
      toast.info("Select documents before sending for approval");
      return;
    }

    try {
      setSaving(true);
      await Promise.all(uploads.map(async ([docKey, file]) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("documentType", docKey);
        await API.post(`/applicants/${id}/upload-document`, formData);
      }));

      invalidateCache(`/applicants/${id}/documents`);
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/applicants");

      navigate(`/applicants/${id}`);
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Document upload failed");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (docKey, versionId) => {
    const previousDocuments = documents;
    setDocuments((prev) => {
      const next = { ...prev };
      const versions = Array.isArray(next[docKey]) ? [...next[docKey]] : [];
      const idx = versions.findIndex((version) => version.id === versionId);
      if (idx >= 0) {
        versions[idx] = {
          ...versions[idx],
          status: "APPROVED",
          rejectedReason: ""
        };
        next[docKey] = versions;
      }
      return next;
    });

    try {
      setSaving(true);
      await API.patch(`/applicants/${id}/documents/${docKey}/${versionId}/approve`);
      invalidateCache(`/applicants/${id}/documents`);
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/applicants");
    } catch (error) {
      console.error(error);
      setDocuments(previousDocuments);
      toast.error(error?.response?.data?.message || "Approval failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (comment) => {
    const previousDocuments = documents;
    const { docKey, versionId } = rejectState;
    setDocuments((prev) => {
      const next = { ...prev };
      const versions = Array.isArray(next[docKey]) ? [...next[docKey]] : [];
      const idx = versions.findIndex((version) => version.id === versionId);
      if (idx >= 0) {
        versions[idx] = {
          ...versions[idx],
          status: "REJECTED",
          rejectedReason: comment
        };
        next[docKey] = versions;
      }
      return next;
    });
    setRejectState({ open: false, docKey: "", versionId: "" });

    try {
      setSaving(true);
      await API.patch(`/applicants/${id}/documents/${docKey}/${versionId}/reject`, { reason: comment });
      invalidateCache(`/applicants/${id}/documents`);
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/applicants");
    } catch (error) {
      console.error(error);
      setDocuments(previousDocuments);
      toast.error(error?.response?.data?.message || "Rejection failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <BlockingLoader open={saving} label="Saving document updates..." />
      <DashboardTopbar user={user} />
      <div className="page-content docsWorkspacePage">
        <div className={`docsTopBar docsTopBar-${topBar.tone}`}>
          <div className="docsTopBarContent">
            <div className="docsTopBarIcon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="docsTopBarTitle">{topBar.title}</div>
              <div className="docsTopBarSubtitle">Request the admin for review &amp; approval to go to next phase.</div>
            </div>
          </div>
          {!canReview && topBar.actionLabel ? (
            <button
              type="button"
              className="btn docsTopBarButton"
              disabled={!canSendForApproval || saving}
              onClick={handleSendForApproval}
            >
              <span className="docsTopBarButtonIcon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2 11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="m22 2-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {saving ? "Submitting..." : topBar.actionLabel}
            </button>
          ) : null}
        </div>

        <div className="docsSectionSpacer" />

        <div className="docsTableCard">
          {visibleDocs.length === 0 ? (
            <div className="docsHint">No company documents are configured for this applicant.</div>
          ) : null}

          {visibleDocs.map((doc) => {
            const versions = documents?.[doc.key] || [];
            const latest = getLatestVersion(versions);
            const isRejected = latest?.status === "REJECTED";
            const isPending = latest?.status === "PENDING";
            const isApproved = latest?.status === "APPROVED";
            const canAgentUpload = !canReview && (!latest || latest.status === "REJECTED");
            const selectedFile = selectedFiles[doc.key];
            const fileName = getDocumentFileName(doc.key, latest, selectedFile);
            const hasSelectedFile = Boolean(selectedFile);
            const statusLabel = hasSelectedFile
              ? "Selected"
              : isApproved
              ? "Uploaded"
              : latest?.status === "PENDING"
              ? canReview
                ? "Approval pending"
                : "Pending admin approval"
              : latest?.status === "REJECTED"
              ? "Changes required"
              : "To be uploaded";
            const statusTone = hasSelectedFile
              ? "is-selected"
              : isRejected
              ? "is-danger"
              : isApproved
              ? "is-success"
              : isPending
              ? "is-warning"
              : "is-pending";

            return (
              <div key={doc.key} className={`docsRow ${isRejected ? "is-rejected" : ""}`}>
                <div className="docsDocCell">
                  <div className="docsDocIcon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="docsDocMeta">
                    <div className="docsDocTitle">
                      {doc.label}
                      {doc.required ? <span className="docsRequiredTag">*</span> : null}
                    </div>
                    <div className="docsHint">Upload png, pdf or jpeg within 2MB</div>
                    {doc.templateFileUrl ? (
                      <a className="docsTemplateLink" href={doc.templateFileUrl} target="_blank" rel="noreferrer">
                        Download template
                      </a>
                    ) : null}
                    {isRejected && latest?.rejectedReason ? (
                      <div className="docsRejectedNote">{latest.rejectedReason}</div>
                    ) : null}
                  </div>
                </div>

                <div className="docsFileCell">
                  {canAgentUpload ? (
                    <label className="docsFileBox docsFileBoxUpload">
                      <input
                        type="file"
                        className="docsFileInput"
                        disabled={saving}
                        onChange={(event) =>
                          setSelectedFiles((prev) => ({
                            ...prev,
                            [doc.key]: event.target.files?.[0] || null
                          }))
                        }
                      />
                      <div className="docsFileBoxLeft">
                        <span className="docsFileTypeIcon" aria-hidden="true">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H7a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-7-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <div>
                          <div className="docsFileName">{fileName || "Choose document"}</div>
                          <div className="docsFileMeta">{fileName ? "Ready to send for approval" : "Tap to browse files"}</div>
                        </div>
                      </div>
                    </label>
                  ) : latest?.fileUrl ? (
                    <div className="docsFileBox">
                      <div className="docsFileBoxLeft">
                        <span className="docsFileTypeIcon" aria-hidden="true">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H7a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-7-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <div>
                          <div className="docsFileName">{fileName || `${doc.label}.file`}</div>
                          <div className="docsFileMeta">{isPending ? "Awaiting review" : "Latest uploaded file"}</div>
                        </div>
                      </div>
                      <a className="docsViewBtn" href={latest.fileUrl} target="_blank" rel="noreferrer">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                        View
                      </a>
                    </div>
                  ) : (
                    <div className="docsFileBox docsFileBoxEmpty">
                      <div className="docsFileMeta">No document uploaded yet</div>
                    </div>
                  )}
                </div>

                <div className="docsStatusCell">
                  <span className={`docsStatusBadge ${statusTone}`}>
                    {isApproved ? <StatusIcon tone="success" /> : null}
                    {isPending ? <StatusIcon tone="warning" /> : null}
                    {isRejected ? <StatusIcon tone="danger" /> : null}
                    {hasSelectedFile ? <StatusIcon tone="neutral" /> : null}
                    {statusLabel}
                  </span>

                  {canReview && latest?.status === "PENDING" ? (
                    <div className="docsReviewActions">
                      <button
                        type="button"
                        className="btn btnSuccess btnSm"
                        disabled={saving}
                        onClick={() => handleApprove(doc.key, latest.id)}
                      >
                        {saving ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="btn btnDanger btnSm"
                        disabled={saving}
                        onClick={() => setRejectState({ open: true, docKey: doc.key, versionId: latest.id })}
                      >
                        {saving ? "Saving..." : "Reject"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {saving ? <div className="docsBusyLayer">Please wait...</div> : null}
        <div className="docsFooterNote">Your documents are securely encrypted and will only be used for verification purposes.</div>
      </div>

      <DocumentRejectModal
        open={rejectState.open}
        loading={saving}
        onClose={() => setRejectState({ open: false, docKey: "", versionId: "" })}
        onSubmit={handleReject}
      />
    </div>
  );
}

export default ApplicantDocumentsWorkspace;

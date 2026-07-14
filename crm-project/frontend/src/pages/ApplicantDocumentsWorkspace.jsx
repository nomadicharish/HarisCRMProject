import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import API from "../services/api";
import { getCached, invalidateCache, readCached } from "../services/cachedApi";
import "../styles/applicantDocuments.css";
import {
  getDocumentReviewState,
  getVisibleApplicantDocuments,
  getLatestVersion
} from "../constants/applicantDocuments";
import DashboardTopbar from "../components/common/DashboardTopbar";
import BlockingLoader from "../components/common/BlockingLoader";
import PageLoader from "../components/common/PageLoader";
import { getStoredUser, isSuperUserLikeRole } from "../utils/auth";
import {
  ALLOWED_DOCUMENT_ACCEPT,
  DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS,
  getAcceptForExtensions,
  getUploadHelpText,
  getValidatedDocumentFile,
  validateDocumentFile
} from "../utils/fileValidation";

const DASHBOARD_TAB_CONFIG = {
  home: { label: "Home" },
  applicants: { label: "Applicants" },
  companies: { label: "Companies" }
};

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

function UploadFileIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16.5a4 4 0 0 0-3.8-4A5.5 5.5 0 0 0 5.7 14 3.5 3.5 0 0 0 6.5 21H18a3 3 0 0 0 2-5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReferenceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function getInitials(name) {
  return String(name || "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "A";
}

function getApplicantDisplayName(applicant) {
  return applicant?.fullName || [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ").trim() || "Applicant";
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
      title: "Review submitted documents",
      actionLabel: ""
    };
  }

  if (rejectedRequired && hasRejectedSelections) {
    return {
      tone: "successSoft",
      title: "Looks like all issues are fixed, please resend for approval",
      actionLabel: "Submit for Review"
    };
  }

  if (rejectedRequired) {
    return {
      tone: "danger",
      title: "There are few issues in the document, please fix it and resend",
      actionLabel: canSendForApproval ? "Submit for Review" : ""
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
      actionLabel: "Submit for Review"
    };
  }

  if (uploadedRequired) {
    return {
      tone: "successSoft",
      title: "Looks like all issues are fixed, please resend for approval",
      actionLabel: "Submit for Review"
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

function ApproveAllConfirmModal({ open, onClose, onConfirm, loading }) {
  if (!open) return null;

  return (
    <div className="docModalOverlay">
      <div className="docModalCard" role="dialog" aria-modal="true" aria-labelledby="approve-all-confirm-title">
        <h3 id="approve-all-confirm-title">Approve all documents</h3>
        <p>This will approve all the non-rejected documents.</p>
        <div className="docModalActions">
          <button type="button" className="btn btnSecondary" disabled={loading} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btnSuccess" disabled={loading} onClick={onConfirm}>
            {loading ? "Approving..." : "Approve all"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplicantDocumentsWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const initialDocumentsPage = readCached(`/applicants/${id}/documents-page`) || null;
  const documentsPageCacheTtlMs = 120000;
  const [applicant, setApplicant] = useState(initialDocumentsPage?.applicant || null);
  const [documentConfigs, setDocumentConfigs] = useState(initialDocumentsPage?.documentConfigs || []);
  const [documents, setDocuments] = useState(initialDocumentsPage?.documents || {});
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(!initialDocumentsPage);
  const [selectedFiles, setSelectedFiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [rejectState, setRejectState] = useState({ open: false, docKey: "", versionId: "" });
  const [showApproveAllConfirm, setShowApproveAllConfirm] = useState(false);
  const documentDashboardTabs = isSuperUserLikeRole(user?.role)
    ? ["home", "applicants", "companies"]
    : user?.role === "AGENCY" || user?.role === "EMPLOYER"
    ? ["home", "applicants", "companies"]
    : user?.role === "SENIOR_ACCOUNTANT"
    ? ["home", "applicants"]
    : ["applicants"];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [documentsPageRes, userRes] = await Promise.all([
          getCached(`/applicants/${id}/documents-page`, { ttlMs: documentsPageCacheTtlMs }),
          user ? Promise.resolve(user) : getCached("/auth/me", { ttlMs: 120000 })
        ]);

        if (cancelled) return;
        setUser(userRes || null);
        setApplicant(documentsPageRes?.applicant || null);
        setDocumentConfigs(Array.isArray(documentsPageRes?.documentConfigs) ? documentsPageRes.documentConfigs : []);
        setDocuments(documentsPageRes?.documents || {});
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
  }, [documentsPageCacheTtlMs, id, user]);

  if (loading) {
    return <PageLoader label="Loading documents..." />;
  }

  if (!applicant) {
    return <div style={{ padding: "40px" }}>Applicant not found</div>;
  }

  const canReview = isSuperUserLikeRole(user?.role);
  const visibleDocs = getVisibleApplicantDocuments(applicant, documentConfigs);
  const reviewState = getDocumentReviewState(documents, applicant, documentConfigs);
  const dispatchStarted = Number(applicant.stage || 0) >= 3;
  const allRequiredApproved = Boolean(reviewState.approvedRequired);

  const requiredSelected = reviewState.requiredDocs.every((doc) => {
    const latest = reviewState.latestByType[doc.key];
    if (latest?.status === "APPROVED" || latest?.status === "PENDING") return true;
    return Boolean(selectedFiles[doc.key]?.file);
  });

  const hasAnySelection = Object.values(selectedFiles).some((entry) => Boolean(entry?.file));
  const canSendForApproval = !canReview && hasAnySelection && requiredSelected;
  const hasRejectedSelections = reviewState.requiredDocs.some(
    (doc) => reviewState.latestByType[doc.key]?.status === "REJECTED" && Boolean(selectedFiles[doc.key]?.file)
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

  const handleDocumentDownload = async (fileUrl, fileName) => {
    if (!fileUrl) return;

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Unable to download document");

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName || "document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error(error);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = fileName || "document";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };
  const applicantName = getApplicantDisplayName(applicant);
  const standardReference = applicant?.standardReferenceUrl
    ? {
        referenceUrl: applicant.standardReferenceUrl,
        referenceFileName: applicant.standardReferenceFileName || "Standard Reference"
      }
    : null;
  const pendingReviewDocs = visibleDocs
    .map((doc) => ({ doc, latest: getLatestVersion(documents?.[doc.key] || []) }))
    .filter(({ latest }) => latest?.status === "PENDING");
  const isDocumentUploadStageCompleted = Number(applicant?.stage || 1) > 2;
  const canApproveAll = canReview && !allRequiredApproved && !isDocumentUploadStageCompleted && pendingReviewDocs.length > 0;

  const handleSendForApproval = async () => {
    const uploads = Object.entries(selectedFiles)
      .map(([docKey, entry]) => [docKey, entry?.file])
      .filter(([, file]) => Boolean(file));
    if (uploads.length === 0) {
      toast.info("Select documents before sending for approval");
      return;
    }
    for (const [docKey, file] of uploads) {
      const docConfig = visibleDocs.find((doc) => doc.key === docKey);
      const fileValidation = validateDocumentFile(file, docConfig?.allowedExtensions || DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS);
      if (!fileValidation.valid) {
        toast.error(fileValidation.message);
        return;
      }
    }

    try {
      setSaving(true);
      // Keep uploads within one save sequential. The server groups the resulting
      // document events by action and agent, so this produces one notification
      // for the save instead of racing multiple notification writes.
      for (const [docKey, file] of uploads) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("documentType", docKey);
        await API.post(`/applicants/${id}/upload-document`, formData);
      }

      invalidateCache(`/applicants/${id}/documents`);
      invalidateCache(`/applicants/${id}/documents-page`);
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/applicants");

      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      navigate(`/applicants/${id}${window.location.search || ""}`);
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
      invalidateCache(`/applicants/${id}/documents-page`);
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

  const handleApproveAll = async () => {
    if (!canApproveAll) return;
    const previousDocuments = documents;
    const approvedAt = new Date().toISOString();
    setDocuments((prev) => {
      const next = { ...prev };
      pendingReviewDocs.forEach(({ doc, latest }) => {
        const versions = Array.isArray(next[doc.key]) ? [...next[doc.key]] : [];
        const idx = versions.findIndex((version) => version.id === latest.id);
        if (idx >= 0) {
          versions[idx] = {
            ...versions[idx],
            status: "APPROVED",
            rejectedReason: "",
            reviewedAt: approvedAt
          };
          next[doc.key] = versions;
        }
      });
      return next;
    });

    try {
      setSaving(true);
      await Promise.all(pendingReviewDocs.map(({ doc, latest }) =>
        API.patch(`/applicants/${id}/documents/${doc.key}/${latest.id}/approve`)
      ));
      invalidateCache(`/applicants/${id}/documents`);
      invalidateCache(`/applicants/${id}/documents-page`);
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/applicants");
      setShowApproveAllConfirm(false);
      const params = new URLSearchParams(window.location.search);
      params.set("tab", "applicants");
      navigate(`/dashboard?${params.toString()}`);
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
      invalidateCache(`/applicants/${id}/documents-page`);
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
    <div className="page-container dashboardPageContainer">
      <BlockingLoader open={saving} label="Saving document updates..." />
      <DashboardTopbar
        user={user}
        showTabs
        tabs={documentDashboardTabs.map((key) => ({
          key,
          label: DASHBOARD_TAB_CONFIG[key].label
        }))}
        activeTab="applicants"
        onTabChange={(tabKey) => {
          if (!documentDashboardTabs.includes(tabKey)) return;
          if (tabKey === "applicants") {
            const params = new URLSearchParams(window.location.search);
            params.set("tab", "applicants");
            navigate(`/dashboard?${params.toString()}`);
            return;
          }
          navigate(tabKey === "home" ? "/dashboard" : `/dashboard?tab=${encodeURIComponent(tabKey)}`);
        }}
      />
      <div className="page-content docsWorkspacePage">
        <main className="docsUploadCard">
            <div className={`docsTopBar docsTopBar-${topBar.tone}`}>
              <div className="docsTopBarContent">
                <div className="docsTopBarIcon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="docsTopBarText">
                  <div className="docsTopBarTitle">{topBar.title}</div>
                  {!canReview && !allRequiredApproved ? (
                    <div className="docsTopBarSubtitle">Request the admin for review &amp; approval to go to next phase.</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="docsApplicantSummary docsApplicantSummaryAction"
                  onClick={() => navigate(`/applicants/${id}${window.location.search || ""}`)}
                >
                  <span className="docsApplicantIcon" aria-hidden="true">
                    {applicant.profilePhotoUrl ? (
                      <img src={applicant.profilePhotoUrl} alt="" />
                    ) : (
                      <span>{getInitials(applicantName)}</span>
                    )}
                  </span>
                  <strong>{applicantName}</strong>
                </button>
              </div>
            </div>

            <div className={`docsPrepRow${canReview ? " docsPrepRowReview" : ""}`}>
              {!canReview && standardReference ? (
                <div className="docsStandardReference">
                  <a
                    className="docsStandardReferenceBtn"
                    href={standardReference.referenceUrl || standardReference.documentToFillUrl || standardReference.templateFileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DownloadIcon />
                    Standard Reference Document
                  </a>
                  <div className="docsStandardReferenceText">Kindly refer this document before preparing your documents.</div>
                </div>
              ) : null}
              {canApproveAll ? (
                <div className="docsReviewBulkActions">
                  <button
                    type="button"
                    className="btn docsApproveAllButton"
                    disabled={!canApproveAll || saving}
                  onClick={() => setShowApproveAllConfirm(true)}
                  >
                    {saving ? "Approving..." : "Approve all"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="docsTableCard">
          {visibleDocs.length > 0 ? (
            <div className={`docsRow docsTableHead${canReview ? " docsRowReview" : ""}`}>
              <div>Document</div>
              {!canReview ? <div>Document to fill</div> : null}
              {!canReview ? <div>Reference Document</div> : null}
              <div>Upload</div>
              <div>Status</div>
            </div>
          ) : null}

          {visibleDocs.length === 0 ? (
            <div className="docsHint">No company documents are configured for this applicant.</div>
          ) : null}

          {visibleDocs.map((doc) => {
            const versions = documents?.[doc.key] || [];
            const latest = getLatestVersion(versions);
            const isRejected = latest?.status === "REJECTED";
            const isPending = latest?.status === "PENDING";
            const isApproved = latest?.status === "APPROVED";
            const showReviewActions = canReview && latest?.status === "PENDING";
            const canAgentUpload = !dispatchStarted && !canReview && (!latest || latest.status === "REJECTED" || !latest.fileUrl);
            const selectedFileEntry = selectedFiles[doc.key] || null;
            const selectedFile = selectedFileEntry?.file || null;
            const fileName = getDocumentFileName(doc.key, latest, selectedFile);
            const displayFileName = canAgentUpload && isRejected && !selectedFile ? "" : fileName;
            const hasSelectedFile = Boolean(selectedFile);
            const statusLabel = hasSelectedFile
              ? "Selected"
              : isApproved
              ? "Approved"
              : latest?.status === "PENDING"
              ? canReview
                ? ""
                : "Pending Review"
              : latest?.status === "REJECTED"
              ? "Rejected"
              : dispatchStarted
              ? "Not uploaded"
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
              <div key={doc.key} className={`docsRow${canReview ? " docsRowReview" : ""} ${isRejected ? "is-rejected" : ""}`}>
                <div className="docsDocCell">
                  <div className="docsDocMeta">
                    <div className="docsDocTitle">
                      {doc.label}
                      {doc.required ? <span className="docsRequiredTag">*</span> : null}
                    </div>
                    {isRejected && latest?.rejectedReason ? (
                      <div className="docsRejectedNote">{latest.rejectedReason}</div>
                    ) : null}
                  </div>
                </div>

                {!canReview ? (
                  <div className="docsFillCell">
                    {doc.documentToFillUrl ? (
                      <a className="docsDownloadLink" href={doc.documentToFillUrl} target="_blank" rel="noreferrer">
                        <DownloadIcon />
                        Download
                      </a>
                    ) : (
                      <div className="docsReferenceEmpty">Not available</div>
                    )}
                  </div>
                ) : null}

                {!canReview ? (
                  <div className="docsReferenceCell">
                    {doc.referenceUrl ? (
                      <a className="docsReferenceLink" href={doc.referenceUrl} target="_blank" rel="noreferrer">
                        <ReferenceIcon />
                        Reference Document
                      </a>
                    ) : (
                      <div className="docsReferenceEmpty">No reference document</div>
                    )}
                  </div>
                ) : null}

                <div className="docsFileCell">
                  {canAgentUpload ? (
                    <label className="docsFileBox docsFileBoxUpload">
                      <input
                        type="file"
                        accept={doc.allowedExtensions?.length ? getAcceptForExtensions(doc.allowedExtensions) : ALLOWED_DOCUMENT_ACCEPT}
                        className="docsFileInput"
                        disabled={saving}
                        onChange={(event) => {
                          const file = getValidatedDocumentFile(
                            event.target.files?.[0] || null,
                            toast.error,
                            doc.allowedExtensions || DEFAULT_ALLOWED_DOCUMENT_EXTENSIONS
                          );
                          setSelectedFiles((prev) => ({
                            ...prev,
                            [doc.key]: file
                              ? { file, selectedAt: Date.now() }
                              : null
                          }));
                        }}
                      />
                      <div className="docsFileBoxLeft">
                        <span className="docsUploadIcon"><UploadFileIcon /></span>
                        <div>
                          <div className="docsFileName">{displayFileName || "Choose file"}</div>
                          <div className="docsFileMeta">{doc.uploadHelpText || getUploadHelpText(doc.allowedExtensions)}</div>
                        </div>
                      </div>
                    </label>
                  ) : latest?.fileUrl ? (
                    <div className="docsFileBox">
                      <div className="docsFileBoxLeft">
                        <div>
                          <div className="docsFileName">{fileName || `${doc.label}.file`}</div>
                          <div className="docsFileMeta">{isPending ? "Awaiting review" : "Latest uploaded file"}</div>
                        </div>
                      </div>
                      <div className="docsFileActions">
                        <a
                          className="docsIconAction"
                          href={latest.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${fileName || doc.label}`}
                          title="View document"
                        >
                          <ReferenceIcon />
                        </a>
                        <button
                          type="button"
                          className="docsIconAction"
                          onClick={() => handleDocumentDownload(latest.fileUrl, fileName || `${doc.label}.file`)}
                          aria-label={`Download ${fileName || doc.label}`}
                          title="Download document"
                        >
                          <DownloadIcon />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="docsFileBox docsFileBoxEmpty">
                      <div className="docsFileMeta">No file chosen</div>
                    </div>
                  )}
                </div>

                <div className="docsStatusCell">
                  {!showReviewActions ? (
                    <span className={`docsStatusBadge ${statusTone}`}>
                      {isApproved ? <StatusIcon tone="success" /> : null}
                      {isPending ? <StatusIcon tone="warning" /> : null}
                      {isRejected ? <StatusIcon tone="danger" /> : null}
                      {hasSelectedFile ? <StatusIcon tone="neutral" /> : null}
                      {statusLabel}
                    </span>
                  ) : null}


                  {showReviewActions ? (
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
            {!canReview ? (
              <div className="docsReviewFooter">
                <div className="docsFooterNote">Please refer to the reference document before uploading. All documents will be reviewed by the admin.</div>
                {topBar.actionLabel ? (
                <button
                  type="button"
                  className="btn docsTopBarButton docsBottomSubmitButton"
                  disabled={!canSendForApproval || saving}
                  onClick={handleSendForApproval}
                >
                  {saving ? "Submitting..." : topBar.actionLabel}
                </button>
                ) : null}
              </div>
            ) : null}
          </main>
      </div>

      <DocumentRejectModal
        open={rejectState.open}
        loading={saving}
        onClose={() => setRejectState({ open: false, docKey: "", versionId: "" })}
        onSubmit={handleReject}
      />
      <ApproveAllConfirmModal
        open={showApproveAllConfirm}
        loading={saving}
        onClose={() => setShowApproveAllConfirm(false)}
        onConfirm={handleApproveAll}
      />
    </div>
  );
}

export default ApplicantDocumentsWorkspace;

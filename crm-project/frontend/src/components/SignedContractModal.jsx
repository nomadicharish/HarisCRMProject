import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
import { ALLOWED_DOCUMENT_ACCEPT, validateDocumentFile } from "../utils/fileValidation";
import { isSuperUserLikeRole } from "../utils/auth";
import "../styles/applicantContract.css";

const ACCEPTED_FILE_TYPES = ALLOWED_DOCUMENT_ACCEPT;
const MAX_SIGNED_DOCUMENT_BYTES = 5 * 1024 * 1024;

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getDefaultDocuments(signedContract = null) {
  const defaults = [
    { id: "signed-contract", label: "Signed Contract", required: true, status: "PENDING" },
    { id: "additional-1", label: "Additional Signed Document 1", required: false, status: "PENDING" },
    { id: "additional-2", label: "Additional Signed Document 2", required: false, status: "PENDING" },
    { id: "additional-3", label: "Additional Signed Document 3", required: false, status: "PENDING" }
  ];

  if (Array.isArray(signedContract?.documents)) {
    return defaults.map((item) => ({
      ...item,
      ...(signedContract.documents.find((document) => document.id === item.id) || {})
    }));
  }

  if (signedContract?.fileUrl) {
    defaults[0] = {
      ...defaults[0],
      name: signedContract.name || "Signed Contract",
      fileUrl: signedContract.fileUrl,
      uploadedAt: signedContract.uploadedAt,
      status: "UPLOADED"
    };
  }

  return defaults;
}

function DocumentIcon() {
  return (
    <span className="signedDocIcon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 3v4h4M10 13h4M10 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function UploadIcon() {
  return (
    <span className="workflowUploadBoxIcon" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SignedContractModal({ applicantId, user, fallbackSignedContract, open, onClose, onUpdated }) {
  const [signedContract, setSignedContract] = useState(fallbackSignedContract || null);
  const [filesById, setFilesById] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rejectingId, setRejectingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const documents = useMemo(() => getDefaultDocuments(signedContract), [signedContract]);
  const mandatoryDocument = documents[0];
  const additionalDocuments = documents.slice(1);
  const rejectedCount = documents.filter((document) => document.status === "REJECTED").length;
  const hasAnyUploaded = documents.some((document) => document.fileUrl || document.status === "REJECTED");
  const isAgent = user?.role === "AGENCY";
  const isSuperUser = isSuperUserLikeRole(user?.role);
  const canSubmit = isAgent && Object.keys(filesById).some((id) => filesById[id]);

  const loadSignedContract = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      const res = await API.get(`/applicants/${applicantId}/signed-contract`);
      setSignedContract(res.data || null);
    } catch (error) {
      console.error(error);
      setErrorMessage(error?.response?.data?.message || "Failed to load signed documents");
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (open && applicantId) {
      setFilesById({});
      setErrorMessage("");
      loadSignedContract();
    }
  }, [open, applicantId, loadSignedContract]);

  const updateFile = (documentId, file) => {
    setErrorMessage("");
    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.message);
      return;
    }
    if (file && file.size > MAX_SIGNED_DOCUMENT_BYTES) {
      setErrorMessage("Signed documents must be 5 MB or smaller");
      return;
    }

    setFilesById((prev) => ({
      ...prev,
      [documentId]: file || null
    }));
  };

  const handleUpload = async () => {
    const mainFile = filesById["signed-contract"];
    const requiresMain = !mandatoryDocument?.fileUrl || mandatoryDocument?.status === "REJECTED";
    const invalidFile = Object.values(filesById).filter(Boolean).find((file) => !validateDocumentFile(file).valid);
    if (invalidFile) {
      setErrorMessage(validateDocumentFile(invalidFile).message);
      return;
    }
    if (requiresMain && !mainFile) {
      setErrorMessage("Select signed contract file");
      return;
    }

    try {
      setErrorMessage("");
      setSaving(true);
      const formData = new FormData();
      if (mainFile) formData.append("file", mainFile);
      additionalDocuments.forEach((document) => {
        if (filesById[document.id]) formData.append("additionalDocuments", filesById[document.id]);
      });
      await API.post(`/applicants/${applicantId}/signed-contract`, formData);
      setFilesById({});
      if (typeof onUpdated === "function") onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      setErrorMessage(error?.response?.data?.message || "Failed to upload signed documents");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (documentId) => {
    try {
      setErrorMessage("");
      setRejectingId(documentId);
      await API.patch(`/applicants/${applicantId}/signed-contract/${documentId}/reject`);
      const rejectedAt = Date.now();
      setSignedContract((prev) => {
        const nextDocuments = getDefaultDocuments(prev).map((document) =>
          document.id === documentId
            ? {
                ...document,
                rejectedFileUrl: document.fileUrl || document.rejectedFileUrl || "",
                fileUrl: "",
                status: "REJECTED",
                rejectedAt
              }
            : document
        );
        const activeMainDocument = nextDocuments[0]?.status === "UPLOADED" ? nextDocuments[0] : null;
        return {
          ...(prev || {}),
          fileUrl: activeMainDocument?.fileUrl || "",
          name: activeMainDocument?.name || nextDocuments[0]?.name || "",
          documents: nextDocuments,
          status: "REJECTED",
          rejectedAt,
          rejectedDocumentCount: nextDocuments.filter((document) => document.status === "REJECTED").length
        };
      });
      if (typeof onUpdated === "function") onUpdated();
    } catch (error) {
      console.error(error);
      setErrorMessage(error?.response?.data?.message || "Failed to reject signed document");
    } finally {
      setRejectingId("");
    }
  };

  const renderUploadBox = (document, placeholder) => {
    if (!isAgent) return null;
    if (document.fileUrl && document.status !== "REJECTED") return null;

    const inputId = `signed-contract-${document.id}`;
    const selectedFile = filesById[document.id];
    const isRejected = document.status === "REJECTED";
    return (
      <div className="signedDocUploadShell">
        <label
          className={`workflowUploadBox workflowUploadBoxFull signedDocUploadBox${isRejected ? " signedDocUploadBoxRejected" : ""}`}
          htmlFor={inputId}
        >
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="contractFileInput"
            disabled={saving}
            onChange={(event) => updateFile(document.id, event.target.files?.[0] || null)}
          />
          {selectedFile ? <DocumentIcon /> : <UploadIcon />}
        <span className="workflowUploadBoxText">
          <span className="workflowUploadBoxTitle">{selectedFile?.name || placeholder}</span>
          {isRejected ? <span className="signedDocRejectedInline">Admin rejected the previous document</span> : null}
          <span className="workflowUploadBoxMeta">PDF, PNG, JPEG or JPG (Max 5 MB)</span>
        </span>
        </label>
      </div>
    );
  };

  const renderDocumentRow = (document) => {
    const isRejected = document.status === "REJECTED";
    if (isAgent && isRejected) return null;
    if (!document.fileUrl && !isRejected) return null;

    return (
      <div className={`signedDocRow${isRejected ? " signedDocRowRejected" : ""}`} key={document.id}>
        <DocumentIcon />
        <div className="signedDocDetails">
          <span className={`signedDocName${!document.fileUrl ? " signedDocNameDisabled" : ""}`}>
            {document.name || document.label}
          </span>
          <span className="signedDocMeta">
            {isRejected ? "Rejected by Super User" : "Uploaded"} - {formatDate(isRejected ? document.rejectedAt : document.uploadedAt)}
          </span>
        </div>
        {document.fileUrl ? (
          <a href={document.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn signedDocViewBtn">
            View
          </a>
        ) : null}
        {isRejected ? <span className="signedDocBadge">Rejected</span> : null}
        {isSuperUser && document.fileUrl && !isRejected ? (
          <button
            type="button"
            className="signedDocRejectBtn"
            disabled={Boolean(rejectingId)}
            onClick={() => handleReject(document.id)}
          >
            {rejectingId === document.id ? "Rejecting..." : "Reject"}
          </button>
        ) : null}
      </div>
    );
  };

  if (!open) return null;

  const title = isSuperUser && hasAnyUploaded ? "Review Signed Documents" : hasAnyUploaded ? "Signed Documents" : "Upload Signed Documents";

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard workflowModalCard signedContractModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={saving} label="Uploading signed documents..." />
        <div className="workflowModalHero">
          <UploadIcon />
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">{title}</h3>
            <div className="workflowModalSubtitle">
              {isSuperUser && hasAnyUploaded
                ? "Review the uploaded documents. You can reject documents if they are incorrect."
                : hasAnyUploaded
                ? "These are the signed documents uploaded for this candidate."
                : "Upload the signed contract received from the applicant."}
            </div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose} disabled={saving || Boolean(rejectingId)}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading signed documents...</div>
          </div>
        ) : (
          <>
            <div className="workflowModalBody signedContractBody">
              {errorMessage ? <div className="signedDocError">{errorMessage}</div> : null}
              {rejectedCount ? (
                <div className="signedDocAlert">
                  <strong>Some documents were rejected by the Super User.</strong>
                  <span>Please upload the correct documents before continuing.</span>
                </div>
              ) : null}

              <section className="signedDocSection">
                <div className="signedDocSectionHeader">
                  <h4>Signed Contract <span>(Mandatory)</span></h4>
                </div>
                {renderDocumentRow(mandatoryDocument)}
                {renderUploadBox(mandatoryDocument, mandatoryDocument?.status === "REJECTED" ? "Upload new signed contract" : "Choose document")}
              </section>

              <section className="signedDocSection">
                <div className="signedDocSectionHeader">
                  <h4>Additional Signed Documents <span>(Optional)</span></h4>
                </div>
                {additionalDocuments.map((document, index) => (
                  <React.Fragment key={document.id}>
                    {renderDocumentRow(document)}
                    {renderUploadBox(
                      document,
                      document.status === "REJECTED"
                        ? `Upload new document ${index + 1} (Optional)`
                        : `Choose document ${index + 1} (Optional)`
                    )}
                  </React.Fragment>
                ))}
              </section>

              {hasAnyUploaded && !isSuperUser && !rejectedCount ? (
                <div className="workflowInfoNotice signedDocNotice">
                  Uploaded documents are final. Contact a Super User if any document needs to be updated.
                </div>
              ) : null}
            </div>

            <div className="workflowModalFooter">
              <button type="button" className="btn btnSecondary" onClick={onClose} disabled={saving || Boolean(rejectingId)}>
                {isAgent && canSubmit ? "Cancel" : "Close"}
              </button>
              {isAgent ? (
                <button type="button" className="btn btnPrimary" disabled={saving || !canSubmit} onClick={handleUpload}>
                  {saving ? "Uploading..." : "Upload Documents"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SignedContractModal;

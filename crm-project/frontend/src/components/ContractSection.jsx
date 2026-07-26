import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../utils/toast";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
import WorkflowPaymentStatus from "./WorkflowPaymentStatus";
import { ALLOWED_DOCUMENT_ACCEPT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
import { isSuperUserLikeRole } from "../utils/auth";
import "../styles/applicantContract.css";

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

function formatFileSize(file) {
  if (!file?.size) return "";
  if (file.size < 1024 * 1024) return `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 3v4h4M10 13h4M10 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadFileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16.5a4 4 0 0 0-3.8-4A5.5 5.5 0 0 0 5.7 14 3.5 3.5 0 0 0 6.5 21H18a3 3 0 0 0 2-5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ContractSection({ applicantId, user, applicant, open, onClose, onUpdated }) {
  const [contract, setContract] = useState(null);
  const [file, setFile] = useState(null);
  const [additionalFiles, setAdditionalFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isSuperUser = isSuperUserLikeRole(user?.role);
  const canUpload =
    (isSuperUser || user?.role === "EMPLOYER") &&
    !contract?.fileUrl &&
    contract?.status !== "APPROVED";
  const canApprove = isSuperUser && contract?.status === "PENDING";

  const loadContract = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/applicants/${applicantId}/contract`);
      setContract(res.data);
    } catch (error) {
      console.error(error);
      setContract(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (open && applicantId) {
      loadContract();
    }
  }, [open, applicantId, loadContract]);

  const title = useMemo(() => {
    if (canApprove || contract?.status === "APPROVED") return "Issued Contract";
    return "Issue of the Contract";
  }, [canApprove, contract?.status]);

  const handleUploadContract = async () => {
    if (!file) {
      toast.error("Select contract file");
      return;
    }
    const fileValidation = validateDocumentFiles([file, ...additionalFiles]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", file);
      additionalFiles.slice(0, 3).forEach((additionalFile) => {
        formData.append("additionalDocuments", additionalFile);
      });
      await API.post(`/applicants/${applicantId}/contract`, formData);
      setFile(null);
      setAdditionalFiles([]);
      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to upload contract");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveContract = async () => {
    try {
      setSaving(true);
      await API.patch(`/applicants/${applicantId}/contract/approve`);
      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to approve contract");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard workflowModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={saving} label="Saving contract details..." />
        <div className="workflowModalHero">
          <div className="workflowModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 12h6M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">{title}</h3>
            <div className="workflowModalSubtitle">
              {contract?.fileUrl ? "View the issued contract details below." : "Upload and manage the candidate contract."}
            </div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading contract details...</div>
          </div>
        ) : (
          <>
            {contract?.fileUrl ? (
              <div className="workflowModalBody">
                <div className="workflowDetailCard workflowDetailCardFlat">
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                      <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      Contract
                    </span>
                    <span className="workflowDetailActions">
                      <a href={contract.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                        View
                      </a>
                      <a href={contract.fileUrl} download className="workflowFileActionBtn">Download</a>
                    </span>
                  </div>
                  {Array.isArray(contract.additionalDocuments) && contract.additionalDocuments.length ? (
                    <div className="workflowDetailRow">
                      <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                        <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path d="M7 3h8l4 4v14H7zM15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        Additional Documents
                      </span>
                      <span className="workflowDetailRowValue workflowAdditionalDocLinks">
                        {contract.additionalDocuments.map((document, index) => (
                          <span key={document.fileUrl || index} className="workflowDetailActions">
                            <a href={document.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">{document.name || `Document ${index + 1}`}</a>
                            <a href={document.fileUrl} download className="workflowDetailAction">Download</a>
                          </span>
                        ))}
                      </span>
                    </div>
                  ) : null}
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                      <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </span>
                      Date of Issue
                    </span>
                    <span className="workflowDetailRowValue">{formatDate(contract.issuedAt || contract.uploadedAt)}</span>
                  </div>
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                      <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </span>
                      Uploaded By
                    </span>
                    <span className="workflowDetailRowValue">{contract.uploadedByName || contract.uploadedByRole || "-"}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="workflowModalBody">
                <div className="contractUploadPanel">
                <div className="contractUploadHeading">
                  <h4>Contract File</h4>
                  <p>Upload the main contract document.</p>
                </div>
                <label className="contractFileCard contractFileCardWide" htmlFor="contract-file">
                  <input
                    id="contract-file"
                    type="file"
                    accept={ALLOWED_DOCUMENT_ACCEPT}
                    className="contractFileInput"
                    disabled={saving}
                    onChange={(event) => setFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                  />
                  <span className="contractUploadTileIcon"><DocumentIcon /></span>
                  <span className="contractUploadText">
                    <span className="contractFileCardTitle">{file?.name || "Choose contract"}</span>
                    <span className="contractFileCardMeta">{file ? formatFileSize(file) : "PDF, PNG, JPEG or JPG (Max 5 MB)"}</span>
                  </span>
                </label>

                <div className="workflowAdditionalUploadGroup">
                  <div className="contractUploadHeading">
                    <h4>Additional Documents <span>(Optional)</span></h4>
                    <p>Upload any supporting documents if required. You can upload up to 3 files.</p>
                  </div>
                  {[0, 1, 2].map((index) => (
                    <label className="workflowUploadBox workflowUploadBoxFull" htmlFor={`contract-additional-${index}`} key={index}>
                      <input
                        id={`contract-additional-${index}`}
                        type="file"
                        accept={ALLOWED_DOCUMENT_ACCEPT}
                        className="contractFileInput"
                        disabled={saving}
                        onChange={(event) => {
                          const nextFile = getValidatedDocumentFile(event.target.files?.[0] || null, toast.error);
                          setAdditionalFiles((prev) => {
                            const next = [...prev];
                            if (nextFile) next[index] = nextFile;
                            return next.filter(Boolean);
                          });
                        }}
                      />
                      <span className="workflowUploadBoxIcon" aria-hidden="true">
                        <UploadFileIcon />
                      </span>
                      <span className="workflowUploadBoxText">
                        <span className="workflowUploadBoxTitle">{additionalFiles[index]?.name || "Choose document"}</span>
                        <span className="workflowUploadBoxMeta">{additionalFiles[index] ? formatFileSize(additionalFiles[index]) : "PDF, PNG, JPEG or JPG (Max 5 MB)"}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="contractActionRow">
                  <button
                    type="button"
                    className="btn btnPrimary"
                    disabled={saving || !file}
                    onClick={handleUploadContract}
                  >
                    {saving ? "Saving..." : "Upload Contract"}
                  </button>
                </div>
              </div>
              </div>
            ) : null}

            {canApprove ? (
              <>
              <div className="workflowModalBody">
                <WorkflowPaymentStatus applicant={applicant} requiredPercent={20} user={user} />
              </div>
              <div className="workflowModalFooter">
                <button
                  type="button"
                  className="btn btnSuccess"
                  disabled={saving}
                  onClick={handleApproveContract}
                >
                  {saving ? "Saving..." : "Approve Contract"}
                </button>
              </div>
              </>
            ) : null}
            {!canApprove ? (
              <div className="workflowModalFooter">
                <button type="button" className="btn btnSecondary" onClick={onClose}>
                  Close
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default ContractSection;

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../utils/toast";
import API from "../services/api";
import { getApiErrorMessage } from "../utils/apiError";
import BlockingLoader from "./common/BlockingLoader";
import { ALLOWED_DOCUMENT_ACCEPT, DOCUMENT_UPLOAD_HELP_TEXT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
import { hasRight } from "../utils/rights";
import "../styles/applicantContract.css";

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "object" && value._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDateTime(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return "-";
  return new Date(normalized).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function ResidencePermitModal({ applicantId, user, fallbackResidencePermit, open, onClose, onUpdated }) {
  const [residencePermit, setResidencePermit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trpFile, setTrpFile] = useState(null);

  const resolvedResidencePermit = useMemo(
    () => residencePermit || fallbackResidencePermit || null,
    [residencePermit, fallbackResidencePermit]
  );
  const canUpload = hasRight(user, "UPLOAD_TRC");

  const loadResidencePermit = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/applicants/${applicantId}/residence-permit`);
      setResidencePermit(res.data || null);
    } catch (error) {
      console.error(error);
      setResidencePermit(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (open && applicantId) {
      loadResidencePermit();
      setTrpFile(null);
    }
  }, [open, applicantId, loadResidencePermit]);

  const uploadSelectedFiles = async () => {
    if (!trpFile) {
      toast.error("Please select TRC document");
      return;
    }
    const fileValidation = validateDocumentFiles([trpFile]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", trpFile);
      formData.append("type", "TRP");
      await API.post(`/applicants/${applicantId}/residence-permit`, formData);

      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(getApiErrorMessage(error, "Failed to upload residence permit"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard workflowModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={saving} label="Uploading residence permit..." />
        <div className="workflowModalHero">
          <div className="workflowModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.5 14.5a1.5 1.5 0 1 1 3 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M9.5 18a2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">TRC Document</h3>
            <div className="workflowModalSubtitle">Upload and view the TRC document below.</div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose} disabled={saving}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading residence permit details...</div>
          </div>
        ) : (
          <>
            {resolvedResidencePermit ? (
              <div className="workflowModalBody">
              <div className="workflowDetailCard workflowDetailCardFlat">
                {resolvedResidencePermit.trpUrl || resolvedResidencePermit.fileUrl ? (
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                      <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      TRC Document
                    </span>
                    <a href={resolvedResidencePermit.trpUrl || resolvedResidencePermit.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                      View
                    </a>
                  </div>
                ) : null}
                {resolvedResidencePermit.frontUrl ? (
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                      <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      Front Side
                    </span>
                    <a href={resolvedResidencePermit.frontUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                      View
                    </a>
                  </div>
                ) : null}
                {resolvedResidencePermit.backUrl ? (
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                      <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      Back Side
                    </span>
                    <a href={resolvedResidencePermit.backUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                      View
                    </a>
                  </div>
                ) : null}
                {resolvedResidencePermit.frontUrl || resolvedResidencePermit.backUrl ? (
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel workflowDetailRowLabelWithIcon">
                      <span className="workflowDetailHeaderIcon workflowDetailInlineIcon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </span>
                      Uploaded On
                    </span>
                    <span className="workflowDetailRowValue">{formatDateTime(resolvedResidencePermit.uploadedAt)}</span>
                  </div>
                ) : null}
              </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="workflowModalBody">
                <div className="workflowDetailCard workflowTicketUploadCard">
                  <div className="workflowDetailHeader">
                    <span className="workflowDetailHeaderIcon" aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>Upload TRC Document</span>
                  </div>

                  <div className="workflowDetailBody workflowTicketUploadBody">
                    <label className="workflowUploadBox workflowUploadBoxFull" htmlFor="trp-document-file">
                      <input
                        id="trp-document-file"
                        type="file"
                        accept={ALLOWED_DOCUMENT_ACCEPT}
                        className="contractFileInput"
                        disabled={saving}
                        onChange={(event) => setTrpFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                      />
                      <span className="workflowUploadBoxIcon" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="workflowUploadBoxText">
                        <span className="workflowUploadBoxTitle">Choose file</span>
                        <span className="workflowUploadBoxName">{trpFile ? trpFile.name : "No file chosen"}</span>
                        <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="workflowModalFooter">
                <button type="button" className="btn btnPrimary" disabled={saving} onClick={uploadSelectedFiles}>
                  {saving ? "Uploading..." : resolvedResidencePermit?.trpUrl || resolvedResidencePermit?.fileUrl ? "Update TRC Document" : "Upload TRC Document"}
                </button>
              </div>
            ) : null}
            {!canUpload ? (
              <div className="workflowModalFooter">
                <button type="button" className="btn btnSecondary" onClick={onClose} disabled={saving}>
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

export default ResidencePermitModal;

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../utils/toast";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
import { ALLOWED_DOCUMENT_ACCEPT, DOCUMENT_UPLOAD_HELP_TEXT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
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
  const date = new Date(normalized);
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function DetailCard({ title, icon, children }) {
  return (
    <div className="workflowDetailCard">
      <div className="workflowDetailHeader">
        <span className="workflowDetailHeaderIcon" aria-hidden="true">
          {icon}
        </span>
        <span>{title}</span>
      </div>
      <div className="workflowDetailBody">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, action }) {
  return (
    <div className="workflowDetailRow">
      <span className="workflowDetailRowLabel">{label}</span>
      <span className="workflowDetailRowValue">{action || value}</span>
    </div>
  );
}

function UploadFileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InterviewBiometricModal({ applicantId, user, fallbackInterviewBiometric, open, onClose, onUpdated }) {
  const [interviewBiometric, setInterviewBiometric] = useState(null);
  const [embassyInterview, setEmbassyInterview] = useState(null);
  const [interviewTicket, setInterviewTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);

  const resolvedInterviewBiometric = useMemo(
    () => interviewBiometric || fallbackInterviewBiometric || null,
    [interviewBiometric, fallbackInterviewBiometric]
  );
  const canUpload = user?.role === "AGENCY" && !resolvedInterviewBiometric?.fileUrl;

  const loadInterviewBiometric = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/applicants/${applicantId}/interview-workflow`);
      setEmbassyInterview(res.data?.embassyInterview || null);
      setInterviewTicket(res.data?.interviewTicket || null);
      setInterviewBiometric(res.data?.interviewBiometric || null);
    } catch (error) {
      console.error(error);
      setInterviewBiometric(null);
      setEmbassyInterview(null);
      setInterviewTicket(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (open && applicantId) {
      loadInterviewBiometric();
      setFile(null);
    }
  }, [open, applicantId, loadInterviewBiometric]);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select interview biometric slip");
      return;
    }
    const fileValidation = validateDocumentFiles([file]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", file);
      await API.post(`/applicants/${applicantId}/interview-biometric`, formData);

      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to upload interview biometric slip");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard workflowModalCard workflowEntryModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={saving} label="Uploading biometric slip..." />

        <div className="workflowModalHero">
          <div className="workflowModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 3a4 4 0 0 0-4 4v2m8-2V7a4 4 0 0 0-8 0m-1 6v3m3-7v7m4-9v11m3-9v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">Interview Biometric Details</h3>
            <div className="workflowModalSubtitle">Review interview, travel and biometric slip details.</div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose} disabled={saving}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading biometric slip details...</div>
          </div>
        ) : (
          <>
            {resolvedInterviewBiometric?.fileUrl ? (
              <div className="workflowModalBody">
                <div className="workflowDetailStack">
                  {embassyInterview?.dateTime ? (
                    <DetailCard
                      title="Interview Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="M4 7h16M7 3v4m10-4v4M6 21h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Interview Date & Time" value={String(embassyInterview.dateTime)} />
                    </DetailCard>
                  ) : null}

                  {interviewTicket ? (
                    <DetailCard
                      title="Travel Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Travel Date" value={String(interviewTicket.date || "-")} />
                      <DetailRow label="Travel Time" value={String(interviewTicket.time || "-")} />
                    </DetailCard>
                  ) : null}

                  <DetailCard
                    title="Biometric Slip"
                    icon={(
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M12 3a4 4 0 0 0-4 4v2m8-2V7a4 4 0 0 0-8 0m-1 6v3m3-7v7m4-9v11m3-9v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    )}
                  >
                    <DetailRow
                      label="Biometric Slip"
                      action={(
                        <span className="workflowDetailActions">
                          <a href={resolvedInterviewBiometric.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">View document</a>
                          <a href={resolvedInterviewBiometric.fileUrl} download className="workflowDetailAction">Download</a>
                        </span>
                      )}
                    />
                    <DetailRow label="Uploaded On" value={formatDateTime(resolvedInterviewBiometric.uploadedAt)} />
                  </DetailCard>
                </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="workflowModalBody">
              <div className="contractUploadPanel workflowEntryPanel workflowEntryPanelNoBorder">
                <div className="contractUploadLabel">Biometric Slip</div>
                <label className="workflowUploadBox workflowUploadBoxFull" htmlFor="interview-biometric-slip-file">
                  <input
                    id="interview-biometric-slip-file"
                    type="file"
                    accept={ALLOWED_DOCUMENT_ACCEPT}
                    className="contractFileInput"
                    disabled={saving}
                    onChange={(event) => setFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                  />
                  <span className="workflowUploadBoxIcon" aria-hidden="true"><UploadFileIcon /></span>
                  <span className="workflowUploadBoxText">
                    <span className="workflowUploadBoxTitle">Choose file</span>
                    <span className="workflowUploadBoxName">{file ? file.name : "No file chosen"}</span>
                    <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                  </span>
                </label>

                <div className="contractActionRow">
                  <button type="button" className="btn btnPrimary" disabled={saving} onClick={handleUpload}>
                    {saving ? "Uploading..." : "Upload Biometric Slip"}
                  </button>
                </div>
              </div>
              </div>
            ) : null}

            <div className="workflowModalFooter">
              <button type="button" className="btn btnSecondary" onClick={onClose} disabled={saving}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default InterviewBiometricModal;

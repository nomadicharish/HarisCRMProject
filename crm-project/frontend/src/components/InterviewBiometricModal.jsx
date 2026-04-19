import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
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
      <div className="contractModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={saving} label="Uploading biometric slip..." />

        <div className="dashboardModalHeader">
          <h3 className="dashboardModalTitle">Add Biometric slip</h3>
          <button type="button" className="dashboardModalCloseBtn" onClick={onClose} disabled={saving}>
            x
          </button>
        </div>

        {loading ? (
          <div className="contractInfoRow">Loading biometric slip details...</div>
        ) : (
          <>
            {resolvedInterviewBiometric?.fileUrl ? (
              <div className="contractInfoCard">
                {embassyInterview?.dateTime ? (
                  <div className="contractInfoRow">
                    <span>Interview DateTime</span>
                    <span>{String(embassyInterview.dateTime)}</span>
                  </div>
                ) : null}
                {interviewTicket ? (
                  <>
                    <div className="contractInfoRow">
                      <span>Travel Date</span>
                      <span>{String(interviewTicket.date || "-")}</span>
                    </div>
                    <div className="contractInfoRow">
                      <span>Travel Time</span>
                      <span>{String(interviewTicket.time || "-")}</span>
                    </div>
                  </>
                ) : null}
                <div className="contractInfoRow">
                  <span>Biometric Slip</span>
                  <a href={resolvedInterviewBiometric.fileUrl} target="_blank" rel="noreferrer" className="linkBtn">
                    View document
                  </a>
                </div>
                <div className="contractInfoRow">
                  <span>Uploaded On</span>
                  <span>{formatDateTime(resolvedInterviewBiometric.uploadedAt)}</span>
                </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="contractUploadPanel">
                <div className="contractUploadLabel">Biometric Slip</div>
                <label className="contractFileCard" htmlFor="interview-biometric-slip-file">
                  <input
                    id="interview-biometric-slip-file"
                    type="file"
                    className="contractFileInput"
                    disabled={saving}
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                  <span className="contractFileCardTitle">{file ? file.name : "Upload biometric slip"}</span>
                </label>

                <div className="contractActionRow">
                  <button type="button" className="btn btnPrimary" disabled={saving} onClick={handleUpload}>
                    {saving ? "Uploading..." : "Upload Biometric Slip"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default InterviewBiometricModal;

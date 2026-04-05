import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import API from "../services/api";
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

function BiometricSlipModal({ applicantId, user, fallbackBiometricSlip, open, onClose, onUpdated }) {
  const [biometricSlip, setBiometricSlip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);

  const resolvedBiometricSlip = useMemo(
    () => biometricSlip || fallbackBiometricSlip || null,
    [biometricSlip, fallbackBiometricSlip]
  );
  const canUpload = user?.role === "AGENCY" && !resolvedBiometricSlip?.fileUrl;
  const title = resolvedBiometricSlip?.fileUrl ? "Biometric slip Details" : "Add Biometric slip";

  const loadBiometricSlip = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/applicants/${applicantId}/biometric`);
      setBiometricSlip(res.data || null);
    } catch (error) {
      console.error(error);
      setBiometricSlip(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (open && applicantId) {
      loadBiometricSlip();
      setFile(null);
    }
  }, [open, applicantId, loadBiometricSlip]);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select biometric slip");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", file);
      await API.post(`/applicants/${applicantId}/biometric`, formData);

      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to upload biometric slip");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard">
        <div className="workflowModalTopBar">
          <div className="workflowModalTopBarTitle">{title}</div>
          <button type="button" className="workflowModalCloseBtn" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="contractInfoRow">Loading biometric slip details...</div>
        ) : (
          <>
            {resolvedBiometricSlip?.fileUrl ? (
              <div className="contractInfoCard">
                <div className="contractInfoRow">
                  <span>Biometric Slip</span>
                  <a href={resolvedBiometricSlip.fileUrl} target="_blank" rel="noreferrer" className="linkBtn">
                    View document
                  </a>
                </div>
                <div className="contractInfoRow">
                  <span>Uploaded On</span>
                  <span>{formatDateTime(resolvedBiometricSlip.uploadedAt)}</span>
                </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="contractUploadPanel">
                <div className="contractUploadLabel">Biometric Slip</div>
                <label className="contractFileCard" htmlFor="biometric-slip-file">
                  <input
                    id="biometric-slip-file"
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

export default BiometricSlipModal;

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

function BiometricSlipModal({ applicantId, user, fallbackBiometricSlip, open, onClose, onUpdated }) {
  const [biometricSlip, setBiometricSlip] = useState(null);
  const [embassyAppointment, setEmbassyAppointment] = useState(null);
  const [travelDetails, setTravelDetails] = useState(null);
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
      const res = await API.get(`/applicants/${applicantId}/embassy-workflow`);
      setBiometricSlip(res.data?.biometricSlip || null);
      setEmbassyAppointment(res.data?.embassyAppointment || null);
      setTravelDetails(res.data?.travelDetails || null);
    } catch (error) {
      console.error(error);
      setBiometricSlip(null);
      setEmbassyAppointment(null);
      setTravelDetails(null);
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
      <div className="contractModalCard workflowModalCard workflowEntryModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={saving} label="Uploading biometric slip..." />

        <div className="workflowModalHero">
          <div className="workflowModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 3a4 4 0 0 0-4 4v2m8-2V7a4 4 0 0 0-8 0m-1 6v3m3-7v7m4-9v11m3-9v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">{title}</h3>
            <div className="workflowModalSubtitle">View appointment, travel and biometric document details.</div>
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
            {resolvedBiometricSlip?.fileUrl ? (
              <div className="workflowModalBody">
                <div className="workflowDetailStack">
                  {embassyAppointment ? (
                    <DetailCard
                      title="Appointment Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Appointment Date" value={String(embassyAppointment.date || embassyAppointment.dateTime || "-")} />
                      <DetailRow label="Appointment Time" value={String(embassyAppointment.time || "-")} />
                    </DetailCard>
                  ) : null}

                  {travelDetails ? (
                    <DetailCard
                      title="Travel Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Travel Date" value={String(travelDetails.travelDate || "-")} />
                      <DetailRow label="Travel Time" value={String(travelDetails.time || "-")} />
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
                        <a href={resolvedBiometricSlip.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">
                          View document
                        </a>
                      )}
                    />
                    <DetailRow label="Uploaded On" value={formatDateTime(resolvedBiometricSlip.uploadedAt)} />
                  </DetailCard>
                </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="workflowModalBody">
              <div className="contractUploadPanel workflowEntryPanel workflowEntryPanelNoBorder">
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

export default BiometricSlipModal;

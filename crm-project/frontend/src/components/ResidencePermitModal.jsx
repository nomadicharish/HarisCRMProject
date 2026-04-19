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
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);

  const resolvedResidencePermit = useMemo(
    () => residencePermit || fallbackResidencePermit || null,
    [residencePermit, fallbackResidencePermit]
  );
  const canUpload = user?.role === "AGENCY";

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
      setFrontFile(null);
      setBackFile(null);
    }
  }, [open, applicantId, loadResidencePermit]);

  const uploadSelectedFiles = async () => {
    const needsFront = !resolvedResidencePermit?.frontUrl;
    const needsBack = !resolvedResidencePermit?.backUrl;

    if (needsFront && !frontFile) {
      toast.error("Please select front side document");
      return;
    }

    if (needsBack && !backFile) {
      toast.error("Please select back side document");
      return;
    }

    try {
      setSaving(true);
      const uploads = [];

      if (needsFront && frontFile) {
        const frontFormData = new FormData();
        frontFormData.append("file", frontFile);
        frontFormData.append("type", "FRONT");
        uploads.push(API.post(`/applicants/${applicantId}/residence-permit`, frontFormData));
      }

      if (needsBack && backFile) {
        const backFormData = new FormData();
        backFormData.append("file", backFile);
        backFormData.append("type", "BACK");
        uploads.push(API.post(`/applicants/${applicantId}/residence-permit`, backFormData));
      }

      await Promise.all(uploads);

      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to upload residence permit");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard">
        <div className="workflowModalTopBar">
          <div className="workflowModalTopBarTitle">Residence Permit</div>
          <button type="button" className="workflowModalCloseBtn" onClick={onClose} disabled={saving}>
            x
          </button>
        </div>

        {loading ? (
          <div className="contractInfoRow">Loading residence permit details...</div>
        ) : (
          <>
            {resolvedResidencePermit ? (
              <div className="contractInfoCard">
                {resolvedResidencePermit.frontUrl ? (
                  <div className="contractInfoRow">
                    <span>Front Side</span>
                    <a href={resolvedResidencePermit.frontUrl} target="_blank" rel="noreferrer" className="linkBtn">
                      View document
                    </a>
                  </div>
                ) : null}
                {resolvedResidencePermit.backUrl ? (
                  <div className="contractInfoRow">
                    <span>Back Side</span>
                    <a href={resolvedResidencePermit.backUrl} target="_blank" rel="noreferrer" className="linkBtn">
                      View document
                    </a>
                  </div>
                ) : null}
                {resolvedResidencePermit.frontUrl || resolvedResidencePermit.backUrl ? (
                  <div className="contractInfoRow">
                    <span>Uploaded On</span>
                    <span>{formatDateTime(resolvedResidencePermit.uploadedAt)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {canUpload && (!resolvedResidencePermit?.frontUrl || !resolvedResidencePermit?.backUrl) ? (
              <div className="contractUploadPanel">
                <div className="contractFormGrid">
                  {!resolvedResidencePermit?.frontUrl ? (
                    <div className="input-field">
                      <label className="contractFileCard" htmlFor="residence-front-file">
                        <input
                          id="residence-front-file"
                          type="file"
                          className="contractFileInput"
                          disabled={saving}
                          onChange={(event) => setFrontFile(event.target.files?.[0] || null)}
                        />
                        <span className="contractFileCardTitle">{frontFile ? frontFile.name : "Front side"}</span>
                      </label>
                    </div>
                  ) : null}

                  {!resolvedResidencePermit?.backUrl ? (
                    <div className="input-field">
                      <label className="contractFileCard" htmlFor="residence-back-file">
                        <input
                          id="residence-back-file"
                          type="file"
                          className="contractFileInput"
                          disabled={saving}
                          onChange={(event) => setBackFile(event.target.files?.[0] || null)}
                        />
                        <span className="contractFileCardTitle">{backFile ? backFile.name : "Back side"}</span>
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {canUpload && (!resolvedResidencePermit?.frontUrl || !resolvedResidencePermit?.backUrl) ? (
              <div className="contractActionRow">
                <button type="button" className="btn btnPrimary" disabled={saving} onClick={uploadSelectedFiles}>
                  {saving ? "Uploading..." : "Upload Residence Permit"}
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

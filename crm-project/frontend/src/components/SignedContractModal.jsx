import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
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

function SignedContractModal({ applicantId, user, fallbackSignedContract, open, onClose, onUpdated }) {
  const [signedContract, setSignedContract] = useState(fallbackSignedContract || null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canUpload = user?.role === "AGENCY" && !signedContract?.fileUrl;

  const loadSignedContract = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/applicants/${applicantId}/signed-contract`);
      setSignedContract(res.data || null);
    } catch (error) {
      console.error(error);
      setSignedContract(fallbackSignedContract || null);
    } finally {
      setLoading(false);
    }
  }, [applicantId, fallbackSignedContract]);

  useEffect(() => {
    if (open && applicantId) {
      setFile(null);
      loadSignedContract();
    }
  }, [open, applicantId, loadSignedContract]);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Select signed contract file");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", file);
      await API.post(`/applicants/${applicantId}/signed-contract`, formData);
      if (typeof onUpdated === "function") await onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to upload signed contract");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard workflowModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={saving} label="Uploading signed contract..." />
        <div className="workflowModalHero">
          <div className="workflowModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 3v4h4M9 14l2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">Upload Signed Contract</h3>
            <div className="workflowModalSubtitle">
              {signedContract?.fileUrl ? "View the uploaded signed contract." : "Upload the signed contract received from the applicant."}
            </div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose} disabled={saving}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading signed contract...</div>
          </div>
        ) : (
          <>
            {signedContract?.fileUrl ? (
              <div className="workflowModalBody">
                <div className="workflowDetailCard workflowDetailCardFlat">
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel">Signed Contract</span>
                    <a href={signedContract.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                      View
                    </a>
                  </div>
                  <div className="workflowDetailRow">
                    <span className="workflowDetailRowLabel">Uploaded On</span>
                    <span className="workflowDetailRowValue">{formatDate(signedContract.uploadedAt)}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {canUpload ? (
              <div className="workflowModalBody">
                <div className="contractUploadPanel workflowEntryPanel workflowEntryPanelNoBorder">
                  <label className="contractUploadLabel" htmlFor="signed-contract-file">Signed Contract</label>
                  <label className="workflowUploadBox" htmlFor="signed-contract-file">
                    <input
                      id="signed-contract-file"
                      type="file"
                      className="contractFileInput"
                      disabled={saving}
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                    />
                    <span className="workflowUploadBoxIcon" aria-hidden="true">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="workflowUploadBoxName">{file ? file.name : "Choose document"}</span>
                  </label>
                  <div className="contractActionRow workflowActionRow workflowActionRowEnd">
                    <button type="button" className="btn btnPrimary" disabled={saving || !file} onClick={handleUpload}>
                      {saving ? "Uploading..." : "Upload Signed Contract"}
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

export default SignedContractModal;

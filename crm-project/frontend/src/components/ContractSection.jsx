import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import API from "../services/api";
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

function ContractSection({ applicantId, user, open, onClose, onUpdated }) {
  const [contract, setContract] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canUpload =
    (user?.role === "SUPER_USER" || user?.role === "EMPLOYER") &&
    !contract?.fileUrl &&
    contract?.status !== "APPROVED";
  const canApprove = user?.role === "SUPER_USER" && contract?.status === "PENDING";

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
    if (canApprove) return "Contract pending super user approval";
    if (contract?.status === "APPROVED") return "Contract issued";
    return "Issue of the Contract";
  }, [canApprove, contract?.status]);

  const handleUploadContract = async () => {
    if (!file) {
      toast.error("Select contract file");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", file);
      await API.post(`/applicants/${applicantId}/contract`, formData);
      setFile(null);
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
      <div className="contractModalCard">
        <div className="contractModalHeader">
          <div>
            <h3 className="contractModalTitle">{title}</h3>
            {contract?.status ? (
              <div className={`contractStatus contractStatus-${contract.status.toLowerCase()}`}>
                {contract.status === "PENDING" ? "Pending super user approval" : "Contract issued"}
              </div>
            ) : null}
          </div>

          <button type="button" className="contractCloseBtn" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="contractInfoRow">Loading contract details...</div>
        ) : (
          <>
            {contract?.fileUrl ? (
              <div className="contractInfoCard">
                <div className="contractInfoRow">
                  <span>View Contract</span>
                  <a href={contract.fileUrl} target="_blank" rel="noreferrer" className="linkBtn">
                    Open contract
                  </a>
                </div>
                <div className="contractInfoRow">
                  <span>Date of Issue</span>
                  <span>{formatDate(contract.issuedAt || contract.uploadedAt)}</span>
                </div>
                <div className="contractInfoRow">
                  <span>Uploaded By</span>
                  <span>{contract.uploadedByName || contract.uploadedByRole || "-"}</span>
                </div>
                {contract?.approvedAt ? (
                  <div className="contractInfoRow">
                    <span>Approved By</span>
                    <span>{contract.approvedByName || "-"}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {canUpload ? (
              <div className="contractUploadPanel">
                <div className="contractUploadLabel">Upload contract file</div>
                <label className="contractFileCard" htmlFor="contract-file">
                  <input
                    id="contract-file"
                    type="file"
                    className="contractFileInput"
                    disabled={saving}
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                  <span className="contractFileCardTitle">
                    {file?.name || "Upload contract"}
                  </span>
                </label>

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
            ) : null}

            {canApprove ? (
              <div className="contractActionRow">
                <button
                  type="button"
                  className="btn btnSuccess"
                  disabled={saving}
                  onClick={handleApproveContract}
                >
                  {saving ? "Saving..." : "Approve Contract"}
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

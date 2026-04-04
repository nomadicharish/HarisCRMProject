import React, { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
import API from "../services/api";
import "../styles/applicantContract.css";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDateForInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrow() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

const CustomDateInput = React.forwardRef(({ value, onClick, placeholder }, ref) => (
  <div style={{ position: "relative", width: "100%" }}>
    <input
      ref={ref}
      value={value || ""}
      onClick={onClick}
      placeholder={placeholder}
      readOnly
      className="workflowDateInput"
    />
    <span className="workflowDateIcon" onClick={onClick}>
      📅
    </span>
  </div>
));

CustomDateInput.displayName = "EmbassyInterviewDateInput";

function EmbassyInterviewModal({ applicantId, user, open, onClose, onUpdated }) {
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [interviewDate, setInterviewDate] = useState(null);
  const [interviewTime, setInterviewTime] = useState("");

  const canEdit = user?.role === "SUPER_USER" || user?.role === "EMPLOYER";
  const canApprove = user?.role === "SUPER_USER" && interview && !interview.approved;
  const isBusy = saving || approving;

  const loadInterview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/applicants/${applicantId}/interview`);
      const data = res.data || null;
      setInterview(data);
      setInterviewDate(data?.dateTime ? new Date(data.dateTime) : null);
      setInterviewTime(data?.dateTime ? String(data.dateTime).split("T")[1]?.slice(0, 5) || "" : "");
    } catch (error) {
      console.error(error);
      setInterview(null);
      setInterviewDate(null);
      setInterviewTime("");
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (open && applicantId) {
      loadInterview();
    }
  }, [open, applicantId, loadInterview]);

  const title = useMemo(() => {
    if (!interview) return "Add Embassy Interview";
    return "Embassy Interview Details";
  }, [interview]);

  const handleSave = async () => {
    const formattedDate = formatDateForInput(interviewDate);
    const trimmedTime = typeof interviewTime === "string" ? interviewTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Interview date and time are required");
      return;
    }

    try {
      setSaving(true);
      await API.post(`/applicants/${applicantId}/interview`, {
        dateTime: `${formattedDate}T${trimmedTime}`
      });
      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save embassy interview");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    try {
      setApproving(true);
      await API.patch(`/applicants/${applicantId}/interview/approve`);
      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to approve embassy interview");
    } finally {
      setApproving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard">
        <div className="workflowModalTopBar">
          <div className="workflowModalTopBarTitle">{title}</div>
          <button type="button" className="workflowModalCloseBtn" onClick={onClose} disabled={isBusy}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="contractInfoRow">Loading embassy interview details...</div>
        ) : (
          <>
            {interview ? (
              <div className="contractInfoCard">
                <div className="contractInfoRow">
                  <span>Interview Date & Time</span>
                  <span>{formatDateTime(interview.dateTime)}</span>
                </div>
                <div className="contractInfoRow">
                  <span>Status</span>
                  <span>{interview.approved ? "Approved" : "Pending super user approval"}</span>
                </div>
              </div>
            ) : null}

            {canEdit ? (
              <div className="contractUploadPanel">
                <div className="contractFormGrid">
                  <div className="input-field">
                    <label className="contractUploadLabel">Interview Date</label>
                    <DatePicker
                      selected={interviewDate}
                      onChange={(date) => setInterviewDate(date)}
                      minDate={getTomorrow()}
                      dateFormat="dd/MM/yyyy"
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
                      customInput={<CustomDateInput placeholder="Select interview date" />}
                    />
                  </div>

                  <div className="input-field">
                    <label className="contractUploadLabel" htmlFor="embassy-interview-time">
                      Interview Time
                    </label>
                    <input
                      id="embassy-interview-time"
                      type="time"
                      value={interviewTime}
                      disabled={isBusy}
                      onChange={(event) => setInterviewTime(event.target.value)}
                    />
                  </div>
                </div>

                <div className="contractActionRow">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSave}>
                    {saving ? "Saving..." : interview ? "Update Interview" : "Save Interview"}
                  </button>
                  {canApprove ? (
                    <button type="button" className="btn btnSuccess" disabled={isBusy} onClick={handleApprove}>
                      {approving ? "Approving..." : "Approve Interview"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default EmbassyInterviewModal;

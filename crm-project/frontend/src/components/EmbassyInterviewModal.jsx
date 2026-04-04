import React, { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
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

function formatTime(value) {
  if (!value) return "-";
  const [hours, minutes] = String(value).split(":");
  if (!hours || !minutes) return value;
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

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

function EmbassyInterviewModal({ applicantId, user, interviewBiometric, open, onClose, onUpdated }) {
  const [interview, setInterview] = useState(null);
  const [interviewTicket, setInterviewTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingInterview, setSavingInterview] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [interviewDate, setInterviewDate] = useState(null);
  const [interviewTime, setInterviewTime] = useState("");
  const [travelDate, setTravelDate] = useState(null);
  const [travelTime, setTravelTime] = useState("");
  const [travelFile, setTravelFile] = useState(null);

  const hasInterviewBiometric = Boolean(interviewBiometric?.fileUrl);
  const canEditInterview = (user?.role === "SUPER_USER" || user?.role === "EMPLOYER") && !hasInterviewBiometric;
  const canApprove = user?.role === "SUPER_USER" && interview && !interview.approved && !hasInterviewBiometric;
  const canAddTicket = user?.role === "AGENCY" && interview && !interviewTicket && !hasInterviewBiometric;
  const isBusy = savingInterview || savingTicket;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [interviewRes, ticketRes] = await Promise.all([
        API.get(`/applicants/${applicantId}/interview`),
        API.get(`/applicants/${applicantId}/interview-ticket`)
      ]);

      const interviewData = interviewRes.data || null;
      const ticketData = ticketRes.data || null;
      const normalizedInterviewTime = interviewData?.dateTime
        ? String(interviewData.dateTime).split("T")[1]?.slice(0, 5) || ""
        : "";

      setInterview(interviewData);
      setInterviewTicket(ticketData);
      setInterviewDate(interviewData?.dateTime ? new Date(interviewData.dateTime) : null);
      setInterviewTime(normalizedInterviewTime);
      setTravelDate(ticketData?.date ? new Date(ticketData.date) : null);
      setTravelTime(ticketData?.time || "");
    } catch (error) {
      console.error(error);
      setInterview(null);
      setInterviewTicket(null);
      setInterviewDate(null);
      setInterviewTime("");
      setTravelDate(null);
      setTravelTime("");
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (open && applicantId) {
      loadData();
      setTravelFile(null);
    }
  }, [open, applicantId, loadData]);

  const title = useMemo(() => {
    if (!interview) return "Add Embassy Interview";
    if (!interviewTicket && user?.role === "AGENCY" && !hasInterviewBiometric) return "Ticket Upload";
    return "Embassy Interview Details";
  }, [interview, interviewTicket, user?.role, hasInterviewBiometric]);

  const handleSaveInterview = async () => {
    const formattedDate = formatDateForInput(interviewDate);
    const trimmedTime = typeof interviewTime === "string" ? interviewTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Interview date and time are required");
      return;
    }

    try {
      setSavingInterview(true);
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
      setSavingInterview(false);
    }
  };

  const handleApprove = async () => {
    try {
      setSavingInterview(true);
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
      setSavingInterview(false);
    }
  };

  const handleSaveTicket = async () => {
    const formattedDate = formatDateForInput(travelDate);
    const trimmedTime = typeof travelTime === "string" ? travelTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Travel date and time are required");
      return;
    }

    try {
      setSavingTicket(true);
      const formData = new FormData();
      formData.append("date", formattedDate);
      formData.append("time", trimmedTime);

      if (travelFile) {
        formData.append("file", travelFile);
      }

      await API.post(`/applicants/${applicantId}/interview-ticket`, formData);

      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save interview ticket");
    } finally {
      setSavingTicket(false);
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
                  <span>Interview Date</span>
                  <span>{formatDate(interview.dateTime)}</span>
                </div>
                <div className="contractInfoRow">
                  <span>Interview Time</span>
                  <span>{formatTime(interview.dateTime ? String(interview.dateTime).split("T")[1]?.slice(0, 5) : "")}</span>
                </div>

                {interviewTicket ? (
                  <>
                    <div className="contractUploadLabel" style={{ marginTop: 18 }}>
                      Travel Details
                    </div>
                    <div className="contractInfoRow">
                      <span>Travel Date</span>
                      <span>{formatDate(interviewTicket.date)}</span>
                    </div>
                    <div className="contractInfoRow">
                      <span>Travel Time</span>
                      <span>{formatTime(interviewTicket.time)}</span>
                    </div>
                    {interviewTicket.fileUrl ? (
                      <div className="contractInfoRow">
                        <span>Ticket</span>
                        <a href={interviewTicket.fileUrl} target="_blank" rel="noreferrer" className="linkBtn">
                          Open ticket
                        </a>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {hasInterviewBiometric ? (
                  <>
                    <div className="contractUploadLabel" style={{ marginTop: 18 }}>
                      Biometric Slip
                    </div>
                    <div className="contractInfoRow">
                      <span>Biometric Slip</span>
                      <a href={interviewBiometric.fileUrl} target="_blank" rel="noreferrer" className="linkBtn">
                        View document
                      </a>
                    </div>
                    <div className="contractInfoRow">
                      <span>Uploaded On</span>
                      <span>{formatDateTime(interviewBiometric.uploadedAt)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {canEditInterview ? (
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
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveInterview}>
                    {savingInterview ? "Saving..." : interview ? "Update Interview" : "Save Interview"}
                  </button>
                  {canApprove ? (
                    <button type="button" className="btn btnSuccess" disabled={isBusy} onClick={handleApprove}>
                      {savingInterview ? "Approving..." : "Approve Interview"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {canAddTicket ? (
              <div className="contractUploadPanel">
                <div className="contractUploadLabel">Travel Details</div>

                <div className="contractFormGrid">
                  <div className="input-field">
                    <label className="contractUploadLabel">Travel Date</label>
                    <DatePicker
                      selected={travelDate}
                      onChange={(date) => setTravelDate(date)}
                      minDate={getTomorrow()}
                      dateFormat="dd/MM/yyyy"
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
                      customInput={<CustomDateInput placeholder="Select travel date" />}
                    />
                  </div>

                  <div className="input-field">
                    <label className="contractUploadLabel" htmlFor="interview-travel-time">
                      Travel Time
                    </label>
                    <input
                      id="interview-travel-time"
                      type="time"
                      value={travelTime}
                      disabled={isBusy}
                      onChange={(event) => setTravelTime(event.target.value)}
                    />
                  </div>
                </div>

                <div className="contractUploadLabel">Ticket (Optional)</div>
                <label className="contractFileCard" htmlFor="interview-travel-file">
                  <input
                    id="interview-travel-file"
                    type="file"
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setTravelFile(event.target.files?.[0] || null)}
                  />
                  <span className="contractFileCardTitle">{travelFile ? travelFile.name : "Upload ticket"}</span>
                </label>

                <div className="contractActionRow">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveTicket}>
                    {savingTicket ? "Saving..." : "Save Ticket Details"}
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

export default EmbassyInterviewModal;

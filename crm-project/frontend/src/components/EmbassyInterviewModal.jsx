import React, { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
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
    <span className="workflowDateIcon" onClick={onClick}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></span>
  </div>
));

CustomDateInput.displayName = "EmbassyInterviewDateInput";

function EmbassyInterviewModal({ applicantId, user, interviewBiometric, open, onClose, onUpdated }) {
  const openTimePicker = (event) => {
    event.target.showPicker?.();
  };
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
  const [biometricFromApi, setBiometricFromApi] = useState(null);

  const resolvedInterviewBiometric = biometricFromApi || interviewBiometric || null;
  const hasInterviewBiometric = Boolean(resolvedInterviewBiometric?.fileUrl);
  const canEditInterview =
    (user?.role === "SUPER_USER" || user?.role === "EMPLOYER") &&
    !hasInterviewBiometric &&
    !interviewTicket &&
    !interview?.approved &&
    String(interview?.status || "").toUpperCase() !== "APPROVED";
  const canApprove = user?.role === "SUPER_USER" && interview && !interview.approved && !hasInterviewBiometric;
  const canAddTicket = user?.role === "AGENCY" && interview && !interviewTicket && !hasInterviewBiometric;
  const isBusy = savingInterview || savingTicket;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const workflowRes = await API.get(`/applicants/${applicantId}/interview-workflow`);

      const interviewData = workflowRes.data?.embassyInterview || null;
      const ticketData = workflowRes.data?.interviewTicket || null;
      const biometricData = workflowRes.data?.interviewBiometric || null;
      const normalizedInterviewTime = interviewData?.dateTime
        ? String(interviewData.dateTime).split("T")[1]?.slice(0, 5) || ""
        : "";

      setInterview(interviewData);
      setInterviewTicket(ticketData);
      setInterviewDate(interviewData?.dateTime ? new Date(interviewData.dateTime) : null);
      setInterviewTime(normalizedInterviewTime);
      setTravelDate(ticketData?.date ? new Date(ticketData.date) : null);
      setTravelTime(ticketData?.time || "");
      setBiometricFromApi(biometricData);
    } catch (error) {
      console.error(error);
      setInterview(null);
      setInterviewTicket(null);
      setInterviewDate(null);
      setInterviewTime("");
      setTravelDate(null);
      setTravelTime("");
      setBiometricFromApi(null);
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
  const sectionTitleStyle = { marginTop: 18, marginBottom: 8, fontWeight: 600 };
  const sectionDividerStyle = { borderTop: "1px solid #e5e7eb", marginTop: 16, paddingTop: 10 };

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={isBusy} label="Saving details..." />
        <div className="dashboardModalHeader">
          <h3 className="dashboardModalTitle">{title}</h3>
          <button type="button" className="dashboardModalCloseBtn" onClick={onClose} disabled={isBusy}>
            x
          </button>
        </div>

        {loading ? (
          <div className="contractInfoRow">Loading embassy interview details...</div>
        ) : (
          <>
            {interview ? (
              <div className="contractInfoCard">
                <div className="contractUploadLabel" style={sectionTitleStyle}>
                  Interview Details
                </div>
                <div className="contractInfoRow">
                  <span>Interview Date & Time</span>
                  <span>
                    {`${formatDate(interview.dateTime)} ${formatTime(interview.dateTime ? String(interview.dateTime).split("T")[1]?.slice(0, 5) : "")}`}
                  </span>
                </div>

                {interviewTicket ? (
                  <div style={sectionDividerStyle}>
                    <div className="contractUploadLabel" style={{ marginBottom: 8, fontWeight: 600 }}>
                      Travel Details
                    </div>
                    <div className="contractInfoRow">
                      <span>Travel Date & Time</span>
                      <span>{`${formatDate(interviewTicket.date)} ${formatTime(interviewTicket.time)}`}</span>
                    </div>
                    {interviewTicket.fileUrl ? (
                      <div className="contractInfoRow">
                        <span>Ticket</span>
                        <a href={interviewTicket.fileUrl} target="_blank" rel="noreferrer" className="linkBtn">
                          Open ticket
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {hasInterviewBiometric ? (
                  <div style={sectionDividerStyle}>
                    <div className="contractUploadLabel" style={{ marginBottom: 8, fontWeight: 600 }}>
                      Biometric Slip
                    </div>
                    <div className="contractInfoRow">
                      <span>Biometric Slip & Uploaded On</span>
                      <span>
                        <a href={resolvedInterviewBiometric.fileUrl} target="_blank" rel="noreferrer" className="linkBtn">
                          View document
                        </a>
                        {` (${formatDateTime(resolvedInterviewBiometric.uploadedAt)})`}
                      </span>
                    </div>
                  </div>
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
                      onClick={openTimePicker}
                      onFocus={openTimePicker}
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
                      {savingInterview ? "Approving..." : "Approve embassy interview"}
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
                      onClick={openTimePicker}
                      onFocus={openTimePicker}
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




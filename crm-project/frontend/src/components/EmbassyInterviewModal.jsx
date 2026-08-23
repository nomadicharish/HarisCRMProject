import React, { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "../utils/toast";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
import WorkflowPaymentStatus from "./WorkflowPaymentStatus";
import { ALLOWED_DOCUMENT_ACCEPT, DOCUMENT_UPLOAD_HELP_TEXT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
import { isSuperUserLikeRole } from "../utils/auth";
import { hasRight } from "../utils/rights";
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
  </div>
));

CustomDateInput.displayName = "EmbassyInterviewDateInput";

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

function EmbassyInterviewModal({ applicantId, user, applicant, interviewBiometric, open, onClose, onUpdated, initialEditTravel = false }) {
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
  const [interviewDocumentFile, setInterviewDocumentFile] = useState(null);
  const [biometricFromApi, setBiometricFromApi] = useState(null);
  const [editingInterview, setEditingInterview] = useState(false);
  const [editingTravel, setEditingTravel] = useState(false);

  const resolvedInterviewBiometric = biometricFromApi || interviewBiometric || null;
  const hasInterviewBiometric = Boolean(resolvedInterviewBiometric?.fileUrl);
  const isSuperUser = isSuperUserLikeRole(user?.role);
  const canEditInterview = hasRight(user, "INITIATE_EMBASSY_INTERVIEW") && !hasInterviewBiometric;
  const canApprove = isSuperUser && interview && !interview.approved && !hasInterviewBiometric;
  const canAddTicket =
    hasRight(user, "ADD_INTERVIEW_TRAVEL") &&
    interview &&
    ((!interviewTicket && !hasInterviewBiometric) || editingTravel);
  const canUpdateTravel = hasRight(user, "ADD_INTERVIEW_TRAVEL") && interview && Boolean(interviewTicket) && !hasInterviewBiometric;
  const isBusy = savingInterview || savingTicket;
  const showInterviewForm = canEditInterview && (!interview || editingInterview);

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
      setInterviewDocumentFile(null);
      setEditingInterview(false);
      setEditingTravel(Boolean(initialEditTravel));
    }
  }, [open, applicantId, loadData, initialEditTravel]);

  const title = useMemo(() => {
    if (!interview) return "Add Embassy Interview";
    if (!interviewTicket && hasRight(user, "ADD_INTERVIEW_TRAVEL") && !hasInterviewBiometric) return "Ticket Upload";
    return "Embassy Interview Details";
  }, [interview, interviewTicket, user, hasInterviewBiometric]);

  const handleSaveInterview = async ({ closeAfter = true, refreshAfter = true } = {}) => {
    const formattedDate = formatDateForInput(interviewDate);
    const trimmedTime = typeof interviewTime === "string" ? interviewTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Interview date and time are required");
      return false;
    }
    const fileValidation = validateDocumentFiles([interviewDocumentFile]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
      return false;
    }

    try {
      setSavingInterview(true);
      const formData = new FormData();
      formData.append("dateTime", `${formattedDate}T${trimmedTime}`);
      if (interviewDocumentFile) formData.append("file", interviewDocumentFile);
      await API.post(`/applicants/${applicantId}/interview`, formData);

      if (refreshAfter && typeof onUpdated === "function") {
        await onUpdated();
      }
      if (closeAfter && typeof onClose === "function") {
        onClose();
      }
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save embassy interview");
      return false;
    } finally {
      setSavingInterview(false);
    }
  };

  const handleUpdateAndApprove = async () => {
    const saved = await handleSaveInterview({ closeAfter: false, refreshAfter: false });
    if (saved) {
      await handleApprove();
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
    const fileValidation = validateDocumentFiles([travelFile]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
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
      <div className="contractModalCard workflowModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={isBusy} label="Saving details..." />
        <div className="workflowModalHero">
          <div className="workflowModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M7 3v4m10-4v4M6 21h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">{title}</h3>
            <div className="workflowModalSubtitle">Review interview, travel and biometric details.</div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose} disabled={isBusy}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading embassy interview details...</div>
          </div>
        ) : (
          <>
            {interview && !showInterviewForm ? (
              <div className="workflowModalBody">
                <div className="workflowDetailStack">
                  <DetailCard
                    title="Interview Details"
                    icon={(
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M4 7h16M7 3v4m10-4v4M6 21h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    )}
                  >
                    <DetailRow
                      label="Interview Date & Time"
                      value={`${formatDate(interview.dateTime)} ${formatTime(interview.dateTime ? String(interview.dateTime).split("T")[1]?.slice(0, 5) : "")}`}
                    />
                    {interview.documentUrl ? (
                      <DetailRow
                        label="Document"
                        action={(
                          <span className="workflowDetailActions">
                            <a href={interview.documentUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">View</a>
                            <a href={interview.documentUrl} download className="workflowDetailAction">Download</a>
                          </span>
                        )}
                      />
                    ) : null}
                  </DetailCard>

                  {interviewTicket ? (
                    <DetailCard
                      title="Travel Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Travel Date & Time" value={`${formatDate(interviewTicket.date)} ${formatTime(interviewTicket.time)}`} />
                      {interviewTicket.fileUrl ? (
                        <DetailRow
                          label="Ticket"
                          action={(
                          <span className="workflowDetailActions">
                            <a href={interviewTicket.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">Open ticket</a>
                            <a href={interviewTicket.fileUrl} download className="workflowDetailAction">Download</a>
                          </span>
                          )}
                        />
                      ) : null}
                    </DetailCard>
                  ) : null}

                  {hasInterviewBiometric ? (
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
                            <a href={resolvedInterviewBiometric.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">View</a>
                            <a href={resolvedInterviewBiometric.fileUrl} download className="workflowDetailAction">Download</a>
                          </span>
                        )}
                      />
                      <DetailRow label="Uploaded On" value={formatDateTime(resolvedInterviewBiometric.uploadedAt)} />
                    </DetailCard>
                  ) : null}
                  {canApprove ? <WorkflowPaymentStatus applicant={applicant} requiredPercent={60} user={user} /> : null}
                </div>
              </div>
            ) : null}

            {showInterviewForm ? (
              <div className="workflowModalBody">
              <div className="contractUploadPanel workflowEntryPanel workflowEntryPanelNoBorder">
                <div className="contractFormGrid">
                  <div className="input-field">
                    <label className="contractUploadLabel">Interview Date</label>
                    <DatePicker
                      selected={interviewDate}
                      onChange={(date) => setInterviewDate(date)}
                      portalId="root"
                      popperPlacement="bottom-start"
                      minDate={new Date()}
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

                <div className="contractUploadLabel">Document (Optional)</div>
                <label className="workflowUploadBox workflowUploadBoxFull" htmlFor="embassy-interview-document">
                  <input
                    id="embassy-interview-document"
                    type="file"
                    accept={ALLOWED_DOCUMENT_ACCEPT}
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setInterviewDocumentFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                  />
                  <span className="workflowUploadBoxIcon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h8l4 4v14H7zM15 3v4h4M10 13h4M10 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="workflowUploadBoxText">
                    <span className="workflowUploadBoxTitle">Choose file</span>
                    <span className="workflowUploadBoxName">{interviewDocumentFile?.name || "No file chosen"}</span>
                    <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                  </span>
                </label>
                {canApprove ? <WorkflowPaymentStatus applicant={applicant} requiredPercent={60} user={user} /> : null}

                <div className="contractActionRow">
                  {interview ? (
                    <button type="button" className="btn btnSecondary" disabled={isBusy} onClick={() => setEditingInterview(false)}>
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btnPrimary"
                    disabled={isBusy}
                    onClick={canApprove && interview ? handleUpdateAndApprove : handleSaveInterview}
                  >
                    {savingInterview
                      ? "Saving..."
                      : canApprove && interview
                      ? "Update & Approve"
                      : interview
                      ? "Update Interview"
                      : "Save Interview"}
                  </button>
                </div>
              </div>
              </div>
            ) : null}

            {canAddTicket ? (
              <div className="workflowModalBody">
              <div className="contractUploadPanel workflowEntryPanel">
                <div className="contractUploadLabel">Travel Details</div>

                <div className="contractFormGrid">
                  <div className="input-field">
                    <label className="contractUploadLabel">Travel Date</label>
                    <DatePicker
                      selected={travelDate}
                      onChange={(date) => setTravelDate(date)}
                      portalId="root"
                      popperPlacement="bottom-start"
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
                <label className="workflowUploadBox workflowUploadBoxFull" htmlFor="interview-travel-file">
                  <input
                    id="interview-travel-file"
                    type="file"
                    accept={ALLOWED_DOCUMENT_ACCEPT}
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setTravelFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                  />
                  <span className="workflowUploadBoxIcon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="workflowUploadBoxText">
                    <span className="workflowUploadBoxTitle">Choose file</span>
                    <span className="workflowUploadBoxName">
                      {travelFile ? travelFile.name : interviewTicket?.fileUrl ? "Keep current ticket or choose a replacement" : "No file chosen"}
                    </span>
                    <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                  </span>
                </label>

                <div className="contractActionRow">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveTicket}>
                    {savingTicket ? "Saving..." : interviewTicket ? "Update Travel" : "Save Ticket Details"}
                  </button>
                  {interviewTicket ? (
                    <button type="button" className="btn btnSecondary" disabled={isBusy} onClick={() => setEditingTravel(false)}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              </div>
            ) : null}

            {!showInterviewForm ? (
              <div className="workflowModalFooter">
                {canUpdateTravel && !editingTravel ? (
                  <button type="button" className="workflowFileActionBtn" disabled={isBusy} onClick={() => setEditingTravel(true)}>
                    Update Travel
                  </button>
                ) : null}
                {interview && canEditInterview ? (
                  <button type="button" className="workflowFileActionBtn" disabled={isBusy} onClick={() => setEditingInterview(true)}>
                    Update Interview
                  </button>
                ) : null}
                {canApprove ? (
                  <button type="button" className="btn btnSuccess" disabled={isBusy} onClick={handleApprove}>
                    {savingInterview ? "Approving..." : "Approve embassy interview"}
                  </button>
                ) : (
                  <button type="button" className="btn btnSecondary" onClick={onClose} disabled={isBusy}>
                    Close
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default EmbassyInterviewModal;




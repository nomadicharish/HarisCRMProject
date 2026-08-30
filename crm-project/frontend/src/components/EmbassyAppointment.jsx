import React, { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "../utils/toast";
import API from "../services/api";
import { getApiErrorMessage } from "../utils/apiError";
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

CustomDateInput.displayName = "WorkflowDateInput";

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
      <span className="workflowDetailRowValue">
        {action || value}
      </span>
    </div>
  );
}

function EmbassyAppointment({ applicantId, user, applicant, biometricSlip, open, onClose, onUpdated, initialEditTravel = false }) {
  const openTimePicker = (event) => {
    event.target.showPicker?.();
  };
  const [appointment, setAppointment] = useState(null);
  const [travelDetails, setTravelDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [approvingAppointment, setApprovingAppointment] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(null);
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentFile, setAppointmentFile] = useState(null);
  const [travelDate, setTravelDate] = useState(null);
  const [travelTime, setTravelTime] = useState("");
  const [travelFile, setTravelFile] = useState(null);
  const [biometricFromApi, setBiometricFromApi] = useState(null);
  const [editingAppointment, setEditingAppointment] = useState(false);
  const [editingTravel, setEditingTravel] = useState(false);

  const hasBiometricSlip = Boolean(biometricSlip?.fileUrl || biometricFromApi?.fileUrl);
  const isAppointmentPending = String(appointment?.status || "").toUpperCase() === "PENDING";
  const isSuperUser = isSuperUserLikeRole(user?.role);
  const canEditAppointment = hasRight(user, "INITIATE_EMBASSY_APPOINTMENT") && !hasBiometricSlip;
  const canApprove = isSuperUser && appointment && isAppointmentPending && !hasBiometricSlip;
  const canAddTicket =
    hasRight(user, "ADD_APPOINTMENT_TRAVEL") &&
    appointment &&
    ((!travelDetails && !hasBiometricSlip) || editingTravel);
  const canUpdateTravel = hasRight(user, "ADD_APPOINTMENT_TRAVEL") && appointment && Boolean(travelDetails) && !hasBiometricSlip;
  const isBusy = savingAppointment || savingTicket || approvingAppointment;
  const showAppointmentForm = canEditAppointment && (!appointment || editingAppointment);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const workflowRes = await API.get(`/applicants/${applicantId}/embassy-workflow`);
      const appointmentData = workflowRes.data?.embassyAppointment || null;
      const travelData = workflowRes.data?.travelDetails || null;
      const biometricData = workflowRes.data?.biometricSlip || null;
      const normalizedAppointmentTime =
        appointmentData?.time ||
        appointmentData?.appointmentTime ||
        (appointmentData?.dateTime ? String(appointmentData.dateTime).split("T")[1]?.slice(0, 5) : "") ||
        "";

      setAppointment(appointmentData ? { ...appointmentData, time: normalizedAppointmentTime } : null);
      setTravelDetails(travelData);
      setAppointmentDate(
        appointmentData?.date ? new Date(appointmentData.date) : appointmentData?.dateTime ? new Date(appointmentData.dateTime) : null
      );
      setAppointmentTime(normalizedAppointmentTime);
      setTravelDate(travelData?.travelDate ? new Date(travelData.travelDate) : null);
      setTravelTime(travelData?.time || "");
      setBiometricFromApi(biometricData);
    } catch (error) {
      console.error(error);
      setAppointment(null);
      setTravelDetails(null);
      setAppointmentDate(null);
      setAppointmentTime("");
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
      setAppointmentFile(null);
      setTravelFile(null);
      setEditingAppointment(false);
      setEditingTravel(Boolean(initialEditTravel));
    }
  }, [open, applicantId, loadData, initialEditTravel]);

  const title = useMemo(() => {
    if (!appointment) return "Enter Embassy Appointment details";
    if (!travelDetails && hasRight(user, "ADD_APPOINTMENT_TRAVEL") && !hasBiometricSlip) return "Ticket Upload";
    return "Embassy Appointment Details";
  }, [appointment, travelDetails, user, hasBiometricSlip]);

  const handleSaveAppointment = async ({ closeAfter = true, refreshAfter = true } = {}) => {
    const formattedDate = formatDateForInput(appointmentDate);
    const trimmedTime = typeof appointmentTime === "string" ? appointmentTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Appointment date and time are required");
      return false;
    }
    const fileValidation = validateDocumentFiles([appointmentFile]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
      return false;
    }

    try {
      setSavingAppointment(true);
      const formData = new FormData();
      formData.append("date", formattedDate);
      formData.append("time", trimmedTime);
      formData.append("dateTime", `${formattedDate}T${trimmedTime}`);

      if (appointmentFile) {
        formData.append("file", appointmentFile);
      }

      await API.post(`/applicants/${applicantId}/embassy-appointment`, formData);

      if (refreshAfter && typeof onUpdated === "function") {
        await onUpdated();
      }

      if (closeAfter && typeof onClose === "function") {
        onClose();
      }
      return true;
    } catch (error) {
      console.error(error);
      toast.error(getApiErrorMessage(error, "Failed to save appointment"));
      return false;
    } finally {
      setSavingAppointment(false);
    }
  };

  const handleUpdateAndApproveAppointment = async () => {
    const saved = await handleSaveAppointment({ closeAfter: false, refreshAfter: false });
    if (saved) {
      await handleApproveAppointment();
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
      formData.append("travelDate", formattedDate);
      formData.append("time", trimmedTime);
      formData.append("ticketNumber", "");

      if (travelFile) {
        formData.append("file", travelFile);
      }

      await API.post(`/applicants/${applicantId}/travel`, formData);

      if (typeof onUpdated === "function") {
        await onUpdated();
      }

      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(getApiErrorMessage(error, "Failed to save ticket details"));
    } finally {
      setSavingTicket(false);
    }
  };

  const handleApproveAppointment = async () => {
    try {
      setApprovingAppointment(true);
      await API.patch(`/applicants/${applicantId}/embassy-appointment/approve`);
      if (typeof onUpdated === "function") {
        await onUpdated();
      }
      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(getApiErrorMessage(error, "Failed to approve embassy appointment"));
    } finally {
      setApprovingAppointment(false);
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
              <path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">{title}</h3>
            <div className="workflowModalSubtitle">View appointment, travel and document details.</div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose} disabled={isBusy}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading embassy appointment details...</div>
          </div>
        ) : (
          <>
            {appointment && !showAppointmentForm ? (
              <div className="workflowModalBody">
                <div className="workflowDetailStack">
                  <DetailCard
                    title="Appointment Details"
                    icon={(
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M8 3v2m8-2v2M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    )}
                  >
                    <DetailRow label="Appointment Date & Time" value={`${formatDate(appointment.dateTime || appointment.date)} ${formatTime(appointment.time)}`} />
                    <DetailRow label="Status" value={isAppointmentPending ? "Pending admin approval" : "Approved"} />
                    {appointment.fileUrl ? (
                      <DetailRow
                        label="Appointment Document"
                        action={(
                          <span className="workflowDetailActions">
                            <a href={appointment.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">Open</a>
                            <a href={appointment.fileUrl} download className="workflowDetailAction">Download</a>
                          </span>
                        )}
                      />
                    ) : null}
                  </DetailCard>

                  {travelDetails ? (
                    <DetailCard
                      title="Travel Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Travel Date & Time" value={`${formatDate(travelDetails.travelDate)} ${formatTime(travelDetails.time)}`} />
                      {travelDetails.fileUrl ? (
                        <DetailRow
                          label="Ticket"
                          action={(
                            <span className="workflowDetailActions">
                              <a href={travelDetails.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">Open ticket</a>
                              <a href={travelDetails.fileUrl} download className="workflowDetailAction">Download</a>
                            </span>
                          )}
                        />
                      ) : null}
                    </DetailCard>
                  ) : null}

                  {hasBiometricSlip ? (
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
                            <a href={(biometricFromApi?.fileUrl || biometricSlip?.fileUrl || "")} target="_blank" rel="noreferrer" className="workflowDetailAction">View document</a>
                            <a href={(biometricFromApi?.fileUrl || biometricSlip?.fileUrl || "")} download className="workflowDetailAction">Download</a>
                          </span>
                        )}
                      />
                    </DetailCard>
                  ) : null}
                  {canApprove ? <WorkflowPaymentStatus applicant={applicant} requiredPercent={60} user={user} /> : null}
                </div>
              </div>
            ) : null}

            {showAppointmentForm ? (
              <div className="workflowModalBody">
              <div className="contractUploadPanel workflowEntryPanel workflowEntryPanelNoBorder">
                <div className="contractFormGrid">
                  <div className="input-field">
                    <label className="contractUploadLabel">Appointment Date</label>
                    <DatePicker
                      selected={appointmentDate}
                      onChange={(date) => setAppointmentDate(date)}
                      portalId="root"
                      popperPlacement="bottom-start"
                      minDate={new Date()}
                      dateFormat="dd/MM/yyyy"
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
                      customInput={<CustomDateInput placeholder="Select appointment date" />}
                    />
                  </div>

                  <div className="input-field">
                    <label className="contractUploadLabel" htmlFor="appointment-time">
                      Appointment Time
                    </label>
                    <input
                      id="appointment-time"
                      type="time"
                      value={appointmentTime}
                      disabled={isBusy}
                      onClick={openTimePicker}
                      onFocus={openTimePicker}
                      onChange={(event) => setAppointmentTime(event.target.value)}
                    />
                  </div>
                </div>

                <div className="contractUploadLabel">Appointment Document (Optional)</div>
                <label className="workflowUploadBox workflowUploadBoxFull" htmlFor="appointment-file">
                  <input
                    id="appointment-file"
                    type="file"
                    accept={ALLOWED_DOCUMENT_ACCEPT}
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setAppointmentFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                  />
                  <span className="workflowUploadBoxIcon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="workflowUploadBoxText">
                    <span className="workflowUploadBoxTitle">Choose file</span>
                    <span className="workflowUploadBoxName">
                      {appointmentFile ? appointmentFile.name : appointment?.fileUrl ? "Upload new file to replace current" : "No file chosen"}
                    </span>
                    <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                  </span>
                </label>
                {canApprove ? <WorkflowPaymentStatus applicant={applicant} requiredPercent={60} user={user} /> : null}

                <div className="contractActionRow">
                  {appointment ? (
                    <button type="button" className="btn btnSecondary" disabled={isBusy} onClick={() => setEditingAppointment(false)}>
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btnPrimary"
                    disabled={isBusy}
                    onClick={canApprove && appointment ? handleUpdateAndApproveAppointment : handleSaveAppointment}
                  >
                    {savingAppointment || approvingAppointment
                      ? "Saving..."
                      : canApprove && appointment
                      ? "Update & Approve"
                      : appointment
                      ? "Update Appointment"
                      : "Save Appointment"}
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
                    <label className="contractUploadLabel" htmlFor="travel-time">
                      Travel Time
                    </label>
                    <input
                      id="travel-time"
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
                <label className="workflowUploadBox workflowUploadBoxFull" htmlFor="travel-file">
                  <input
                    id="travel-file"
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
                      {travelFile ? travelFile.name : travelDetails?.fileUrl ? "Keep current ticket or choose a replacement" : "No file chosen"}
                    </span>
                    <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                  </span>
                </label>

                <div className="contractActionRow">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveTicket}>
                    {savingTicket ? "Saving..." : travelDetails ? "Update Travel" : "Save Ticket Details"}
                  </button>
                  {travelDetails ? (
                    <button type="button" className="btn btnSecondary" disabled={isBusy} onClick={() => setEditingTravel(false)}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              </div>
            ) : null}

            {!showAppointmentForm ? (
              <div className="workflowModalFooter">
                {canUpdateTravel && !editingTravel ? (
                  <button type="button" className="workflowFileActionBtn" disabled={isBusy} onClick={() => setEditingTravel(true)}>
                    Update Travel
                  </button>
                ) : null}
                {appointment && canEditAppointment ? (
                  <button type="button" className="workflowFileActionBtn" disabled={isBusy} onClick={() => setEditingAppointment(true)}>
                    Update Appointment
                  </button>
                ) : null}
                {canApprove ? (
                  <button type="button" className="btn btnSuccess" disabled={isBusy} onClick={handleApproveAppointment}>
                    {approvingAppointment ? "Approving..." : "Approve Embassy Appointment"}
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

export default EmbassyAppointment;




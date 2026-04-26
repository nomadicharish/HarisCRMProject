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

function EmbassyAppointment({ applicantId, user, biometricSlip, open, onClose, onUpdated }) {
  const openTimePicker = (event) => {
    event.target.showPicker?.();
  };
  const [appointment, setAppointment] = useState(null);
  const [travelDetails, setTravelDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(null);
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentFile, setAppointmentFile] = useState(null);
  const [travelDate, setTravelDate] = useState(null);
  const [travelTime, setTravelTime] = useState("");
  const [travelFile, setTravelFile] = useState(null);
  const [biometricFromApi, setBiometricFromApi] = useState(null);

  const hasBiometricSlip = Boolean(biometricSlip?.fileUrl || biometricFromApi?.fileUrl);
  const canEditAppointment = (user?.role === "SUPER_USER" || user?.role === "EMPLOYER") && !hasBiometricSlip;
  const canAddTicket = user?.role === "AGENCY" && appointment && !travelDetails && !hasBiometricSlip;
  const isBusy = savingAppointment || savingTicket;

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
    }
  }, [open, applicantId, loadData]);

  const title = useMemo(() => {
    if (!appointment) return "Enter Embassy Appointment details";
    if (!travelDetails && user?.role === "AGENCY" && !hasBiometricSlip) return "Ticket Upload";
    return "Embassy Appointment Details";
  }, [appointment, travelDetails, user?.role, hasBiometricSlip]);

  const handleSaveAppointment = async () => {
    const formattedDate = formatDateForInput(appointmentDate);
    const trimmedTime = typeof appointmentTime === "string" ? appointmentTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Appointment date and time are required");
      return;
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

      if (typeof onUpdated === "function") {
        await onUpdated();
      }

      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save appointment");
    } finally {
      setSavingAppointment(false);
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
      toast.error(error?.response?.data?.message || "Failed to save ticket details");
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
            {appointment ? (
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
                    {appointment.fileUrl ? (
                      <DetailRow
                        label="Appointment Document"
                        action={(
                          <a href={appointment.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">
                            Open document
                          </a>
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
                            <a href={travelDetails.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">
                              Open ticket
                            </a>
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
                          <a
                            href={(biometricFromApi?.fileUrl || biometricSlip?.fileUrl || "")}
                            target="_blank"
                            rel="noreferrer"
                            className="workflowDetailAction"
                          >
                            View document
                          </a>
                        )}
                      />
                    </DetailCard>
                  ) : null}
                </div>
              </div>
            ) : null}

            {canEditAppointment ? (
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
                      minDate={getTomorrow()}
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
                <label className="contractFileCard" htmlFor="appointment-file">
                  <input
                    id="appointment-file"
                    type="file"
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setAppointmentFile(event.target.files?.[0] || null)}
                  />
                  <span className="contractFileCardTitle">
                    {appointmentFile
                      ? appointmentFile.name
                      : appointment?.fileUrl
                      ? "Update appointment document"
                      : "Upload appointment document"}
                  </span>
                </label>

                <div className="contractActionRow">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveAppointment}>
                    {savingAppointment ? "Saving..." : appointment ? "Update Appointment" : "Save Appointment"}
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
                <label className="contractFileCard" htmlFor="travel-file">
                  <input
                    id="travel-file"
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
              </div>
            ) : null}

            <div className="workflowModalFooter">
              <button type="button" className="btn btnSecondary" onClick={onClose} disabled={isBusy}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default EmbassyAppointment;




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

CustomDateInput.displayName = "VisaCollectionDateInput";

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

function VisaCollectionModal({ applicantId, user, residencePermit, open, onClose, onUpdated }) {
  const openTimePicker = (event) => {
    event.target.showPicker?.();
  };
  const [visaCollection, setVisaCollection] = useState(null);
  const [visaTravel, setVisaTravel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [collectionDate, setCollectionDate] = useState(null);
  const [collectionTime, setCollectionTime] = useState("");
  const [travelDate, setTravelDate] = useState(null);
  const [travelTime, setTravelTime] = useState("");
  const [travelFile, setTravelFile] = useState(null);

  const hasResidencePermit = Boolean(residencePermit?.frontUrl && residencePermit?.backUrl);
  const canEditCollection =
    (user?.role === "SUPER_USER" || user?.role === "EMPLOYER") &&
    !hasResidencePermit &&
    visaCollection?.status !== "APPROVED";
  const canApprove = user?.role === "SUPER_USER" && visaCollection?.status === "PENDING" && !hasResidencePermit;
  const canAddTicket = user?.role === "AGENCY" && visaCollection?.status === "APPROVED" && !visaTravel && !hasResidencePermit;
  const isBusy = savingCollection || savingTicket;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [collectionRes, travelRes] = await Promise.all([
        API.get(`/applicants/${applicantId}/visa-collection`),
        API.get(`/applicants/${applicantId}/visa-travel`)
      ]);

      const collectionData = collectionRes.data || null;
      const travelData = travelRes.data || null;

      setVisaCollection(collectionData);
      setVisaTravel(travelData);
      setCollectionDate(collectionData?.date ? new Date(collectionData.date) : null);
      setCollectionTime(collectionData?.time || "");
      setTravelDate(travelData?.date ? new Date(travelData.date) : null);
      setTravelTime(travelData?.time || "");
    } catch (error) {
      console.error(error);
      setVisaCollection(null);
      setVisaTravel(null);
      setCollectionDate(null);
      setCollectionTime("");
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
    if (!visaCollection) return "Add Visa Collection Details";
    if (!visaTravel && user?.role === "AGENCY" && !hasResidencePermit) return "Ticket Upload";
    return "Visa Collection Details";
  }, [visaCollection, visaTravel, user?.role, hasResidencePermit]);

  const handleSaveCollection = async () => {
    const formattedDate = formatDateForInput(collectionDate);
    const trimmedTime = typeof collectionTime === "string" ? collectionTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Visa collection date and time are required");
      return;
    }

    try {
      setSavingCollection(true);
      await API.post(`/applicants/${applicantId}/visa-collection`, {
        date: formattedDate,
        time: trimmedTime
      });
      if (typeof onUpdated === "function") await onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save visa collection");
    } finally {
      setSavingCollection(false);
    }
  };

  const handleApprove = async () => {
    try {
      setSavingCollection(true);
      await API.patch(`/applicants/${applicantId}/visa-collection/approve`);
      if (typeof onUpdated === "function") await onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to approve visa collection");
    } finally {
      setSavingCollection(false);
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
      formData.append("ticketNumber", "");
      if (travelFile) formData.append("file", travelFile);
      await API.post(`/applicants/${applicantId}/visa-travel`, formData);
      if (typeof onUpdated === "function") await onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save visa travel");
    } finally {
      setSavingTicket(false);
    }
  };

  if (!open) return null;
  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard workflowModalCard workflowEntryModalCard" style={{ position: "relative" }}>
        <BlockingLoader open={isBusy} label="Saving details..." />
        <div className="workflowModalHero">
          <div className="workflowModalHeroIcon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M6 3h9l3 3v15H6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="14" r="3.4" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
          <div className="workflowModalHeroText">
            <h3 className="dashboardModalTitle">{title}</h3>
            <div className="workflowModalSubtitle">
              {visaCollection ? "View visa collection and travel details." : "Enter the date and time when the visa was collected."}
            </div>
          </div>
          <button type="button" className="dashboardModalCloseBtn workflowModalCloseBtn" onClick={onClose} disabled={isBusy}>
            x
          </button>
        </div>

        {loading ? (
          <div className="workflowModalBody">
            <div className="contractInfoRow">Loading visa collection details...</div>
          </div>
        ) : (
          <>
            {visaCollection ? (
              <div className="workflowModalBody">
                <div className="workflowDetailStack">
                  <DetailCard
                    title="Visa Collection Details"
                    icon={(
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M6 3h9l3 3v15H6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  >
                    <DetailRow label="Visa Collection Date" value={formatDate(visaCollection.date)} />
                    <DetailRow label="Visa Collection Time" value={formatTime(visaCollection.time)} />
                  </DetailCard>

                  {visaTravel ? (
                    <DetailCard
                      title="Travel Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Travel Date" value={formatDate(visaTravel.date)} />
                      <DetailRow label="Travel Time" value={formatTime(visaTravel.time)} />
                      {visaTravel.fileUrl ? (
                        <DetailRow
                          label="Ticket"
                          action={(
                            <a href={visaTravel.fileUrl} target="_blank" rel="noreferrer" className="workflowDetailAction">
                              Open ticket
                            </a>
                          )}
                        />
                      ) : null}
                    </DetailCard>
                  ) : null}
                </div>
              </div>
            ) : null}

            {canEditCollection ? (
              <div className="workflowModalBody">
              <div className="contractUploadPanel workflowEntryPanel workflowEntryPanelNoBorder">
                <div className="contractFormGrid">
                  <div className="input-field">
                    <label className="contractUploadLabel">Visa Collection Date</label>
                    <DatePicker
                      selected={collectionDate}
                      onChange={(date) => setCollectionDate(date)}
                      portalId="root"
                      popperPlacement="bottom-start"
                      minDate={getTomorrow()}
                      dateFormat="dd/MM/yyyy"
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
                      customInput={<CustomDateInput placeholder="Select visa collection date" />}
                    />
                  </div>

                  <div className="input-field">
                    <label className="contractUploadLabel" htmlFor="visa-collection-time">
                      Visa Collection Time
                    </label>
                    <input
                      id="visa-collection-time"
                      type="time"
                      value={collectionTime}
                      disabled={isBusy}
                      onClick={openTimePicker}
                      onFocus={openTimePicker}
                      onChange={(event) => setCollectionTime(event.target.value)}
                    />
                  </div>
                </div>

                <div className="contractActionRow workflowActionRow workflowActionRowEnd">
                  <button type="button" className="btn btnSecondary" disabled={isBusy} onClick={onClose}>
                    Cancel
                  </button>
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveCollection}>
                    {savingCollection ? "Saving..." : visaCollection ? "Update Visa Collection" : "Add Visa Collection"}
                  </button>
                  {canApprove ? (
                    <button type="button" className="btn btnSuccess" disabled={isBusy} onClick={handleApprove}>
                      {savingCollection ? "Approving..." : "Approve Visa Collection"}
                    </button>
                  ) : null}
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
                    <label className="contractUploadLabel" htmlFor="visa-travel-time">
                      Travel Time
                    </label>
                    <input
                      id="visa-travel-time"
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
                <label className="contractFileCard" htmlFor="visa-travel-file">
                  <input
                    id="visa-travel-file"
                    type="file"
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setTravelFile(event.target.files?.[0] || null)}
                  />
                  <span className="contractFileCardTitle">{travelFile ? travelFile.name : "Upload ticket"}</span>
                </label>

                <div className="contractActionRow workflowActionRow workflowActionRowEnd">
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

export default VisaCollectionModal;




import React, { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
import { formatCurrencyAmount, normalizeCurrency } from "../utils/currency";
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
  <div className="workflowDateShell">
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

function VisaCollectionModal({ applicantId, user, applicant, fallbackVisaCollectionTravel, residencePermit, mode = "collection", open, onClose, onUpdated }) {
  const openTimePicker = (event) => {
    event.target.showPicker?.();
  };
  const [visaCollection, setVisaCollection] = useState(null);
  const [visaCollectionTravel, setVisaCollectionTravel] = useState(null);
  const [visaTravel, setVisaTravel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [collectionDate, setCollectionDate] = useState(null);
  const [collectionTime, setCollectionTime] = useState("");
  const [travelDate, setTravelDate] = useState(null);
  const [travelTime, setTravelTime] = useState("");
  const [travelFile, setTravelFile] = useState(null);
  const [collectionDocumentFile, setCollectionDocumentFile] = useState(null);
  const [collectionTravelDate, setCollectionTravelDate] = useState(null);
  const [collectionTravelTime, setCollectionTravelTime] = useState("");
  const [collectionTravelFile, setCollectionTravelFile] = useState(null);
  const [flightNumber, setFlightNumber] = useState("");
  const [arrivalPlace, setArrivalPlace] = useState("");
  const [busTicketFile, setBusTicketFile] = useState(null);

  const hasResidencePermit = Boolean(residencePermit?.frontUrl && residencePermit?.backUrl);
  const isApplicantTravelMode = mode === "applicantTravel";
  const isCollectionMode = !isApplicantTravelMode;
  const canEditCollection =
    isCollectionMode &&
    (user?.role === "SUPER_USER" || user?.role === "EMPLOYER") &&
    !hasResidencePermit &&
    visaCollection?.status !== "APPROVED";
  const canApprove = isCollectionMode && user?.role === "SUPER_USER" && visaCollection?.status === "PENDING" && !hasResidencePermit;
  const canAddCollectionTravel =
    isCollectionMode &&
    user?.role === "SUPER_USER" &&
    Number(applicant?.stage || 1) >= 11 &&
    visaCollection?.status === "APPROVED";
  const pendingAmount = applicant?.payment?.pendingInr ?? applicant?.payment?.pending ?? 0;
  const paymentCurrency = normalizeCurrency(applicant?.payment?.currency || applicant?.paymentCurrency || applicant?.currency);
  const canAddTicket =
    isApplicantTravelMode &&
    user?.role === "AGENCY" &&
    Number(applicant?.stage || 1) >= 12 &&
    visaCollection?.status === "APPROVED" &&
    !visaTravel;
  const canUpdateTicket =
    isApplicantTravelMode &&
    user?.role === "AGENCY" &&
    Number(applicant?.stage || 1) >= 12 &&
    Boolean(visaTravel);
  const isBusy = savingCollection || savingTicket;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [collectionRes, collectionTravelRes, travelRes] = await Promise.all([
        API.get(`/applicants/${applicantId}/visa-collection`),
        API.get(`/applicants/${applicantId}/visa-collection-travel`),
        API.get(`/applicants/${applicantId}/visa-travel`)
      ]);

      const collectionData = collectionRes.data || null;
      const collectionTravelData = collectionTravelRes.data || fallbackVisaCollectionTravel || null;
      const travelData = travelRes.data || null;

      setVisaCollection(collectionData);
      setVisaCollectionTravel(collectionTravelData);
      setVisaTravel(travelData);
      setCollectionDate(collectionData?.date ? new Date(collectionData.date) : null);
      setCollectionTime(collectionData?.time || "");
      setCollectionTravelDate(collectionTravelData?.date ? new Date(collectionTravelData.date) : null);
      setCollectionTravelTime(collectionTravelData?.time || "");
      setTravelDate(travelData?.date ? new Date(travelData.date) : null);
      setTravelTime(travelData?.time || "");
      setFlightNumber(travelData?.flightNumber || "");
      setArrivalPlace(travelData?.arrivalPlace || "");
    } catch (error) {
      console.error(error);
      setVisaCollection(null);
      setVisaCollectionTravel(fallbackVisaCollectionTravel || null);
      setVisaTravel(null);
      setCollectionDate(null);
      setCollectionTime("");
      setCollectionTravelDate(fallbackVisaCollectionTravel?.date ? new Date(fallbackVisaCollectionTravel.date) : null);
      setCollectionTravelTime(fallbackVisaCollectionTravel?.time || "");
      setTravelDate(null);
      setTravelTime("");
      setFlightNumber("");
      setArrivalPlace("");
    } finally {
      setLoading(false);
    }
  }, [applicantId, fallbackVisaCollectionTravel]);

  useEffect(() => {
    if (open && applicantId) {
      loadData();
      setTravelFile(null);
      setCollectionDocumentFile(null);
      setCollectionTravelFile(null);
      setBusTicketFile(null);
    }
  }, [open, applicantId, loadData]);

  const title = useMemo(() => {
    if (isApplicantTravelMode) return "Applicant Arrival Details";
    if (!visaCollection) return "Add Visa Collection Details";
    return "Visa Collection Details";
  }, [isApplicantTravelMode, visaCollection]);

  const handleSaveCollection = async () => {
    const formattedDate = formatDateForInput(collectionDate);
    const trimmedTime = typeof collectionTime === "string" ? collectionTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Visa collection date and time are required");
      return;
    }

    try {
      setSavingCollection(true);
      const formData = new FormData();
      formData.append("date", formattedDate);
      formData.append("time", trimmedTime);
      if (collectionDocumentFile) formData.append("file", collectionDocumentFile);
      await API.post(`/applicants/${applicantId}/visa-collection`, formData);
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

  const handleSaveCollectionTravel = async () => {
    const formattedDate = formatDateForInput(collectionTravelDate);
    const trimmedTime = typeof collectionTravelTime === "string" ? collectionTravelTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Travel date and time are required");
      return;
    }

    try {
      setSavingCollection(true);
      const formData = new FormData();
      formData.append("date", formattedDate);
      formData.append("time", trimmedTime);
      if (collectionTravelFile) formData.append("file", collectionTravelFile);
      await API.post(`/applicants/${applicantId}/visa-collection-travel`, formData);
      if (typeof onUpdated === "function") await onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save travel details");
    } finally {
      setSavingCollection(false);
    }
  };

  const handleSaveTicket = async () => {
    const formattedDate = formatDateForInput(travelDate);
    const trimmedTime = typeof travelTime === "string" ? travelTime.trim() : "";

    if (!formattedDate || !trimmedTime || !flightNumber.trim() || !arrivalPlace.trim()) {
      toast.error("Arrival date, arrival time, flight number and arrival place are required");
      return;
    }

    try {
      setSavingTicket(true);
      const formData = new FormData();
      formData.append("date", formattedDate);
      formData.append("time", trimmedTime);
      formData.append("ticketNumber", "");
      formData.append("flightNumber", flightNumber.trim());
      formData.append("arrivalPlace", arrivalPlace.trim());
      if (travelFile) formData.append("file", travelFile);
      if (busTicketFile) formData.append("busTicket", busTicketFile);
      await API.post(`/applicants/${applicantId}/visa-travel`, formData);
      if (typeof onUpdated === "function") await onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save applicant arrival details");
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
              {isApplicantTravelMode
                ? "Enter or view the applicant arrival details."
                : visaCollection
                ? "View visa collection details."
                : "Enter the date and time when the visa was collected."}
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
            {(isCollectionMode && visaCollection) || (isApplicantTravelMode && visaTravel) ? (
              <div className="workflowModalBody">
                <div className="workflowDetailStack">
                  {isCollectionMode && visaCollection ? (
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
                      {visaCollection.documentUrl ? (
                        <DetailRow
                          label="Document"
                          action={(
                            <a href={visaCollection.documentUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                              View
                            </a>
                          )}
                        />
                      ) : null}
                    </DetailCard>
                  ) : null}

                  {isCollectionMode && visaCollectionTravel ? (
                    <DetailCard
                      title="Travel Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Travel Date" value={formatDate(visaCollectionTravel.date)} />
                      <DetailRow label="Travel Time" value={formatTime(visaCollectionTravel.time)} />
                      {visaCollectionTravel.fileUrl ? (
                        <DetailRow
                          label="Travel Ticket"
                          action={(
                            <a href={visaCollectionTravel.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                              View
                            </a>
                          )}
                        />
                      ) : null}
                    </DetailCard>
                  ) : null}

                  {isApplicantTravelMode && visaTravel ? (
                    <DetailCard
                      title="Applicant Arrival Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      <DetailRow label="Arrival Date" value={formatDate(visaTravel.date)} />
                      <DetailRow label="Arrival Time" value={formatTime(visaTravel.time)} />
                      <DetailRow label="Flight Number" value={visaTravel.flightNumber || "-"} />
                      <DetailRow label="Arrival Place" value={visaTravel.arrivalPlace || "-"} />
                      {visaTravel.fileUrl ? (
                        <DetailRow
                          label="Ticket"
                          action={(
                            <a href={visaTravel.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                              </svg>
                              View
                            </a>
                          )}
                        />
                      ) : null}
                      {visaTravel.busTicketUrl ? (
                        <DetailRow
                          label="Bus Ticket"
                          action={(
                            <a href={visaTravel.busTicketUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                              View
                            </a>
                          )}
                        />
                      ) : null}
                    </DetailCard>
                  ) : null}
                </div>
              </div>
            ) : null}

            {canApprove ? (
              <div className="workflowModalBody">
                <div className="contractInfoCard">
                  <div className="contractInfoRow">
                    <span>Pending Amount</span>
                    <strong>{formatCurrencyAmount(pendingAmount, paymentCurrency, true)}</strong>
                  </div>
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

                <div className="contractUploadLabel">Document (Optional)</div>
                <label className="workflowUploadBox workflowUploadBoxFull" htmlFor="visa-collection-document">
                  <input
                    id="visa-collection-document"
                    type="file"
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setCollectionDocumentFile(event.target.files?.[0] || null)}
                  />
                  <span className="workflowUploadBoxIcon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h8l4 4v14H7zM15 3v4h4M10 13h4M10 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="workflowUploadBoxName">{collectionDocumentFile?.name || "Choose document"}</span>
                </label>

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

            {canAddCollectionTravel ? (
              <div className="workflowModalBody">
                <div className="workflowDetailCard workflowTicketUploadCard">
                  <div className="workflowDetailHeader">
                    <span className="workflowDetailHeaderIcon" aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>Travel Details</span>
                  </div>
                  <div className="workflowDetailBody workflowTicketUploadBody">
                    <div className="workflowTravelEntryGrid">
                      <div className="input-field">
                        <label className="contractUploadLabel">Travel Date</label>
                        <DatePicker
                          selected={collectionTravelDate}
                          onChange={(date) => setCollectionTravelDate(date)}
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
                        <label className="contractUploadLabel" htmlFor="visa-collection-travel-time">
                          Travel Time
                        </label>
                        <input
                          id="visa-collection-travel-time"
                          type="time"
                          value={collectionTravelTime}
                          disabled={isBusy}
                          onClick={openTimePicker}
                          onFocus={openTimePicker}
                          onChange={(event) => setCollectionTravelTime(event.target.value)}
                        />
                      </div>

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="visa-collection-travel-file">
                          Travel Ticket (Optional)
                        </label>
                        <label className="workflowUploadBox" htmlFor="visa-collection-travel-file">
                          <input
                            id="visa-collection-travel-file"
                            type="file"
                            className="contractFileInput"
                            disabled={isBusy}
                            onChange={(event) => setCollectionTravelFile(event.target.files?.[0] || null)}
                          />
                          <span className="workflowUploadBoxIcon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="workflowUploadBoxText">
                            <span className="workflowUploadBoxName">{collectionTravelFile ? collectionTravelFile.name : "No file chosen"}</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="contractActionRow workflowActionRow workflowActionRowEnd">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveCollectionTravel}>
                    {savingCollection ? "Saving..." : visaCollectionTravel ? "Update Travel Details" : "Save Travel Details"}
                  </button>
                </div>
              </div>
            ) : null}

            {canAddTicket || canUpdateTicket ? (
              <div className="workflowModalBody">
                <div className="workflowDetailCard workflowTicketUploadCard">
                  <div className="workflowDetailHeader">
                    <span className="workflowDetailHeaderIcon" aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="m3 11 18-7-7 18-2.8-7.2L3 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>Applicant Arrival Details</span>
                  </div>

                  <div className="workflowDetailBody workflowTicketUploadBody">
                    <div className="workflowTravelEntryGrid">
                      <div className="input-field">
                        <label className="contractUploadLabel">Arrival Date</label>
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
                          customInput={<CustomDateInput placeholder="Select arrival date" />}
                        />
                      </div>

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="visa-travel-time">
                          Arrival Time
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

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="flight-number">
                          Flight Number
                        </label>
                        <input
                          id="flight-number"
                          value={flightNumber}
                          disabled={isBusy}
                          placeholder="Enter flight number"
                          onChange={(event) => setFlightNumber(event.target.value)}
                        />
                      </div>

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="arrival-place">
                          Arrival Place
                        </label>
                        <input
                          id="arrival-place"
                          value={arrivalPlace}
                          disabled={isBusy}
                          placeholder="Enter arrival place"
                          onChange={(event) => setArrivalPlace(event.target.value)}
                        />
                      </div>

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="visa-travel-file">
                          Travel Ticket
                        </label>
                        <label className="workflowUploadBox" htmlFor="visa-travel-file">
                          <input
                            id="visa-travel-file"
                            type="file"
                            className="contractFileInput"
                            disabled={isBusy}
                            onChange={(event) => setTravelFile(event.target.files?.[0] || null)}
                          />
                          <span className="workflowUploadBoxIcon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="workflowUploadBoxText">
                            <span className="workflowUploadBoxName">{travelFile ? travelFile.name : "No file chosen"}</span>
                          </span>
                        </label>
                      </div>

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="visa-bus-ticket-file">
                          Bus Ticket (Optional)
                        </label>
                        <label className="workflowUploadBox" htmlFor="visa-bus-ticket-file">
                          <input
                            id="visa-bus-ticket-file"
                            type="file"
                            className="contractFileInput"
                            disabled={isBusy}
                            onChange={(event) => setBusTicketFile(event.target.files?.[0] || null)}
                          />
                          <span className="workflowUploadBoxIcon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="workflowUploadBoxText">
                            <span className="workflowUploadBoxName">{busTicketFile ? busTicketFile.name : "No file chosen"}</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="contractActionRow workflowActionRow workflowActionRowEnd">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveTicket}>
                    {savingTicket ? "Saving..." : visaTravel ? "Update Applicant Arrival Details" : "Save Applicant Arrival Details"}
                  </button>
                </div>
              </div>
            ) : null}

            {!canAddTicket && !canUpdateTicket && !canAddCollectionTravel ? (
              <div className="workflowModalFooter">
                <button type="button" className="btn btnSecondary" onClick={onClose} disabled={isBusy}>
                  Close
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default VisaCollectionModal;




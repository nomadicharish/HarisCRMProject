import React, { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
import API from "../services/api";
import BlockingLoader from "./common/BlockingLoader";
import WorkflowPaymentStatus from "./WorkflowPaymentStatus";
import { ALLOWED_DOCUMENT_ACCEPT, DOCUMENT_UPLOAD_HELP_TEXT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
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

function formatArrivalDateTime(dateValue, timeValue) {
  const dateText = formatDate(dateValue);
  const timeText = formatTime(timeValue);
  if (dateText === "-" && timeText === "-") return "-";
  if (dateText === "-") return timeText;
  if (timeText === "-") return dateText;
  return `${dateText} ${timeText}`;
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

function VisaCollectionModal({
  applicantId,
  user,
  applicant,
  fallbackVisaCollectionTravel,
  residencePermit,
  mode = "collection",
  open,
  onClose,
  onUpdated,
  initialEditCollectionTravel = false
}) {
  const openTimePicker = (event) => {
    event.target.showPicker?.();
  };
  const [visaCollection, setVisaCollection] = useState(null);
  const [visaCollectionTravel, setVisaCollectionTravel] = useState(null);
  const [visaTravel, setVisaTravel] = useState(null);
  const [residencePermitData, setResidencePermitData] = useState(null);
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
  const [arrivalBusNumber, setArrivalBusNumber] = useState("");
  const [hotelNameAddress, setHotelNameAddress] = useState("");
  const [busTicketFile, setBusTicketFile] = useState(null);
  const [removeTravelFile, setRemoveTravelFile] = useState(false);
  const [removeBusTicketFile, setRemoveBusTicketFile] = useState(false);
  const [editingArrivalDetails, setEditingArrivalDetails] = useState(false);
  const [editingCollectionDetails, setEditingCollectionDetails] = useState(false);
  const [editingCollectionTravel, setEditingCollectionTravel] = useState(false);

  const hasResidencePermit = Boolean(
    residencePermitData?.trpUrl || residencePermitData?.fileUrl || residencePermitData?.frontUrl || residencePermitData?.backUrl
  );
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
    user?.role === "AGENCY" &&
    Number(applicant?.stage || 1) >= 11 &&
    visaCollection?.status === "APPROVED" &&
    (!visaCollectionTravel || editingCollectionTravel);
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
    Boolean(visaTravel) &&
    editingArrivalDetails;
  const isBusy = savingCollection || savingTicket;
  const showCollectionForm = canEditCollection && (!visaCollection || editingCollectionDetails);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [collectionRes, collectionTravelRes, travelRes, residencePermitRes] = await Promise.all([
        API.get(`/applicants/${applicantId}/visa-collection`),
        API.get(`/applicants/${applicantId}/visa-collection-travel`),
        API.get(`/applicants/${applicantId}/visa-travel`),
        API.get(`/applicants/${applicantId}/residence-permit`)
      ]);

      const collectionData = collectionRes.data || null;
      const collectionTravelData = collectionTravelRes.data || fallbackVisaCollectionTravel || null;
      const travelData = travelRes.data || null;
      const permitData = residencePermitRes.data || residencePermit || null;

      setVisaCollection(collectionData);
      setVisaCollectionTravel(collectionTravelData);
      setVisaTravel(travelData);
      setResidencePermitData(permitData);
      setCollectionDate(collectionData?.date ? new Date(collectionData.date) : null);
      setCollectionTime(collectionData?.time || "");
      setCollectionTravelDate(collectionTravelData?.date ? new Date(collectionTravelData.date) : null);
      setCollectionTravelTime(collectionTravelData?.time || "");
      setTravelDate(travelData?.date ? new Date(travelData.date) : null);
      setTravelTime(travelData?.time || "");
      setFlightNumber(travelData?.flightNumber || "");
      setArrivalPlace(travelData?.arrivalPlace || "");
      setArrivalBusNumber(travelData?.arrivalBusNumber || "");
      setHotelNameAddress(travelData?.hotelNameAddress || "");
      setRemoveTravelFile(false);
      setRemoveBusTicketFile(false);
      setEditingArrivalDetails(!travelData);
    } catch (error) {
      console.error(error);
      setVisaCollection(null);
      setVisaCollectionTravel(fallbackVisaCollectionTravel || null);
      setVisaTravel(null);
      setResidencePermitData(residencePermit || null);
      setCollectionDate(null);
      setCollectionTime("");
      setCollectionTravelDate(fallbackVisaCollectionTravel?.date ? new Date(fallbackVisaCollectionTravel.date) : null);
      setCollectionTravelTime(fallbackVisaCollectionTravel?.time || "");
      setTravelDate(null);
      setTravelTime("");
      setFlightNumber("");
      setArrivalPlace("");
      setArrivalBusNumber("");
      setHotelNameAddress("");
      setRemoveTravelFile(false);
      setRemoveBusTicketFile(false);
      setEditingArrivalDetails(false);
    } finally {
      setLoading(false);
    }
  }, [applicantId, fallbackVisaCollectionTravel, residencePermit]);

  useEffect(() => {
    if (open && applicantId) {
      loadData();
      setTravelFile(null);
      setCollectionDocumentFile(null);
      setCollectionTravelFile(null);
      setBusTicketFile(null);
      setRemoveTravelFile(false);
      setRemoveBusTicketFile(false);
      setEditingCollectionDetails(false);
      setEditingCollectionTravel(Boolean(initialEditCollectionTravel));
    }
  }, [open, applicantId, loadData, initialEditCollectionTravel]);

  const title = useMemo(() => {
    if (isApplicantTravelMode) return "Applicant Arrival Details";
    if (!visaCollection) return "Add Visa Collection Details";
    return "Visa Collection Details";
  }, [isApplicantTravelMode, visaCollection]);

  const handleSaveCollection = async ({ closeAfter = true, refreshAfter = true } = {}) => {
    const formattedDate = formatDateForInput(collectionDate);
    const trimmedTime = typeof collectionTime === "string" ? collectionTime.trim() : "";

    if (!formattedDate || !trimmedTime) {
      toast.error("Visa collection date and time are required");
      return false;
    }
    const fileValidation = validateDocumentFiles([collectionDocumentFile]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
      return false;
    }

    try {
      setSavingCollection(true);
      const formData = new FormData();
      formData.append("date", formattedDate);
      formData.append("time", trimmedTime);
      if (collectionDocumentFile) formData.append("file", collectionDocumentFile);
      await API.post(`/applicants/${applicantId}/visa-collection`, formData);
      if (refreshAfter && typeof onUpdated === "function") await onUpdated();
      if (closeAfter && typeof onClose === "function") onClose();
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save visa collection");
      return false;
    } finally {
      setSavingCollection(false);
    }
  };

  const handleUpdateAndApproveCollection = async () => {
    const saved = await handleSaveCollection({ closeAfter: false, refreshAfter: false });
    if (saved) {
      await handleApprove();
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
    const fileValidation = validateDocumentFiles([collectionTravelFile]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
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
    const fileValidation = validateDocumentFiles([travelFile, busTicketFile]);
    if (!fileValidation.valid) {
      toast.error(fileValidation.message);
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
      formData.append("arrivalBusNumber", arrivalBusNumber.trim());
      formData.append("hotelNameAddress", hotelNameAddress.trim());
      if (removeTravelFile && !travelFile) formData.append("removeTravelFile", "true");
      if (removeBusTicketFile && !busTicketFile) formData.append("removeBusTicket", "true");
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
            {(isCollectionMode && visaCollection && !showCollectionForm) || (isApplicantTravelMode && visaTravel && !editingArrivalDetails) ? (
              <div className="workflowModalBody">
                <div className="workflowDetailStack">
                  {isCollectionMode && visaCollection && !showCollectionForm ? (
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

                  {isCollectionMode && visaCollectionTravel && !showCollectionForm ? (
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

                  {isCollectionMode && hasResidencePermit && !showCollectionForm ? (
                    <DetailCard
                      title="TRP Details"
                      icon={(
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    >
                      {residencePermitData?.trpUrl || residencePermitData?.fileUrl ? (
                        <DetailRow
                          label="TRP Document"
                          action={(
                            <a href={residencePermitData.trpUrl || residencePermitData.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                              View
                            </a>
                          )}
                        />
                      ) : null}
                      {residencePermitData?.frontUrl ? (
                        <DetailRow
                          label="Front Side"
                          action={(
                            <a href={residencePermitData.frontUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                              View
                            </a>
                          )}
                        />
                      ) : null}
                      {residencePermitData?.backUrl ? (
                        <DetailRow
                          label="Back Side"
                          action={(
                            <a href={residencePermitData.backUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn">
                              View
                            </a>
                          )}
                        />
                      ) : null}
                      <DetailRow label="Uploaded On" value={formatDateTime(residencePermitData?.uploadedAt)} />
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
                      <DetailRow label="Arrival Date & Time" value={formatArrivalDateTime(visaTravel.date, visaTravel.time)} />
                      <DetailRow label="Flight Number" value={visaTravel.flightNumber || "-"} />
                      <DetailRow label="Arrival Place" value={visaTravel.arrivalPlace || "-"} />
                      <DetailRow label="Arrival Bus Number" value={visaTravel.arrivalBusNumber || "-"} />
                      <DetailRow label="Hotel Name & Address" value={visaTravel.hotelNameAddress || "-"} />
                      {visaTravel.fileUrl ? (
                        <DetailRow
                          label="Flight Ticket"
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
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                              </svg>
                              View
                            </a>
                          )}
                        />
                      ) : null}
                    </DetailCard>
                  ) : null}
                  {isCollectionMode && visaCollection && !showCollectionForm ? (
                    <WorkflowPaymentStatus applicant={applicant} requiredPercent={100} user={user} />
                  ) : null}
                </div>
              </div>
            ) : null}

            {isApplicantTravelMode && visaTravel && user?.role === "AGENCY" && !editingArrivalDetails ? (
              <div className="workflowModalFooter">
                <button
                  type="button"
                  className="workflowFileActionBtn"
                  onClick={() => setEditingArrivalDetails(true)}
                  disabled={isBusy}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Edit
                </button>
              </div>
            ) : null}

            {showCollectionForm ? (
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
                    accept={ALLOWED_DOCUMENT_ACCEPT}
                    className="contractFileInput"
                    disabled={isBusy}
                    onChange={(event) => setCollectionDocumentFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                  />
                  <span className="workflowUploadBoxIcon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h8l4 4v14H7zM15 3v4h4M10 13h4M10 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="workflowUploadBoxText">
                    <span className="workflowUploadBoxTitle">Choose file</span>
                    <span className="workflowUploadBoxName">{collectionDocumentFile?.name || "No file chosen"}</span>
                    <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                  </span>
                </label>
                {visaCollection ? <WorkflowPaymentStatus applicant={applicant} requiredPercent={100} user={user} /> : null}

                <div className="contractActionRow workflowActionRow workflowActionRowEnd">
                  <button
                    type="button"
                    className="btn btnSecondary"
                    disabled={isBusy}
                    onClick={visaCollection ? () => setEditingCollectionDetails(false) : onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    disabled={isBusy}
                    onClick={canApprove && visaCollection ? handleUpdateAndApproveCollection : handleSaveCollection}
                  >
                    {savingCollection
                      ? "Saving..."
                      : canApprove && visaCollection
                      ? "Update & Approve"
                      : visaCollection
                      ? "Update Visa Collection"
                      : "Add Visa Collection"}
                  </button>
                </div>
              </div>
              </div>
            ) : null}

            {isCollectionMode && visaCollection && !showCollectionForm && !canAddCollectionTravel ? (
              <div className="workflowModalFooter">
                {canEditCollection ? (
                  <button type="button" className="workflowFileActionBtn" disabled={isBusy} onClick={() => setEditingCollectionDetails(true)}>
                    Edit
                  </button>
                ) : null}
                {canApprove ? (
                  <button type="button" className="btn btnSuccess" disabled={isBusy} onClick={handleApprove}>
                    {savingCollection ? "Approving..." : "Approve Visa Collection"}
                  </button>
                ) : (
                  <button type="button" className="btn btnSecondary" onClick={onClose} disabled={isBusy}>
                    Close
                  </button>
                )}
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
                            accept={ALLOWED_DOCUMENT_ACCEPT}
                            className="contractFileInput"
                            disabled={isBusy}
                            onChange={(event) => setCollectionTravelFile(getValidatedDocumentFile(event.target.files?.[0] || null, toast.error))}
                          />
                          <span className="workflowUploadBoxIcon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="workflowUploadBoxText">
                            <span className="workflowUploadBoxName">{collectionTravelFile ? collectionTravelFile.name : "No file chosen"}</span>
                            <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="contractActionRow workflowActionRow workflowActionRowEnd">
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveCollectionTravel}>
                    {savingCollection ? "Saving..." : visaCollectionTravel ? "Update Travel" : "Save Travel Details"}
                  </button>
                  {visaCollectionTravel ? (
                    <button type="button" className="btn btnSecondary" disabled={isBusy} onClick={() => setEditingCollectionTravel(false)}>
                      Cancel
                    </button>
                  ) : null}
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
                          Arrival Flight Number
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
                        <label className="contractUploadLabel" htmlFor="arrival-bus-number">
                          Arrival Bus Number (Optional)
                        </label>
                        <input
                          id="arrival-bus-number"
                          value={arrivalBusNumber}
                          disabled={isBusy}
                          placeholder="Enter bus number"
                          onChange={(event) => setArrivalBusNumber(event.target.value)}
                        />
                      </div>

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="visa-travel-file">
                          Flight Ticket
                        </label>
                        {visaTravel?.fileUrl && !removeTravelFile ? (
                          <div className="workflowExistingFileRow">
                            <a href={visaTravel.fileUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn workflowExistingFileViewBtn">
                              View current
                            </a>
                            <button
                              type="button"
                              className="signedDocRejectBtn workflowExistingFileRemoveBtn"
                              disabled={isBusy}
                              onClick={() => {
                                setTravelFile(null);
                                setRemoveTravelFile(true);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                        <label className="workflowUploadBox" htmlFor="visa-travel-file">
                          <input
                            id="visa-travel-file"
                            type="file"
                            accept={ALLOWED_DOCUMENT_ACCEPT}
                            className="contractFileInput"
                            disabled={isBusy}
                            onChange={(event) => {
                              const selectedFile = getValidatedDocumentFile(event.target.files?.[0] || null, toast.error);
                              setTravelFile(selectedFile);
                              if (selectedFile) setRemoveTravelFile(false);
                            }}
                          />
                          <span className="workflowUploadBoxIcon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="workflowUploadBoxText">
                            <span className="workflowUploadBoxTitle">Choose file</span>
                            <span className="workflowUploadBoxName">
                              {travelFile ? travelFile.name : removeTravelFile ? "Current flight ticket will be removed" : visaTravel?.fileUrl ? "Upload new file to replace current" : "No file chosen"}
                            </span>
                            <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                          </span>
                        </label>
                      </div>

                      <div className="input-field">
                        <label className="contractUploadLabel" htmlFor="visa-bus-ticket-file">
                          Bus Ticket (Optional)
                        </label>
                        {visaTravel?.busTicketUrl && !removeBusTicketFile ? (
                          <div className="workflowExistingFileRow">
                            <a href={visaTravel.busTicketUrl} target="_blank" rel="noreferrer" className="workflowFileActionBtn workflowExistingFileViewBtn">
                              View current
                            </a>
                            <button
                              type="button"
                              className="signedDocRejectBtn workflowExistingFileRemoveBtn"
                              disabled={isBusy}
                              onClick={() => {
                                setBusTicketFile(null);
                                setRemoveBusTicketFile(true);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                        <label className="workflowUploadBox" htmlFor="visa-bus-ticket-file">
                          <input
                            id="visa-bus-ticket-file"
                            type="file"
                            accept={ALLOWED_DOCUMENT_ACCEPT}
                            className="contractFileInput"
                            disabled={isBusy}
                            onChange={(event) => {
                              const selectedFile = getValidatedDocumentFile(event.target.files?.[0] || null, toast.error);
                              setBusTicketFile(selectedFile);
                              if (selectedFile) setRemoveBusTicketFile(false);
                            }}
                          />
                          <span className="workflowUploadBoxIcon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="workflowUploadBoxText">
                            <span className="workflowUploadBoxTitle">Choose file</span>
                            <span className="workflowUploadBoxName">
                              {busTicketFile ? busTicketFile.name : removeBusTicketFile ? "Current bus ticket will be removed" : visaTravel?.busTicketUrl ? "Upload new file to replace current" : "No file chosen"}
                            </span>
                            <span className="workflowUploadBoxMeta">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                          </span>
                        </label>
                      </div>

                      <div className="input-field workflowTravelFullField">
                        <label className="contractUploadLabel" htmlFor="hotel-name-address">
                          Hotel Name & Address (Optional)
                        </label>
                        <textarea
                          id="hotel-name-address"
                          value={hotelNameAddress}
                          disabled={isBusy}
                          placeholder="Enter hotel name and address"
                          rows={3}
                          onChange={(event) => setHotelNameAddress(event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="contractActionRow workflowActionRow workflowActionRowEnd">
                  {visaTravel ? (
                    <button type="button" className="btn btnSecondary" disabled={isBusy} onClick={() => setEditingArrivalDetails(false)}>
                      Cancel
                    </button>
                  ) : null}
                  <button type="button" className="btn btnPrimary" disabled={isBusy} onClick={handleSaveTicket}>
                    {savingTicket ? "Saving..." : visaTravel ? "Update Applicant Arrival Details" : "Save Applicant Arrival Details"}
                  </button>
                </div>
              </div>
            ) : null}

            {!canAddTicket && !canUpdateTicket && !canAddCollectionTravel && !(isCollectionMode && visaCollection) && !showCollectionForm ? (
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

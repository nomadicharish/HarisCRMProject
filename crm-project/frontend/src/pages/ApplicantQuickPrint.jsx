import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import PageLoader from "../components/common/PageLoader";
import "../styles/applicantsDashboard.css";

function Value({ children }) {
  const text = String(children || "").trim();
  return text || "-";
}

function Field({ label, value }) {
  return (
    <div className="quickPrintField">
      <div className="quickPrintLabel">{label}</div>
      <div className="quickPrintValue"><Value>{value}</Value></div>
    </div>
  );
}

function Attachment({ title, url }) {
  const isPdf = /\.pdf(?:$|[?#])/i.test(String(url || ""));

  return (
    <section className="quickPrintAttachment">
      <h2>{title}</h2>
      {!url ? (
        <div className="quickPrintMissing">Not provided</div>
      ) : isPdf ? (
        <div className="quickPrintPdfAttachment">
          <strong>PDF ticket attached</strong>
          <span>{url}</span>
        </div>
      ) : (
        <img src={url} alt={title} />
      )}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          Open original attachment
        </a>
      ) : null}
    </section>
  );
}

function ApplicantQuickPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [applicant, setApplicant] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    API.get(`/applicants/${id}`)
      .then((response) => {
        if (active) setApplicant(response.data || null);
      })
      .catch((requestError) => {
        console.error(requestError);
        if (active) setError("Unable to load applicant arrival details.");
      });

    return () => {
      active = false;
    };
  }, [id]);

  const details = useMemo(() => {
    const personal = applicant?.personalDetails || {};
    const arrival = applicant?.visaTravel || {};
    return {
      arrival,
      fullName:
        applicant?.fullName ||
        [applicant?.firstName || personal.firstName, applicant?.lastName || personal.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        "Applicant",
      phone: applicant?.phone || personal.phone || "",
      whatsapp:
        applicant?.whatsappNumber ||
        personal.whatsappNumber ||
        personal.whatsapp ||
        ""
    };
  }, [applicant]);

  if (error) {
    return <div className="quickPrintError">{error}</div>;
  }

  if (!applicant) {
    return <PageLoader label="Preparing applicant details..." />;
  }

  return (
    <div className="quickPrintPage">
      <div className="quickPrintToolbar">
        <button type="button" className="quickPrintBack" onClick={() => navigate(-1)}>
          Back
        </button>
        <button type="button" className="quickPrintAction" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <main className="quickPrintSheet">
        <header className="quickPrintHeader">
          {applicant.profilePhotoUrl ? (
            <img className="quickPrintPhoto" src={applicant.profilePhotoUrl} alt={details.fullName} />
          ) : (
            <div className="quickPrintPhotoMissing">No photo</div>
          )}
          <div>
            <h1>{details.fullName}</h1>
            <p>Applicant Arrival Information</p>
          </div>
        </header>

        <section className="quickPrintDetails">
          <Field label="Contact Number" value={details.phone} />
          <Field label="WhatsApp Number" value={details.whatsapp} />
          <Field label="Company" value={applicant.companyName} />
          <Field label="Job Position" value={applicant.jobPositionName} />
          <Field label="Arrival Date" value={details.arrival.date} />
          <Field label="Arrival Time" value={details.arrival.time} />
          <Field label="Flight Number" value={details.arrival.flightNumber} />
          <Field label="Arrival Place" value={details.arrival.arrivalPlace} />
          <Field label="Arrival Bus Number" value={details.arrival.arrivalBusNumber} />
          <Field label="Hotel Name & Address" value={details.arrival.hotelNameAddress} />
        </section>

        <section className="quickPrintAttachments">
          <Attachment title="Arrival Flight Ticket" url={details.arrival.fileUrl} />
          <Attachment title="Arrival Bus Ticket" url={details.arrival.busTicketUrl} />
        </section>
      </main>
    </div>
  );
}

export default ApplicantQuickPrint;

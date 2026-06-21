import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import PageLoader from "../components/common/PageLoader";
import { generateApplicantArrivalPdf } from "../utils/applicantQuickPrintPdf";
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

function ApplicantQuickPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [applicant, setApplicant] = useState(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

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

  const handleGeneratePdf = async () => {
    try {
      setGenerating(true);
      setError("");
      const loadAsset = async (assetType) => {
        const response = await API.get(`/applicants/${id}/quick-print-assets/${assetType}`, {
          responseType: "arraybuffer"
        });
        return {
          bytes: new Uint8Array(response.data),
          contentType: String(response.headers["content-type"] || "").toLowerCase()
        };
      };
      const bytes = await generateApplicantArrivalPdf(applicant, loadAsset);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const pdfWindow = window.open(url, "_blank");
      if (!pdfWindow) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${details.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-arrival-details.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (generationError) {
      console.error(generationError);
      setError("Unable to generate the PDF. Please verify that the ticket files are accessible.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="quickPrintPage">
      <div className="quickPrintToolbar">
        <button type="button" className="quickPrintBack" onClick={() => navigate(-1)}>
          Back
        </button>
        <button type="button" className="quickPrintAction" onClick={handleGeneratePdf} disabled={generating}>
          {generating ? "Generating PDF..." : "Generate / Print PDF"}
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

        <div className="quickPrintPdfNotice">
          The generated PDF appends the flight ticket and bus ticket (if available) after this details page, with matching headers and footers.
        </div>
      </main>
    </div>
  );
}

export default ApplicantQuickPrint;

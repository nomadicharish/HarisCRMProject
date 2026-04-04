import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import API from "../services/api";
import "../styles/forms.css";
import "../styles/applicantProfile.css";
import ApplicantFormModal from "../components/applicant-form/ApplicantFormModal";
import ApplicantSummaryCard from "../components/applicant/ApplicantSummaryCard";
import ApplicantDetailsView from "../components/applicant/ApplicantDetailsView";
import ApplicantDocumentsTable from "../components/applicant/ApplicantDocumentsTable";
import ApplicantPipelineList from "../components/applicant/ApplicantPipelineList";
import DispatchSection from "../components/DispatchSection";
import ContractSection from "../components/ContractSection";
import EmbassyAppointment from "../components/EmbassyAppointment";
import TravelSection from "../components/TravelSection";
import BiometricSection from "../components/BiometricSection";
import EmbassyInterview from "../components/EmbassyInterview";
import InterviewTicket from "../components/InterviewTicket";
import InterviewBiometric from "../components/InterviewBiometric";
import VisaCollection from "../components/VisaCollection";
import VisaTravel from "../components/VisaTravel";
import ResidencePermit from "../components/ResidencePermit";

function ApplicantProfile() {
  const { id } = useParams();
  const [applicant, setApplicant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState({});
  const [selectedFiles, setSelectedFiles] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [editContext, setEditContext] = useState("default");
  const documentsRef = useRef(null);
  const [resolvedAgencyName, setResolvedAgencyName] = useState("");
  const [resolvedCountryName, setResolvedCountryName] = useState("");

  const handleFileSelect = useCallback((docType, file) => {
    setSelectedFiles((prev) => ({ ...prev, [docType]: file }));
  }, []);

  const loadApplicant = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}`);
      setApplicant(res.data);
    } catch (err) {
      console.error(err);
      setApplicant(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadUser = useCallback(async () => {
    try {
      const res = await API.get("/auth/me");
      setUser(res.data);
    } catch (err) {
      console.error(err);
      setUser(null);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/documents`);
      setDocuments(res.data || {});
    } catch (err) {
      console.error(err);
      setDocuments({});
    }
  }, [id]);

  useEffect(() => {
    loadApplicant();
    loadUser();
    loadDocuments();
  }, [loadApplicant, loadUser, loadDocuments]);

  useEffect(() => {
    const agencyId = applicant?.agencyId;
    const alreadyHasName = Boolean(applicant?.agencyName || applicant?.agency?.name);
    if (user?.role !== "SUPER_USER") return;
    if (!agencyId || alreadyHasName) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await API.get("/agencies");
        const found = (res.data || []).find((a) => a.id === agencyId);
        if (!cancelled) setResolvedAgencyName(found?.name || "");
      } catch (err) {
        console.error(err);
        if (!cancelled) setResolvedAgencyName("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applicant?.agencyId, applicant?.agencyName, applicant?.agency?.name, user?.role]);

  useEffect(() => {
    const countryId = applicant?.countryId;
    const alreadyHasName = Boolean(applicant?.countryName || applicant?.country);
    if (!countryId || alreadyHasName) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await API.get("/countries");
        const found = (res.data || []).find((c) => c.id === countryId);
        if (!cancelled) setResolvedCountryName(found?.name || "");
      } catch (err) {
        console.error(err);
        if (!cancelled) setResolvedCountryName("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applicant?.countryId, applicant?.countryName, applicant?.country]);

  const canEditApplicant = user?.role === "SUPER_USER";
  const pipelineStep = Math.min(Number(applicant?.stage || 1), 7);

  const completeProcess = async () => {
    try {
      await API.patch(`/applicants/${id}/complete`);
      alert("Process Completed ✅");
      loadApplicant();
    } catch (err) {
      console.error(err);
      alert("Error completing process");
    }
  };

  const uploadDoc = async (docType, file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", docType);

      await API.post(`/applicants/${id}/upload-document`, formData);

      setSelectedFiles((prev) => {
        const updated = { ...prev };
        delete updated[docType];
        return updated;
      });

      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    }
  };

  const approveDoc = async (docType, versionId) => {
    await API.patch(`/applicants/${id}/documents/${docType}/${versionId}/approve`);
    await loadDocuments();
    await loadApplicant();
  };

  const rejectDoc = async (docType, versionId) => {
    const reason = prompt("Enter reason");
    await API.patch(`/applicants/${id}/documents/${docType}/${versionId}/reject`, { reason });
    await loadDocuments();
  };

  const deferDoc = async (docType) => {
    await API.patch(`/applicants/${id}/documents/${docType}/defer`);
    await loadDocuments();
  };

  if (loading) return <div style={{ padding: "40px" }}>Loading...</div>;
  if (!applicant) return <div style={{ padding: "40px" }}>Applicant not found</div>;

  const total = applicant.payment?.total ?? 0;
  const paid = applicant.payment?.paid ?? 0;
  const pending = applicant.payment?.pending ?? Math.max(0, total - paid);

  const handleShowDocuments = () => {
    setShowDocuments(true);
    setTimeout(() => {
      documentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const approveStage = async () => {
    await API.patch(`/applicants/${id}/approve-stage`);
    await loadApplicant();
  };

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="breadcrumbRow">Applicants / {applicant?.fullName || "Applicant"}</div>

        <div className="applicantProfileLayout">
          <aside className="applicantProfileSidebar">
            <ApplicantSummaryCard
              applicant={applicant}
              pendingAmount={pending}
              canEdit={canEditApplicant}
              onEdit={() => {
                setEditContext("default");
                setShowEditModal(true);
              }}
              onViewMore={() => setShowMore((v) => !v)}
              agencyName={resolvedAgencyName}
              countryName={resolvedCountryName}
            />
          </aside>

          <main className="applicantProfileMain">
            <ApplicantPipelineList
              currentStep={pipelineStep}
              totalSteps={7}
              onUploadDocuments={handleShowDocuments}
              canUploadDocuments={true}
              onCandidateAccountCreation={() => {
                setEditContext("stage1");
                setShowEditModal(true);
              }}
            />

            {showMore && <ApplicantDetailsView applicant={applicant} />}

            {showDocuments && (
              <div ref={documentsRef}>
                <ApplicantDocumentsTable
                  applicant={applicant}
                  documents={documents}
                  selectedFiles={selectedFiles}
                  onFileSelect={handleFileSelect}
                  onUpload={uploadDoc}
                  onDefer={deferDoc}
                  onApprove={approveDoc}
                  onReject={rejectDoc}
                  canReview={user?.role === "SUPER_USER"}
                />
              </div>
            )}

            {showMore && (
              <div className="moreSection">
                {Number(applicant.stage) >= 3 && <DispatchSection applicantId={id} />}
                {Number(applicant.stage) >= 4 && <ContractSection applicantId={id} user={user} />}
                {Number(applicant.stage) >= 5 && (
                  <EmbassyAppointment applicantId={id} user={user} loadApplicant={loadApplicant} />
                )}
                {Number(applicant.stage) >= 6 && <TravelSection applicantId={id} user={user} />}
                {Number(applicant.stage) >= 6 && (
                  <BiometricSection applicantId={id} user={user} loadApplicant={loadApplicant} />
                )}
                {Number(applicant.stage) >= 7 && (
                  <EmbassyInterview applicantId={id} user={user} loadApplicant={loadApplicant} />
                )}
                {Number(applicant.stage) >= 8 && <InterviewTicket applicantId={id} user={user} />}
                {Number(applicant.stage) >= 8 && (
                  <InterviewBiometric applicantId={id} user={user} loadApplicant={loadApplicant} />
                )}
                {Number(applicant.stage) >= 9 && (
                  <VisaCollection applicantId={id} user={user} loadApplicant={loadApplicant} />
                )}
                {Number(applicant.stage) >= 10 && <VisaTravel applicantId={id} user={user} />}
                {Number(applicant.stage) >= 10 && (
                  <ResidencePermit applicantId={id} user={user} loadApplicant={loadApplicant} />
                )}

                {user?.role === "SUPER_USER" && Number(applicant.stage) === 11 && (
                  <button className="btn btnSuccess" type="button" onClick={completeProcess}>
                    Mark as Completed
                  </button>
                )}

                {Number(applicant.stage) === 12 && (
                  <p className="successText">✅ Candidate Arrived / Process Completed</p>
                )}
              </div>
            )}
          </main>
        </div>

        {showEditModal && (
          <ApplicantFormModal
            editData={applicant}
            onClose={() => {
              setShowEditModal(false);
              setEditContext("default");
            }}
            onSaved={() => loadApplicant()}
            onApproveStage={
              user?.role === "SUPER_USER" && editContext === "stage1" && Number(applicant?.stage) === 1
                ? approveStage
                : undefined
            }
            autoApproveAfterSave={
              user?.role === "SUPER_USER" && editContext === "stage1" && Number(applicant?.stage) === 1
            }
          />
        )}
      </div>
    </div>
  );
}

export default ApplicantProfile;

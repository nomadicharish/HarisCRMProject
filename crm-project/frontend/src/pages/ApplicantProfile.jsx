import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import "../styles/forms.css";
import "../styles/applicantProfile.css";
import "../styles/applicantContract.css";
import ApplicantFormModal from "../components/applicant-form/ApplicantFormModal";
import ApplicantSummaryCard from "../components/applicant/ApplicantSummaryCard";
import ApplicantDetailsView from "../components/applicant/ApplicantDetailsView";
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
import { getDocumentReviewState } from "../constants/applicantDocuments";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getApplicantTotalAmount(applicant) {
  return toNumber(
    applicant?.payment?.total ??
      applicant?.paymentsSummary?.applicant?.total ??
      applicant?.totalApplicantPayment ??
      applicant?.totalAmount ??
      applicant?.totalPayment
  );
}

function getApplicantPaidAmount(applicant) {
  return toNumber(
    applicant?.payment?.paid ??
      applicant?.paymentsSummary?.applicant?.paid ??
      applicant?.paidAmount ??
      applicant?.amountPaid ??
      applicant?.initialPaidAmount
  );
}

function ApplicantProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [applicant, setApplicant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState({});
  const [contract, setContract] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [editContext, setEditContext] = useState("default");
  const [resolvedAgencyName, setResolvedAgencyName] = useState("");
  const [resolvedCountryName, setResolvedCountryName] = useState("");

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

  const loadContract = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/contract`);
      setContract(res.data || null);
    } catch (err) {
      console.error(err);
      setContract(null);
    }
  }, [id]);

  useEffect(() => {
    loadApplicant();
    loadUser();
    loadDocuments();
    loadContract();
  }, [loadApplicant, loadUser, loadDocuments, loadContract]);

  useEffect(() => {
    const agencyId = applicant?.agencyId;
    const alreadyHasName = Boolean(applicant?.agencyName || applicant?.agency?.name);
    if (user?.role !== "SUPER_USER") return;
    if (!agencyId || alreadyHasName) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await API.get("/agencies");
        const found = (res.data || []).find((agency) => agency.id === agencyId);
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
        const found = (res.data || []).find((country) => country.id === countryId);
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

  const openEditProfile = (context = "default") => {
    setEditContext(context);
    setShowEditModal(true);
  };

  const openContractSection = () => {
    setShowContractModal(true);
  };

  const canEditApplicant = user?.role === "SUPER_USER";
  const applicantStage = Number(applicant?.stage || 1);
  const pipelineStep = Math.min(applicantStage, 11);

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

  if (loading) return <div style={{ padding: "40px" }}>Loading...</div>;
  if (!applicant) return <div style={{ padding: "40px" }}>Applicant not found</div>;

  const total = getApplicantTotalAmount(applicant);
  const paid = getApplicantPaidAmount(applicant);
  const pending = applicant?.payment?.pending ?? Math.max(0, total - paid);
  const isTotalAmountMissing = total <= 0;
  const isPendingSuperUserApproval =
    applicantStage === 1 && String(applicant?.approvalStatus || "").toLowerCase() === "pending";
  const docReviewState = getDocumentReviewState(documents, applicant);
  const hasCompletedDocumentStage = applicantStage >= 3 && docReviewState.approvedRequired;
  const canAccessDispatch = applicantStage >= 3;
  const canEditDispatch = user?.role === "AGENCY" && applicantStage >= 3 && applicantStage < 5;
  const canShowDispatchHeaderButton = canEditDispatch || applicantStage === 4;
  const canIssueContract = applicantStage === 4 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
  const isContractPendingApproval = applicantStage === 4 && contract?.status === "PENDING";
  const isContractCompleted = applicantStage >= 5 && contract?.status === "APPROVED";
  const hasDocuments = Object.keys(documents || {}).length > 0;
  const shouldShowDocumentAction =
    !hasCompletedDocumentStage &&
    applicantStage >= 2 &&
    (user?.role !== "SUPER_USER" || hasDocuments || docReviewState.uploadedRequired || docReviewState.pendingRequired);
  const documentsButtonLabel = !shouldShowDocumentAction
    ? ""
    : user?.role === "SUPER_USER"
    ? "Verify Documents"
    : docReviewState.rejectedRequired
    ? "Reupload Document"
    : "Upload Documents";
  const documentRowSubtitle = hasCompletedDocumentStage
    ? "All required documents approved"
    : docReviewState.rejectedRequired
    ? "Admin rejected few documents"
    : docReviewState.pendingRequired
    ? "Document uploaded. Pending admin approval"
    : "Upload relevant documents for admin approval";
  const pipelineBannerText = isPendingSuperUserApproval
    ? "Candidate pending for approval"
    : applicantStage === 1
    ? "Complete the candidate profile for approval"
    : applicantStage >= 5
    ? "Pending embassy appointment."
    : applicantStage === 4
    ? "Issue of the contract pending."
    : hasCompletedDocumentStage
    ? "Dispatch the document"
    : docReviewState.rejectedRequired
    ? "Few issues found in the documents. Re-upload the rejected files for admin review."
    : docReviewState.pendingRequired
    ? "Documents are pending admin approval"
    : "Complete the document uploading for admin to approve the candidate";
  const documentRowStatus = hasCompletedDocumentStage
    ? "completed"
    : docReviewState.rejectedRequired
    ? "danger"
    : docReviewState.pendingRequired
    ? "warning"
    : applicantStage === 2
    ? "active"
    : "";
  const dispatchRowTitle = applicantStage >= 4 ? "Document Dispatched" : "Dispatch Documents";
  const contractRowTitle = isContractCompleted
    ? "Contract Issued"
    : isContractPendingApproval
    ? "Contract pending super user approval"
    : "Issue of the Contract";
  const contractRowStatus = isContractCompleted
    ? "completed"
    : isContractPendingApproval
    ? "warning"
    : applicantStage === 4
    ? "active"
    : "";
  const headerActionLabel = canIssueContract
    ? "Issue Contract"
    : canShowDispatchHeaderButton
    ? canEditDispatch
      ? "Dispatch Document"
      : "Documents Dispatched"
    : applicantStage === 1 && canEditApplicant
    ? "Approve Profile"
    : documentsButtonLabel;

  const handleShowDocuments = () => {
    navigate(`/applicants/${id}/documents`);
  };

  const handleShowDispatch = () => {
    navigate(`/applicants/${id}/dispatch`);
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
              pendingDisplayValue={isTotalAmountMissing ? "Enter Total Amount" : undefined}
              canEdit={canEditApplicant}
              onEdit={() => openEditProfile("default")}
              onViewMore={() => setShowMore((value) => !value)}
              onPendingClick={isTotalAmountMissing && canEditApplicant ? () => openEditProfile("default") : undefined}
              agencyName={resolvedAgencyName}
              countryName={resolvedCountryName}
            />
          </aside>

          <main className="applicantProfileMain">
            <ApplicantPipelineList
              currentStep={pipelineStep}
              totalSteps={11}
              onUploadDocuments={handleShowDocuments}
              canUploadDocuments={shouldShowDocumentAction}
              onHeaderAction={
                canIssueContract
                  ? openContractSection
                  : canShowDispatchHeaderButton
                  ? handleShowDispatch
                  : applicantStage === 1 && canEditApplicant
                  ? () => openEditProfile("stage1")
                  : shouldShowDocumentAction
                  ? handleShowDocuments
                  : undefined
              }
              headerActionLabel={headerActionLabel}
              canHeaderAction={
                canIssueContract
                  ? true
                  : canShowDispatchHeaderButton
                  ? true
                  : applicantStage === 1
                  ? canEditApplicant
                  : shouldShowDocumentAction
              }
              uploadButtonLabel={documentsButtonLabel}
              documentRowSubtitle={documentRowSubtitle}
              dispatchRowTitle={dispatchRowTitle}
              contractRowTitle={contractRowTitle}
              contractRowStatus={contractRowStatus}
              bannerText={pipelineBannerText}
              documentRowStatus={documentRowStatus}
              onCandidateAccountCreation={() => openEditProfile("stage1")}
              onDispatchDocuments={canAccessDispatch ? handleShowDispatch : undefined}
              onContractAction={applicantStage >= 4 ? openContractSection : undefined}
            />

            {showMore && <ApplicantDetailsView applicant={applicant} />}

            {showMore && (
              <div className="moreSection">
                {Number(applicant.stage) >= 3 &&
                  !["SUPER_USER", "EMPLOYER"].includes(user?.role) && (
                    <DispatchSection applicantId={id} canEdit={false} compact={true} />
                  )}
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

        <ContractSection
          applicantId={id}
          user={user}
          open={showContractModal}
          onClose={() => setShowContractModal(false)}
          onUpdated={async () => {
            await Promise.all([loadApplicant(), loadContract()]);
          }}
        />
      </div>
    </div>
  );
}

export default ApplicantProfile;

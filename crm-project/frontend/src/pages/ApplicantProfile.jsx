import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import "../styles/forms.css";
import "../styles/applicantProfile.css";
import "../styles/applicantContract.css";
import ApplicantFormModal from "../components/applicant-form/ApplicantFormModal";
import ApplicantSummaryCard from "../components/applicant/ApplicantSummaryCard";
import ApplicantPipelineList from "../components/applicant/ApplicantPipelineList";
import ContractSection from "../components/ContractSection";
import EmbassyAppointment from "../components/EmbassyAppointment";
import BiometricSlipModal from "../components/BiometricSlipModal";
import EmbassyInterviewModal from "../components/EmbassyInterviewModal";
import InterviewBiometricModal from "../components/InterviewBiometricModal";
import VisaCollectionModal from "../components/VisaCollectionModal";
import ResidencePermitModal from "../components/ResidencePermitModal";
import ApplicantDetailsModal from "../components/ApplicantDetailsModal";
import DispatchHistoryModal from "../components/DispatchHistoryModal";
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

function formatCompletedStageDate(value) {
  if (!value) return "";
  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : typeof value === "object" && value._seconds
      ? new Date(value._seconds * 1000)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString(undefined, { month: "short" });
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function ApplicantProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [applicant, setApplicant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState({});
  const [contract, setContract] = useState(null);
  const [embassyAppointment, setEmbassyAppointment] = useState(null);
  const [biometricSlip, setBiometricSlip] = useState(null);
  const [embassyInterview, setEmbassyInterview] = useState(null);
  const [interviewTicket, setInterviewTicket] = useState(null);
  const [interviewBiometric, setInterviewBiometric] = useState(null);
  const [visaCollection, setVisaCollection] = useState(null);
  const [visaTravel, setVisaTravel] = useState(null);
  const [residencePermit, setResidencePermit] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showEmbassyAppointmentModal, setShowEmbassyAppointmentModal] = useState(false);
  const [showBiometricSlipModal, setShowBiometricSlipModal] = useState(false);
  const [showEmbassyInterviewModal, setShowEmbassyInterviewModal] = useState(false);
  const [showInterviewBiometricModal, setShowInterviewBiometricModal] = useState(false);
  const [showVisaCollectionModal, setShowVisaCollectionModal] = useState(false);
  const [showResidencePermitModal, setShowResidencePermitModal] = useState(false);
  const [editContext, setEditContext] = useState("default");
  const [resolvedAgencyName, setResolvedAgencyName] = useState("");
  const [resolvedCountryName, setResolvedCountryName] = useState("");
  const [showCompleteProcessModal, setShowCompleteProcessModal] = useState(false);
  const [showApplicantDetailsModal, setShowApplicantDetailsModal] = useState(false);
  const [showDispatchHistoryModal, setShowDispatchHistoryModal] = useState(false);

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

  const loadEmbassyAppointment = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/embassy-appointment`);
      setEmbassyAppointment(res.data || null);
    } catch (err) {
      console.error(err);
      setEmbassyAppointment(null);
    }
  }, [id]);

  const loadBiometricSlip = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/biometric`);
      setBiometricSlip(res.data || null);
    } catch (err) {
      console.error(err);
      setBiometricSlip(null);
    }
  }, [id]);

  const loadEmbassyInterview = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/interview`);
      setEmbassyInterview(res.data || null);
    } catch (err) {
      console.error(err);
      setEmbassyInterview(null);
    }
  }, [id]);

  const loadInterviewTicket = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/interview-ticket`);
      setInterviewTicket(res.data || null);
    } catch (err) {
      console.error(err);
      setInterviewTicket(null);
    }
  }, [id]);

  const loadInterviewBiometric = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/interview-biometric`);
      setInterviewBiometric(res.data || null);
    } catch (err) {
      console.error(err);
      setInterviewBiometric(null);
    }
  }, [id]);

  const loadVisaCollection = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/visa-collection`);
      setVisaCollection(res.data || null);
    } catch (err) {
      console.error(err);
      setVisaCollection(null);
    }
  }, [id]);

  const loadVisaTravel = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/visa-travel`);
      setVisaTravel(res.data || null);
    } catch (err) {
      console.error(err);
      setVisaTravel(null);
    }
  }, [id]);

  const loadResidencePermit = useCallback(async () => {
    try {
      const res = await API.get(`/applicants/${id}/residence-permit`);
      setResidencePermit(res.data || null);
    } catch (err) {
      console.error(err);
      setResidencePermit(null);
    }
  }, [id]);

  useEffect(() => {
    loadApplicant();
    loadUser();
    loadDocuments();
    loadContract();
    loadEmbassyAppointment();
    loadBiometricSlip();
    loadEmbassyInterview();
    loadInterviewTicket();
    loadInterviewBiometric();
    loadVisaCollection();
    loadVisaTravel();
    loadResidencePermit();
  }, [
    loadApplicant,
    loadUser,
    loadDocuments,
    loadContract,
    loadEmbassyAppointment,
    loadBiometricSlip,
    loadEmbassyInterview,
    loadInterviewTicket,
    loadInterviewBiometric,
    loadVisaCollection,
    loadVisaTravel,
    loadResidencePermit
  ]);

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

  const openEmbassyAppointmentSection = () => {
    setShowEmbassyAppointmentModal(true);
  };

  const openBiometricSlipSection = () => {
    setShowBiometricSlipModal(true);
  };

  const openEmbassyInterviewSection = () => {
    setShowEmbassyInterviewModal(true);
  };

  const openInterviewBiometricSection = () => {
    setShowInterviewBiometricModal(true);
  };

  const openVisaCollectionSection = () => {
    setShowVisaCollectionModal(true);
  };

  const openResidencePermitSection = () => {
    setShowResidencePermitModal(true);
  };

  const applicantStage = Number(applicant?.stage || 1);
  const isProfileApproved =
    String(applicant?.approvalStatus || "").toLowerCase() === "approved" || applicantStage >= 2;
  const canApproveProfile = user?.role === "SUPER_USER" && applicantStage === 1;
  const canEditApplicant = user?.role === "SUPER_USER" && isProfileApproved;
  const isEmployer = user?.role === "EMPLOYER";
  const candidateArrivalCompletedDate = formatCompletedStageDate(applicant?.completedAt);

  const confirmCompleteProcess = async () => {
    try {
      await API.patch(`/applicants/${id}/complete`);
      alert("Process completed successfully");
      await loadApplicant();
      setShowCompleteProcessModal(false);
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
  const canInitiateEmbassyAppointment =
    applicantStage === 5 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
  const hasTravelDetails = Boolean(
    applicant?.travelDetails?.travelDate || applicant?.travelDetails?.time || applicant?.travelDetails?.fileUrl
  );
  const hasBiometricSlip = Boolean(applicant?.biometricSlip?.fileUrl || biometricSlip?.fileUrl);
  const canAddTicket = applicantStage === 6 && user?.role === "AGENCY" && !hasTravelDetails;
  const canAddBiometricSlip = applicantStage === 6 && user?.role === "AGENCY" && hasTravelDetails && !hasBiometricSlip;
  const canAddEmbassyInterview =
    applicantStage === 7 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
  const hasInterviewTicket = Boolean(interviewTicket?.date || interviewTicket?.time || interviewTicket?.fileUrl);
  const hasInterviewBiometric = Boolean(interviewBiometric?.fileUrl || applicant?.interviewBiometric?.fileUrl);
  const canAddInterviewTicket = applicantStage === 8 && user?.role === "AGENCY" && !hasInterviewTicket;
  const canAddInterviewBiometric =
    applicantStage === 8 && user?.role === "AGENCY" && hasInterviewTicket && !hasInterviewBiometric;
  const hasVisaTravel = Boolean(visaTravel?.date || visaTravel?.time || visaTravel?.fileUrl);
  const hasResidencePermit = Boolean(
    (residencePermit?.frontUrl || applicant?.residencePermit?.frontUrl) &&
      (residencePermit?.backUrl || applicant?.residencePermit?.backUrl)
  );
  const canAddVisaCollection = applicantStage === 9 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
  const canAddVisaTravel = applicantStage === 10 && user?.role === "AGENCY" && !hasVisaTravel;
  const canAddResidencePermit = applicantStage === 10 && user?.role === "AGENCY" && hasVisaTravel && !hasResidencePermit;
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
    ? ""
    : docReviewState.rejectedRequired
    ? "Admin rejected few documents"
    : docReviewState.pendingRequired
    ? "Document uploaded. Pending admin approval"
    : "Upload relevant documents for admin approval";
  const pipelineBannerText = isPendingSuperUserApproval
    ? "Candidate pending for approval"
    : applicantStage === 1
    ? "Complete the candidate profile for approval"
    : applicantStage >= 12
    ? "Candidate Arrived and Process Completed"
    : applicantStage === 11
    ? "Candidate arrival pending"
    : applicantStage === 10
    ? hasVisaTravel
      ? "Pending Residence Permit"
      : "Travel ticket upload pending"
    : applicantStage === 9
    ? "Visa collection Initiation pending"
    : applicantStage === 8
    ? hasInterviewBiometric
      ? "Pending visa collection"
      : hasInterviewTicket
      ? "Pending Biometric slip"
      : "Travel ticket upload pending"
    : applicantStage === 7
    ? "Embassy Interview pending"
    : applicantStage === 6
    ? hasBiometricSlip
      ? "Embassy Interview pending"
      : hasTravelDetails
      ? "Pending Biometric slip"
      : "Ticket upload pending"
    : applicantStage === 5
    ? "Pending embassy appointment."
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
  const embassyAppointmentRowTitle =
    applicantStage === 5 && !embassyAppointment ? "Initiate Embassy Appointment" : "Embassy Appointment Initiated";
  const embassyAppointmentCompletedRowTitle =
    applicantStage > 6 ? "Embassy Appointment Completed" : "Embassy Appointment";
  const embassyAppointmentCompletedRowSubtitle =
    applicantStage === 6
      ? hasTravelDetails
        ? hasBiometricSlip
          ? ""
          : "Pending Biometric slip"
        : "Travel ticket upload pending"
      : "";
  const embassyAppointmentCompletedRowStatus =
    applicantStage === 6 ? "warning" : "";
  const embassyInterviewRowTitle =
    applicantStage === 7 && !embassyInterview ? "Initiate Embassy Interview" : "Embassy Interview Initiated";
  const embassyInterviewCompletedRowTitle =
    applicantStage > 8 ? "Embassy Interview Completed" : "Complete Embassy Interview";
  const embassyInterviewCompletedRowSubtitle =
    applicantStage === 8
      ? hasInterviewTicket
        ? hasInterviewBiometric
          ? ""
          : "Pending Biometric slip"
        : "Travel ticket upload pending"
      : "";
  const embassyInterviewCompletedRowStatus = applicantStage === 8 ? "warning" : "";
  const visaCollectionRowTitle =
    applicantStage > 9 ? "Visa Collection Initiated" : "Initiate Visa Collection";
  const visaCollectionRowStatus =
    applicantStage === 9 && visaCollection?.status === "PENDING"
      ? "warning"
      : applicantStage === 9
      ? "active"
      : "";
  const visaCollectionCompletedRowTitle =
    applicantStage > 10 ? "Visa Collection Completed" : "Complete Visa Collection";
  const visaCollectionCompletedRowSubtitle =
    applicantStage === 10
      ? hasVisaTravel
        ? hasResidencePermit
          ? ""
          : "Pending Residence Permit"
        : "Travel ticket upload pending"
      : "";
  const visaCollectionCompletedRowStatus = applicantStage === 10 ? "warning" : "";
  const candidateArrivalRowTitle =
    applicantStage >= 12
      ? `Candidate Arrived and Process Completed${
          candidateArrivalCompletedDate ? ` on ${candidateArrivalCompletedDate}` : ""
        }`
      : "Arrival of Candidate";
  const candidateArrivalRowSubtitle = applicantStage === 11 ? "Candidate arrival pending" : "";
  const headerActionLabel = canIssueContract
    ? "Issue Contract"
    : applicantStage === 11 && user?.role === "SUPER_USER"
    ? "Candidate Arrived"
    : canAddResidencePermit
    ? "Add Residence Permit"
    : canAddVisaTravel
    ? "Add Ticket"
    : canAddVisaCollection
    ? "Add visa collection Details"
    : canAddInterviewBiometric
    ? "Add Biometric Slip"
    : canAddInterviewTicket
    ? "Add Ticket"
    : canAddEmbassyInterview
    ? "Add Embassy Interview"
    : canAddBiometricSlip
    ? "Add Biometric Slip"
    : canAddTicket
    ? "Add Ticket"
    : canInitiateEmbassyAppointment
    ? "Initiate Embassy Appointment"
    : canShowDispatchHeaderButton
    ? canEditDispatch
      ? "Dispatch Document"
      : "Documents Dispatched"
    : applicantStage >= 12
    ? ""
    : applicantStage === 1 && canApproveProfile
    ? "Approve Profile"
    : documentsButtonLabel;

  const handleShowDocuments = () => {
    navigate(`/applicants/${id}/documents`);
  };

  const handleShowDispatch = () => {
    navigate(`/applicants/${id}/dispatch`);
  };

  const handleShowProfileDetails = () => {
    setShowApplicantDetailsModal(true);
  };

  const handleShowDispatchDetails = () => {
    setShowDispatchHistoryModal(true);
  };

  const approveStage = async () => {
    await API.patch(`/applicants/${id}/approve-stage`);
    await loadApplicant();
  };

  const headerActionHandler = canIssueContract
    ? openContractSection
    : applicantStage === 11 && user?.role === "SUPER_USER"
    ? () => setShowCompleteProcessModal(true)
    : canAddResidencePermit
    ? openResidencePermitSection
    : canAddVisaTravel
    ? openVisaCollectionSection
    : canAddVisaCollection
    ? openVisaCollectionSection
    : canAddInterviewBiometric
    ? openInterviewBiometricSection
    : canAddInterviewTicket
    ? openEmbassyInterviewSection
    : canAddEmbassyInterview
    ? openEmbassyInterviewSection
    : canAddBiometricSlip
    ? openBiometricSlipSection
    : canAddTicket
    ? openEmbassyAppointmentSection
    : canInitiateEmbassyAppointment
    ? openEmbassyAppointmentSection
    : canShowDispatchHeaderButton
    ? handleShowDispatch
    : applicantStage === 1 && canApproveProfile
    ? () => openEditProfile("stage1")
    : shouldShowDocumentAction
    ? handleShowDocuments
    : undefined;

  const canHeaderAction =
    canIssueContract ||
    (applicantStage === 11 && user?.role === "SUPER_USER") ||
    canAddResidencePermit ||
    canAddVisaTravel ||
    canAddVisaCollection ||
    canAddInterviewBiometric ||
    canAddInterviewTicket ||
    canAddEmbassyInterview ||
    canAddBiometricSlip ||
    canAddTicket ||
    canInitiateEmbassyAppointment ||
    canShowDispatchHeaderButton ||
    (applicantStage === 1 ? canApproveProfile : shouldShowDocumentAction);

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
              canEdit={false}
              onEdit={() => openEditProfile("default")}
              onPendingClick={isTotalAmountMissing && canEditApplicant ? () => openEditProfile("default") : undefined}
              agencyName={resolvedAgencyName}
              countryName={resolvedCountryName}
              showAgency={user?.role === "SUPER_USER"}
              showPendingAmount={!isEmployer}
            />
          </aside>

          <main className="applicantProfileMain">
            <ApplicantPipelineList
              currentStep={applicantStage}
              totalSteps={11}
              onUploadDocuments={handleShowDocuments}
              onHeaderAction={headerActionHandler}
              headerActionLabel={headerActionLabel}
              canHeaderAction={canHeaderAction}
              activeStepActionLabel={headerActionLabel}
              canActiveStepAction={canHeaderAction}
              documentRowSubtitle={documentRowSubtitle}
              dispatchRowTitle={dispatchRowTitle}
              contractRowTitle={contractRowTitle}
              contractRowStatus={contractRowStatus}
              embassyAppointmentRowTitle={embassyAppointmentRowTitle}
              embassyAppointmentCompletedRowTitle={embassyAppointmentCompletedRowTitle}
              embassyAppointmentCompletedRowSubtitle={embassyAppointmentCompletedRowSubtitle}
              embassyAppointmentCompletedRowStatus={embassyAppointmentCompletedRowStatus}
              embassyInterviewRowTitle={embassyInterviewRowTitle}
              embassyInterviewCompletedRowTitle={embassyInterviewCompletedRowTitle}
              embassyInterviewCompletedRowSubtitle={embassyInterviewCompletedRowSubtitle}
              embassyInterviewCompletedRowStatus={embassyInterviewCompletedRowStatus}
              visaCollectionRowTitle={visaCollectionRowTitle}
              visaCollectionRowStatus={visaCollectionRowStatus}
              visaCollectionCompletedRowTitle={visaCollectionCompletedRowTitle}
              visaCollectionCompletedRowSubtitle={visaCollectionCompletedRowSubtitle}
              visaCollectionCompletedRowStatus={visaCollectionCompletedRowStatus}
              candidateArrivalRowTitle={candidateArrivalRowTitle}
              candidateArrivalRowSubtitle={candidateArrivalRowSubtitle}
              bannerText={pipelineBannerText}
              documentRowStatus={documentRowStatus}
              onCandidateAccountCreation={
                applicantStage === 1 && canApproveProfile ? () => openEditProfile("stage1") : handleShowProfileDetails
              }
              onDispatchDocuments={
                applicantStage >= 4 ? handleShowDispatchDetails : canAccessDispatch ? handleShowDispatch : undefined
              }
              onContractAction={applicantStage >= 4 ? openContractSection : undefined}
              onEmbassyAppointmentAction={applicantStage >= 5 ? openEmbassyAppointmentSection : undefined}
              onBiometricSlipAction={
                applicantStage >= 6
                  ? hasTravelDetails
                    ? openBiometricSlipSection
                    : openEmbassyAppointmentSection
                  : undefined
              }
              onEmbassyInterviewAction={applicantStage >= 7 ? openEmbassyInterviewSection : undefined}
              onInterviewCompletionAction={
                applicantStage >= 8
                  ? hasInterviewTicket
                    ? openInterviewBiometricSection
                    : openEmbassyInterviewSection
                  : undefined
              }
              onVisaCollectionAction={applicantStage >= 9 ? openVisaCollectionSection : undefined}
              onVisaCompletionAction={
                applicantStage >= 10
                  ? hasVisaTravel
                    ? openResidencePermitSection
                    : openVisaCollectionSection
                  : undefined
              }
              onCandidateArrivalAction={undefined}
            />

            {Number(applicant.stage) === 12 ? <p className="successText">{candidateArrivalRowTitle}</p> : null}
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

        <EmbassyAppointment
          applicantId={id}
          user={user}
          biometricSlip={biometricSlip || applicant?.biometricSlip || null}
          open={showEmbassyAppointmentModal}
          onClose={() => setShowEmbassyAppointmentModal(false)}
          onUpdated={async () => {
            await Promise.all([loadApplicant(), loadEmbassyAppointment(), loadBiometricSlip()]);
          }}
        />

        <BiometricSlipModal
          applicantId={id}
          user={user}
          fallbackBiometricSlip={applicant?.biometricSlip || null}
          open={showBiometricSlipModal}
          onClose={() => setShowBiometricSlipModal(false)}
          onUpdated={async () => {
            await Promise.all([loadApplicant(), loadBiometricSlip()]);
          }}
        />

        <EmbassyInterviewModal
          applicantId={id}
          user={user}
          interviewBiometric={interviewBiometric || applicant?.interviewBiometric || null}
          open={showEmbassyInterviewModal}
          onClose={() => setShowEmbassyInterviewModal(false)}
          onUpdated={async () => {
            await Promise.all([loadApplicant(), loadEmbassyInterview(), loadInterviewTicket(), loadInterviewBiometric()]);
          }}
        />

        <InterviewBiometricModal
          applicantId={id}
          user={user}
          fallbackInterviewBiometric={applicant?.interviewBiometric || null}
          open={showInterviewBiometricModal}
          onClose={() => setShowInterviewBiometricModal(false)}
          onUpdated={async () => {
            await Promise.all([loadApplicant(), loadInterviewBiometric()]);
          }}
        />

        <VisaCollectionModal
          applicantId={id}
          user={user}
          residencePermit={residencePermit || applicant?.residencePermit || null}
          open={showVisaCollectionModal}
          onClose={() => setShowVisaCollectionModal(false)}
          onUpdated={async () => {
            await Promise.all([loadApplicant(), loadVisaCollection(), loadVisaTravel(), loadResidencePermit()]);
          }}
        />

        <ResidencePermitModal
          applicantId={id}
          user={user}
          fallbackResidencePermit={applicant?.residencePermit || null}
          open={showResidencePermitModal}
          onClose={() => setShowResidencePermitModal(false)}
          onUpdated={async () => {
            await Promise.all([loadApplicant(), loadResidencePermit()]);
          }}
        />

        <ApplicantDetailsModal
          applicant={applicant}
          open={showApplicantDetailsModal}
          onClose={() => setShowApplicantDetailsModal(false)}
          showPaymentDetails={!isEmployer}
          agencyName={user?.role === "SUPER_USER" ? resolvedAgencyName : ""}
          countryName={resolvedCountryName}
        />

        <DispatchHistoryModal
          applicantId={id}
          open={showDispatchHistoryModal}
          onClose={() => setShowDispatchHistoryModal(false)}
        />

        {showCompleteProcessModal ? (
          <div className="contractModalOverlay">
            <div className="contractModalCard">
              <div className="workflowModalTopBar">
                <div className="workflowModalTopBarTitle">Candidate Arrived</div>
                <button
                  type="button"
                  className="workflowModalCloseBtn"
                  onClick={() => setShowCompleteProcessModal(false)}
                >
                  x
                </button>
              </div>

              <div className="contractInfoCard">
                <div className="contractInfoRow">
                  <span>Do you want to complete the process</span>
                </div>
              </div>

              <div className="contractActionRow">
                <button
                  type="button"
                  className="btn btnSecondary"
                  onClick={() => setShowCompleteProcessModal(false)}
                >
                  No
                </button>
                <button type="button" className="btn btnSuccess" onClick={confirmCompleteProcess}>
                  Yes
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ApplicantProfile;

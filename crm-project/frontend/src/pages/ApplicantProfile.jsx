import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import { getCached, invalidateCache, prefetchCached, readCached, writeCached } from "../services/cachedApi";
import "../styles/forms.css";
import "../styles/applicantProfile.css";
import "../styles/applicantContract.css";
import ApplicantSummaryCard from "../components/applicant/ApplicantSummaryCard";
import ApplicantPipelineList from "../components/applicant/ApplicantPipelineList";
import DashboardTopbar from "../components/common/DashboardTopbar";
import ApplicantProfileModalStack from "../components/applicant-profile/ApplicantProfileModalStack";
import ApplicantFormModal from "../components/applicant-form/ApplicantFormModal";
import BlockingLoader from "../components/common/BlockingLoader";
import PageLoader from "../components/common/PageLoader";
import useApplicantPaymentState from "../hooks/useApplicantPaymentState";
import useApplicantWorkflowLabels from "../hooks/useApplicantWorkflowLabels";
import { getStoredUser } from "../utils/auth";
import { buildApplicantSidebarCache, getApplicantSidebarCacheKey } from "../utils/applicantSidebarCache";

function ApplicantProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const initialWorkflowBundle = readCached(`/applicants/${id}/workflow-bundle`, {
    params: { includeDetails: "false" }
  });
  const initialSidebarProfile = readCached(getApplicantSidebarCacheKey(id)) || null;
  const [applicant, setApplicant] = useState(initialWorkflowBundle?.applicant || null);
  const [loading, setLoading] = useState(!initialWorkflowBundle);
  const [user, setUser] = useState(() => getStoredUser());
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
  const [showReadOnlyProfileModal, setShowReadOnlyProfileModal] = useState(false);
  const [readOnlyProfileData, setReadOnlyProfileData] = useState(null);
  const [showDispatchHistoryModal, setShowDispatchHistoryModal] = useState(false);
  const [approvingStage, setApprovingStage] = useState(false);
  const [sidebarPendingOverride, setSidebarPendingOverride] = useState(initialSidebarProfile?.pendingAmount ?? null);
  const profileCacheTtlMs = 15000;

  const loadUser = useCallback(async () => {
    if (user) return;
    try {
      const data = await getCached("/auth/me", { ttlMs: 120000 });
      setUser(data);
    } catch (err) {
      console.error(err);
      setUser(null);
    }
  }, [user]);

  const loadProfileWorkflowData = useCallback(
    async ({ force = false } = {}) => {
      try {
        if (!force) setLoading(true);
        const data = await getCached(`/applicants/${id}/workflow-bundle`, {
          params: { includeDetails: "false" },
          ttlMs: profileCacheTtlMs,
          force
        });
        setApplicant(data?.applicant || null);
        setDocuments({});
        setContract(data?.contract || null);
        setEmbassyAppointment(data?.embassyAppointment || null);
        setBiometricSlip(data?.biometricSlip || null);
        setEmbassyInterview(data?.embassyInterview || null);
        setInterviewTicket(data?.interviewTicket || null);
        setInterviewBiometric(data?.interviewBiometric || null);
        setVisaCollection(data?.visaCollection || null);
        setVisaTravel(data?.visaTravel || null);
        setResidencePermit(data?.residencePermit || null);
      } catch (err) {
        console.error(err);
        setApplicant(null);
      } finally {
        setLoading(false);
      }
    },
    [id, profileCacheTtlMs]
  );

  useEffect(() => {
    loadUser();
    loadProfileWorkflowData();
  }, [loadProfileWorkflowData, loadUser]);

  useEffect(() => {
    setResolvedAgencyName(applicant?.agencyName || applicant?.agency?.name || "");
  }, [applicant?.agencyName, applicant?.agency?.name]);

  useEffect(() => {
    setResolvedCountryName(applicant?.countryName || applicant?.country || "");
  }, [applicant?.countryName, applicant?.country]);

  const openEditProfile = (context = "default") => {
    navigate(`/applicants/${id}/edit${context === "stage1" ? "?context=stage1" : ""}`);
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

  const {
    pending,
    formattedPendingAmount,
    isTotalAmountMissing
  } = useApplicantPaymentState({
    applicant
  });

  useEffect(() => {
    if (!applicant) return;

    const sidebarCache = buildApplicantSidebarCache({
      applicant,
      pendingAmount: pending,
      countryName: resolvedCountryName,
      agencyName: resolvedAgencyName
    });

    if (!sidebarCache) return;

    setSidebarPendingOverride(sidebarCache.pendingAmount);
    writeCached(getApplicantSidebarCacheKey(id), sidebarCache, { ttlMs: profileCacheTtlMs });
  }, [applicant, id, pending, profileCacheTtlMs, resolvedAgencyName, resolvedCountryName]);

  const {
    applicantStage,
    canApproveProfile,
    isEmployer,
    canAccessDispatch,
    canIssueContract,
    canInitiateEmbassyAppointment,
    canAddTicket,
    canAddBiometricSlip,
    canAddEmbassyInterview,
    canAddInterviewTicket,
    canAddInterviewBiometric,
    canAddVisaCollection,
    canAddVisaTravel,
    canAddResidencePermit,
    canShowDispatchHeaderButton,
    shouldShowDocumentAction,
    hasTravelDetails,
    hasInterviewTicket,
    hasVisaTravel,
    headerActionLabel,
    canHeaderAction,
    documentRowSubtitle,
    dispatchRowTitle,
    contractRowTitle,
    contractRowStatus,
    embassyAppointmentRowTitle,
    embassyAppointmentCompletedRowTitle,
    embassyAppointmentCompletedRowSubtitle,
    embassyAppointmentCompletedRowStatus,
    embassyInterviewRowTitle,
    embassyInterviewRowSubtitle,
    embassyInterviewCompletedRowTitle,
    embassyInterviewCompletedRowSubtitle,
    embassyInterviewCompletedRowStatus,
    visaCollectionRowTitle,
    visaCollectionRowSubtitle,
    visaCollectionRowStatus,
    visaCollectionCompletedRowTitle,
    visaCollectionCompletedRowSubtitle,
    visaCollectionCompletedRowStatus,
    candidateArrivalRowTitle,
    candidateArrivalRowSubtitle,
    pipelineBannerText,
    documentRowStatus
  } = useApplicantWorkflowLabels({
    applicant,
    documents,
    contract,
    embassyAppointment,
    biometricSlip,
    embassyInterview,
    interviewTicket,
    interviewBiometric,
    visaCollection,
    visaTravel,
    residencePermit,
    user
  });

  const confirmCompleteProcess = async () => {
    const previousApplicant = applicant;
    const optimisticNow = Date.now();
    setApplicant((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stage: 12,
        completedAt: optimisticNow
      };
    });

    try {
      await API.patch(`/applicants/${id}/complete`);
      alert("Process completed successfully");
      invalidateCache(`/applicants/${id}`);
      invalidateCache("/applicants");
      invalidateCache(`/applicants/${id}/workflow-bundle`);
      loadProfileWorkflowData({ force: true });
      setShowCompleteProcessModal(false);
    } catch (err) {
      console.error(err);
      setApplicant(previousApplicant);
      alert("Error completing process");
    }
  };

  const refreshWorkflowData = useCallback(() => {
    invalidateCache(`/applicants/${id}`);
    invalidateCache(`/applicants/${id}/documents`);
    invalidateCache(`/applicants/${id}/workflow-bundle`);
    invalidateCache("/applicants");

    loadProfileWorkflowData({ force: true });
  }, [
    id,
    loadProfileWorkflowData
  ]);

  if (loading) return <PageLoader label="Loading applicant profile..." />;
  if (!applicant) return <div style={{ padding: "40px" }}>Applicant not found</div>;


  const handleShowDocuments = () => {
    prefetchCached(`/applicants/${id}/documents-page`, { ttlMs: 15000 });
    navigate(`/applicants/${id}/documents`);
  };

  const handleShowDispatch = () => {
    navigate(`/applicants/${id}/dispatch`);
  };

  const handleShowProfileDetails = () => {
    setShowReadOnlyProfileModal(true);
    setReadOnlyProfileData(applicant || null);
    getCached(`/applicants/${id}`, { ttlMs: 10000 })
      .then((data) => setReadOnlyProfileData(data || applicant || null))
      .catch((error) => {
        console.error(error);
      });
  };

  const handleShowDispatchDetails = () => {
    setShowDispatchHistoryModal(true);
  };

  const approveStage = async () => {
    const previousApplicant = applicant;
    setApprovingStage(true);
    setApplicant((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stage: Math.max(2, Number(prev.stage || 1)),
        approvalStatus: "approved"
      };
    });

    try {
      await API.patch(`/applicants/${id}/approve-stage`);
      invalidateCache(`/applicants/${id}`);
      invalidateCache(`/applicants/${id}/workflow-bundle`);
      invalidateCache("/applicants");
      await loadProfileWorkflowData({ force: true });
    } catch (error) {
      console.error(error);
      setApplicant(previousApplicant);
    } finally {
      setApprovingStage(false);
    }
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

  return (
    <div className="page-container">
      <DashboardTopbar user={user} />
      <div className="page-content applicantProfilePage">
        <div className="applicantProfileLayout">
          <aside className="applicantProfileSidebar">
            <ApplicantSummaryCard
              applicant={applicant}
              pendingAmount={sidebarPendingOverride ?? pending}
              pendingDisplayValue={
                isTotalAmountMissing
                  ? "Enter Total Amount"
                  : `INR ${Number(sidebarPendingOverride ?? pending).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              }
              canEdit={false}
              onEdit={() => openEditProfile("default")}
              onPendingClick={!isEmployer ? () => {
                prefetchCached(`/applicants/${id}/payments-page`, { ttlMs: 15000 });
                navigate(`/applicants/${id}/payments`);
              } : undefined}
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
              canHeaderAction={canHeaderAction && !approvingStage}
              activeStepActionLabel={headerActionLabel}
              canActiveStepAction={canHeaderAction && !approvingStage}
              documentRowSubtitle={documentRowSubtitle}
              dispatchRowTitle={dispatchRowTitle}
              contractRowTitle={contractRowTitle}
              contractRowStatus={contractRowStatus}
              embassyAppointmentRowTitle={embassyAppointmentRowTitle}
              embassyAppointmentCompletedRowTitle={embassyAppointmentCompletedRowTitle}
              embassyAppointmentCompletedRowSubtitle={embassyAppointmentCompletedRowSubtitle}
              embassyAppointmentCompletedRowStatus={embassyAppointmentCompletedRowStatus}
              embassyInterviewRowTitle={embassyInterviewRowTitle}
              embassyInterviewRowSubtitle={embassyInterviewRowSubtitle}
              embassyInterviewCompletedRowTitle={embassyInterviewCompletedRowTitle}
              embassyInterviewCompletedRowSubtitle={embassyInterviewCompletedRowSubtitle}
              embassyInterviewCompletedRowStatus={embassyInterviewCompletedRowStatus}
              visaCollectionRowTitle={visaCollectionRowTitle}
              visaCollectionRowSubtitle={visaCollectionRowSubtitle}
              visaCollectionRowStatus={visaCollectionRowStatus}
              visaCollectionCompletedRowTitle={visaCollectionCompletedRowTitle}
              visaCollectionCompletedRowSubtitle={visaCollectionCompletedRowSubtitle}
              visaCollectionCompletedRowStatus={visaCollectionCompletedRowStatus}
              candidateArrivalRowTitle={candidateArrivalRowTitle}
              candidateArrivalRowSubtitle={candidateArrivalRowSubtitle}
              bannerText={pipelineBannerText}
              documentRowStatus={documentRowStatus}
              onCandidateAccountCreation={handleShowProfileDetails}
              onDispatchDocuments={
                applicantStage >= 4
                  ? handleShowDispatchDetails
                  : canAccessDispatch
                  ? handleShowDispatch
                  : undefined
              }
              onContractAction={applicantStage >= 4 ? openContractSection : undefined}
              onEmbassyAppointmentAction={applicantStage >= 5 ? openEmbassyAppointmentSection : undefined}
              onBiometricSlipAction={
                applicantStage >= 6
                  ? openEmbassyAppointmentSection
                  : undefined
              }
              onEmbassyInterviewAction={applicantStage >= 7 ? openEmbassyInterviewSection : undefined}
              onInterviewCompletionAction={
                applicantStage >= 8
                  ? openEmbassyInterviewSection
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

        <ApplicantProfileModalStack
          id={id}
          user={user}
          applicant={applicant}
          biometricSlip={biometricSlip}
          interviewBiometric={interviewBiometric}
          residencePermit={residencePermit}
          isEmployer={isEmployer}
          resolvedAgencyName={resolvedAgencyName}
          resolvedCountryName={resolvedCountryName}
          showEditModal={showEditModal}
          setShowEditModal={setShowEditModal}
          editContext={editContext}
          setEditContext={setEditContext}
          showContractModal={showContractModal}
          setShowContractModal={setShowContractModal}
          showEmbassyAppointmentModal={showEmbassyAppointmentModal}
          setShowEmbassyAppointmentModal={setShowEmbassyAppointmentModal}
          showBiometricSlipModal={showBiometricSlipModal}
          setShowBiometricSlipModal={setShowBiometricSlipModal}
          showEmbassyInterviewModal={showEmbassyInterviewModal}
          setShowEmbassyInterviewModal={setShowEmbassyInterviewModal}
          showInterviewBiometricModal={showInterviewBiometricModal}
          setShowInterviewBiometricModal={setShowInterviewBiometricModal}
          showVisaCollectionModal={showVisaCollectionModal}
          setShowVisaCollectionModal={setShowVisaCollectionModal}
          showResidencePermitModal={showResidencePermitModal}
          setShowResidencePermitModal={setShowResidencePermitModal}
          showApplicantDetailsModal={showApplicantDetailsModal}
          setShowApplicantDetailsModal={setShowApplicantDetailsModal}
          showDispatchHistoryModal={showDispatchHistoryModal}
          setShowDispatchHistoryModal={setShowDispatchHistoryModal}
          refreshWorkflowData={refreshWorkflowData}
          approveStage={approveStage}
          onSaved={() => {
            invalidateCache(`/applicants/${id}/workflow-bundle`);
            loadProfileWorkflowData({ force: true });
          }}
        />

        {showReadOnlyProfileModal ? (
          <ApplicantFormModal
            user={user}
            editData={readOnlyProfileData || applicant}
            readOnly
            onClose={() => setShowReadOnlyProfileModal(false)}
          />
        ) : null}

        {showCompleteProcessModal ? (
          <div className="contractModalOverlay">
            <div className="contractModalCard">
              <div className="dashboardModalHeader">
                <h3 className="dashboardModalTitle">Candidate Arrived</h3>
                <button
                  type="button"
                  className="dashboardModalCloseBtn"
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

        <BlockingLoader open={approvingStage} label="Approving candidate and updating pipeline..." />
      </div>
    </div>
  );
}

export default ApplicantProfile;

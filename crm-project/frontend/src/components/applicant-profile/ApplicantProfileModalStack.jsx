import React, { Suspense, lazy } from "react";

const ContractSection = lazy(() => import("../ContractSection"));
const EmbassyAppointment = lazy(() => import("../EmbassyAppointment"));
const BiometricSlipModal = lazy(() => import("../BiometricSlipModal"));
const EmbassyInterviewModal = lazy(() => import("../EmbassyInterviewModal"));
const InterviewBiometricModal = lazy(() => import("../InterviewBiometricModal"));
const VisaCollectionModal = lazy(() => import("../VisaCollectionModal"));
const ResidencePermitModal = lazy(() => import("../ResidencePermitModal"));
const ApplicantDetailsModal = lazy(() => import("../ApplicantDetailsModal"));
const DispatchHistoryModal = lazy(() => import("../DispatchHistoryModal"));

function ApplicantProfileModalStack({
  id,
  user,
  applicant,
  biometricSlip,
  interviewBiometric,
  residencePermit,
  isEmployer,
  resolvedAgencyName,
  resolvedCountryName,
  showContractModal,
  setShowContractModal,
  showEmbassyAppointmentModal,
  setShowEmbassyAppointmentModal,
  showBiometricSlipModal,
  setShowBiometricSlipModal,
  showEmbassyInterviewModal,
  setShowEmbassyInterviewModal,
  showInterviewBiometricModal,
  setShowInterviewBiometricModal,
  showVisaCollectionModal,
  setShowVisaCollectionModal,
  showResidencePermitModal,
  setShowResidencePermitModal,
  showApplicantDetailsModal,
  setShowApplicantDetailsModal,
  showDispatchHistoryModal,
  setShowDispatchHistoryModal,
  refreshWorkflowData,
  approveStage,
  onSaved
}) {
  return (
    <Suspense fallback={null}>
      <ContractSection
        applicantId={id}
        user={user}
        open={showContractModal}
        onClose={() => setShowContractModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <EmbassyAppointment
        applicantId={id}
        user={user}
        biometricSlip={biometricSlip || applicant?.biometricSlip || null}
        open={showEmbassyAppointmentModal}
        onClose={() => setShowEmbassyAppointmentModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <BiometricSlipModal
        applicantId={id}
        user={user}
        fallbackBiometricSlip={applicant?.biometricSlip || null}
        open={showBiometricSlipModal}
        onClose={() => setShowBiometricSlipModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <EmbassyInterviewModal
        applicantId={id}
        user={user}
        interviewBiometric={interviewBiometric || applicant?.interviewBiometric || null}
        open={showEmbassyInterviewModal}
        onClose={() => setShowEmbassyInterviewModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <InterviewBiometricModal
        applicantId={id}
        user={user}
        fallbackInterviewBiometric={applicant?.interviewBiometric || null}
        open={showInterviewBiometricModal}
        onClose={() => setShowInterviewBiometricModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <VisaCollectionModal
        applicantId={id}
        user={user}
        residencePermit={residencePermit || applicant?.residencePermit || null}
        open={showVisaCollectionModal}
        onClose={() => setShowVisaCollectionModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <ResidencePermitModal
        applicantId={id}
        user={user}
        fallbackResidencePermit={applicant?.residencePermit || null}
        open={showResidencePermitModal}
        onClose={() => setShowResidencePermitModal(false)}
        onUpdated={refreshWorkflowData}
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
    </Suspense>
  );
}

export default ApplicantProfileModalStack;

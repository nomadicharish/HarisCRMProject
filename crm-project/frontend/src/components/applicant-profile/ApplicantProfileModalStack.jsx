import React, { Suspense, lazy } from "react";

const ContractSection = lazy(() => import("../ContractSection"));
const SignedContractModal = lazy(() => import("../SignedContractModal"));
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
  visaCollectionTravel,
  residencePermit,
  isEmployer,
  resolvedAgencyName,
  resolvedCountryName,
  showContractModal,
  setShowContractModal,
  showSignedContractModal,
  setShowSignedContractModal,
  showEmbassyAppointmentModal,
  setShowEmbassyAppointmentModal,
  editAppointmentTravel = false,
  setEditAppointmentTravel,
  showBiometricSlipModal,
  setShowBiometricSlipModal,
  showEmbassyInterviewModal,
  setShowEmbassyInterviewModal,
  editInterviewTravel = false,
  setEditInterviewTravel,
  showInterviewBiometricModal,
  setShowInterviewBiometricModal,
  showVisaCollectionModal,
  setShowVisaCollectionModal,
  visaCollectionModalMode = "collection",
  editVisaCollectionTravel = false,
  setEditVisaCollectionTravel,
  showResidencePermitModal,
  setShowResidencePermitModal,
  showApplicantDetailsModal,
  setShowApplicantDetailsModal,
  showDispatchHistoryModal,
  setShowDispatchHistoryModal,
  refreshWorkflowData
}) {
  return (
    <Suspense fallback={null}>
      <ContractSection
        applicantId={id}
        user={user}
        applicant={applicant}
        open={showContractModal}
        onClose={() => setShowContractModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <SignedContractModal
        applicantId={id}
        user={user}
        fallbackSignedContract={applicant?.signedContract || null}
        open={showSignedContractModal}
        onClose={() => setShowSignedContractModal(false)}
        onUpdated={refreshWorkflowData}
      />

      <EmbassyAppointment
        applicantId={id}
        user={user}
        applicant={applicant}
        biometricSlip={biometricSlip || applicant?.biometricSlip || null}
        open={showEmbassyAppointmentModal}
        initialEditTravel={editAppointmentTravel}
        onClose={() => {
          setShowEmbassyAppointmentModal(false);
          setEditAppointmentTravel?.(false);
        }}
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
        applicant={applicant}
        interviewBiometric={interviewBiometric || applicant?.interviewBiometric || null}
        open={showEmbassyInterviewModal}
        initialEditTravel={editInterviewTravel}
        onClose={() => {
          setShowEmbassyInterviewModal(false);
          setEditInterviewTravel?.(false);
        }}
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
        applicant={applicant}
        fallbackVisaCollectionTravel={visaCollectionTravel || applicant?.visaCollectionTravel || null}
        residencePermit={residencePermit || applicant?.residencePermit || null}
        mode={visaCollectionModalMode}
        open={showVisaCollectionModal}
        initialEditCollectionTravel={editVisaCollectionTravel}
        onClose={() => {
          setShowVisaCollectionModal(false);
          setEditVisaCollectionTravel?.(false);
        }}
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
        showPaymentDetails={user?.role === "SUPER_USER" && !isEmployer}
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

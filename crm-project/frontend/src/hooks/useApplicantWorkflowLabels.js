import { useMemo } from "react";
import { getDocumentReviewState } from "../constants/applicantDocuments";

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

function useApplicantWorkflowLabels({
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
}) {
  return useMemo(() => {
    const workflowFlags = applicant?.workflowFlags || {};
    const applicantStage = Number(applicant?.stage || 1);
    const canApproveProfile = user?.role === "SUPER_USER" && applicantStage === 1;
    const isEmployer = user?.role === "EMPLOYER";
    const candidateArrivalCompletedDate = formatCompletedStageDate(applicant?.completedAt);

    const isPendingSuperUserApproval =
      applicantStage === 1 && String(applicant?.approvalStatus || "").toLowerCase() === "pending";
    const docReviewState = getDocumentReviewState(documents, applicant);
    const hasDocumentApprovalFromFlags = workflowFlags.isDocumentsApproved === true;
    const hasPendingDocumentApprovalFromFlags = workflowFlags.hasPendingDocumentsApproval === true;
    const hasRejectedDocumentsFromFlags = workflowFlags.hasRejectedDocuments === true;
    const hasAnyDocStateFromFlags =
      hasDocumentApprovalFromFlags || hasPendingDocumentApprovalFromFlags || hasRejectedDocumentsFromFlags;
    const hasAnyDocumentsPayload = Object.keys(documents || {}).length > 0;
    const approvedRequired = hasDocumentApprovalFromFlags || (hasAnyDocStateFromFlags || hasAnyDocumentsPayload ? docReviewState.approvedRequired : false);
    const pendingRequired = hasPendingDocumentApprovalFromFlags || (hasAnyDocStateFromFlags || hasAnyDocumentsPayload ? docReviewState.pendingRequired : false);
    const rejectedRequired = hasRejectedDocumentsFromFlags || (hasAnyDocStateFromFlags || hasAnyDocumentsPayload ? docReviewState.rejectedRequired : false);
    const uploadedRequired = approvedRequired || pendingRequired || rejectedRequired || (hasAnyDocStateFromFlags || hasAnyDocumentsPayload ? docReviewState.uploadedRequired : false);
    const hasCompletedDocumentStage = applicantStage >= 3 && approvedRequired;
    const canAccessDispatch = applicantStage >= 3 && applicantStage < 5;
    const canEditDispatch = user?.role === "AGENCY" && applicantStage >= 3 && applicantStage < 5;
    const canShowDispatchHeaderButton = canEditDispatch;
    const canIssueContract = applicantStage === 4 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
    const isContractPendingApproval =
      applicantStage === 4 &&
      (workflowFlags.isContractPendingApproval ?? String(contract?.status || "").toUpperCase() === "PENDING");
    const isContractCompleted = Boolean(
      workflowFlags.isContractIssued ?? (applicantStage >= 5 && contract?.status === "APPROVED")
    );
    const canInitiateEmbassyAppointment =
      applicantStage === 5 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
    const hasTravelDetails = Boolean(
      workflowFlags.isTravelTicketUploaded ??
      (applicant?.travelDetails?.travelDate || applicant?.travelDetails?.time || applicant?.travelDetails?.fileUrl)
    );
    const hasBiometricSlip = Boolean(
      workflowFlags.isBiometricCompleted ?? (applicant?.biometricSlip?.fileUrl || biometricSlip?.fileUrl)
    );
    const canAddTicket = applicantStage === 6 && user?.role === "AGENCY" && !hasTravelDetails;
    const canAddBiometricSlip = applicantStage === 6 && user?.role === "AGENCY" && hasTravelDetails && !hasBiometricSlip;
    const canAddEmbassyInterview = applicantStage === 7 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
    const hasPendingEmbassyInterviewApproval = Boolean(
      workflowFlags.isEmbassyInterviewPendingApproval ??
      (String(embassyInterview?.status || "").toUpperCase() === "PENDING" ||
      (Boolean(embassyInterview?.dateTime) && !Boolean(embassyInterview?.approved))
      )
    );
    const hasInterviewTicket = Boolean(
      workflowFlags.isInterviewTicketUploaded ?? (interviewTicket?.date || interviewTicket?.time || interviewTicket?.fileUrl)
    );
    const hasInterviewBiometric = Boolean(
      workflowFlags.isInterviewBiometricCompleted ?? (interviewBiometric?.fileUrl || applicant?.interviewBiometric?.fileUrl)
    );
    const canAddInterviewTicket = applicantStage === 8 && user?.role === "AGENCY" && !hasInterviewTicket;
    const canAddInterviewBiometric =
      applicantStage === 8 && user?.role === "AGENCY" && hasInterviewTicket && !hasInterviewBiometric;
    const hasVisaTravel = Boolean(
      workflowFlags.isVisaTravelUploaded ?? (visaTravel?.date || visaTravel?.time || visaTravel?.fileUrl)
    );
    const hasResidencePermit = Boolean(
      workflowFlags.isResidencePermitUploaded ??
      ((residencePermit?.frontUrl || applicant?.residencePermit?.frontUrl) &&
        (residencePermit?.backUrl || applicant?.residencePermit?.backUrl))
    );
    const canAddVisaCollection = applicantStage === 9 && ["SUPER_USER", "EMPLOYER"].includes(user?.role);
    const hasPendingVisaCollectionApproval = Boolean(
      workflowFlags.isVisaCollectionPendingApproval ??
      String(visaCollection?.status || "").toUpperCase() === "PENDING"
    );
    const canAddVisaTravel = applicantStage === 10 && user?.role === "AGENCY" && !hasVisaTravel;
    const canAddResidencePermit = applicantStage === 10 && user?.role === "AGENCY" && hasVisaTravel && !hasResidencePermit;
    const hasDocuments = hasAnyDocumentsPayload;
    const shouldShowDocumentAction =
      !hasCompletedDocumentStage &&
      applicantStage >= 2 &&
      (user?.role !== "SUPER_USER" || hasDocuments || uploadedRequired || pendingRequired);
    const documentsButtonLabel = !shouldShowDocumentAction
      ? ""
      : user?.role === "SUPER_USER"
      ? "Verify Documents"
      : rejectedRequired
      ? "Reupload Document"
      : "Upload Documents";
    const documentRowSubtitle = hasCompletedDocumentStage
      ? ""
      : applicantStage < 2
      ? ""
      : rejectedRequired
      ? "Admin rejected few documents"
      : pendingRequired
      ? "Document uploaded. Pending admin approval"
      : "Upload relevant documents for admin approval";
    const pipelineBannerText = applicant?.applicantBannerStatus || applicant?.statusText || (isPendingSuperUserApproval
      ? "Candidate created. Pending for Admin approval"
      : applicantStage === 1
      ? "Complete the candidate profile for approval"
      : applicantStage >= 12
      ? "Candidate Arrived and Process Completed"
      : applicantStage === 11
      ? "Candidate arrival pending"
      : applicantStage === 10
      ? hasVisaTravel
        ? "Pending Residence Permit upload"
        : "Visa Collection Initiated. Travel Ticket upload pending."
      : applicantStage === 9
      ? hasPendingVisaCollectionApproval
        ? "Visa collection Initiated. Pending admin approval"
        : "Visa Collection Initiated. Travel Ticket upload pending."
      : applicantStage === 8
      ? hasInterviewBiometric
        ? "Pending visa collection"
        : hasInterviewTicket
        ? "Pending Biometric slip"
        : "Travel ticket upload pending"
      : applicantStage === 7
      ? hasPendingEmbassyInterviewApproval
        ? "Embassy interview Initiated. Pending admin approval"
        : "Embassy Interview initiation pending"
      : applicantStage === 6
      ? hasBiometricSlip
        ? "Embassy Interview initiation pending"
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
      : rejectedRequired
      ? "Few issues found in the documents. Re-upload the rejected files for admin review."
      : pendingRequired
      ? "Documents pending admin approval"
      : "Complete the document uploading for admin to approve the candidate");
    const documentRowStatus = hasCompletedDocumentStage
      ? "completed"
      : rejectedRequired
      ? "danger"
      : pendingRequired
      ? "warning"
      : applicantStage === 2
      ? "active"
      : "";
    const dispatchRowTitle = applicantStage >= 4 ? "Document Dispatched" : "Dispatch Documents";
    const contractRowTitle = isContractCompleted
      ? "Contract Issued"
      : isContractPendingApproval
      ? "Contract pending admin approval"
      : "Issue of the Contract";
    const contractRowStatus = isContractCompleted
      ? "completed"
      : isContractPendingApproval
      ? "warning"
      : applicantStage === 4
      ? "active"
      : "";
    const hasEmbassyAppointmentRecord = Boolean(
      workflowFlags.isEmbassyAppointmentCreated ?? Boolean(embassyAppointment)
    );
    const embassyAppointmentRowTitle =
      applicantStage === 5 && !hasEmbassyAppointmentRecord ? "Initiate Embassy Appointment" : "Embassy Appointment Initiated";
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
    const embassyAppointmentCompletedRowStatus = applicantStage === 6 ? "warning" : "";
    const hasEmbassyInterviewRecord = Boolean(
      workflowFlags.isEmbassyInterviewCreated ?? Boolean(embassyInterview?.dateTime)
    );
    const embassyInterviewRowTitle =
      applicantStage === 7 && !hasEmbassyInterviewRecord ? "Initiate Embassy Interview" : "Embassy Interview Initiated";
    const embassyInterviewRowSubtitle =
      applicantStage === 7 && hasPendingEmbassyInterviewApproval
        ? "Embassy interview Initiated. Pending admin approval"
        : "";
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
      applicantStage === 9 && hasPendingVisaCollectionApproval
        ? "warning"
        : applicantStage === 9
        ? "active"
        : "";
    const visaCollectionRowSubtitle =
      applicantStage === 9 && hasPendingVisaCollectionApproval
        ? "Visa collection Initiated. Pending admin approval"
        : "";
    const visaCollectionCompletedRowTitle =
      applicantStage > 10 ? "Visa Collection Completed" : "Complete Visa Collection";
    const visaCollectionCompletedRowSubtitle =
      applicantStage === 10
        ? hasVisaTravel
          ? hasResidencePermit
            ? ""
            : "Pending Residence Permit upload"
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
    const hasVisaCollectionRecord = Boolean(
      workflowFlags.isVisaCollectionCreated ?? Boolean(visaCollection?.date && visaCollection?.time)
    );
    const headerActionLabel = canIssueContract
      ? isContractPendingApproval
        ? user?.role === "SUPER_USER"
          ? "Verify & Approve"
          : ""
        : "Issue Contract"
      : applicantStage === 11 && user?.role === "SUPER_USER"
      ? "Candidate Arrived"
      : canAddResidencePermit
      ? "Add Residence Permit"
      : canAddVisaTravel
      ? "Add Ticket"
      : canAddVisaCollection
      ? hasPendingVisaCollectionApproval && user?.role === "SUPER_USER"
        ? "Verify & Approve"
        : hasVisaCollectionRecord && user?.role === "EMPLOYER"
        ? "Update visa collection details"
        : "Add visa collection Details"
      : canAddInterviewBiometric
      ? "Add Biometric Slip"
      : canAddInterviewTicket
      ? "Add Ticket"
      : canAddEmbassyInterview
      ? hasPendingEmbassyInterviewApproval && user?.role === "SUPER_USER"
        ? "Verify & Approve"
        : hasEmbassyInterviewRecord
        ? "Update Embassy Interview"
        : "Add Embassy Interview"
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
      ? "View & Approve Profile"
      : documentsButtonLabel;
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
      (canShowDispatchHeaderButton && applicantStage >= 3 && applicantStage < 5) ||
      (applicantStage === 1 ? canApproveProfile : shouldShowDocumentAction);

    return {
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
    };
  }, [
    applicant,
    biometricSlip,
    contract,
    documents,
    embassyAppointment,
    embassyInterview,
    interviewBiometric,
    interviewTicket,
    residencePermit,
    user,
    visaCollection,
    visaTravel
  ]);
}

export default useApplicantWorkflowLabels;

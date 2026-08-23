export const USER_ROLES = [
  { value: "EMPLOYER", label: "Employer" },
  { value: "AGENCY", label: "Agent" },
  { value: "JUNIOR_ACCOUNTANT", label: "Juniour Accountant" },
  { value: "SENIOR_ACCOUNTANT", label: "Seniour Accountant" },
  { value: "ADMIN", label: "Admin" }
];

export const USER_RIGHTS = [
  ["ADD_USERS", "Add Users"], ["VIEW_USERS", "View Users"], ["DELETE_USERS", "Delete Users"], ["ADD_COMPANIES", "Add Companies"], ["VIEW_COMPANIES", "View Companies"], ["DELETE_COMPANIES", "Delete Company"], ["DELETE_JOB_POSITION", "Delete Job position"],
  ["CREATE_BANK_DETAILS", "Create Bank Details"], ["VIEW_BANK_DETAILS", "View Bank Details"], ["CREATE_APPLICANT", "Create Applicant"], ["DELETE_APPLICANT", "Delete Applicant"], ["VIEW_APPLICANT_PROFILE", "View applicant work flow"], ["VIEW_APPLICANT_INFORMATION", "View Applicant Information"],
  ["UPLOAD_DOCUMENT", "Upload Document"], ["VIEW_DOCUMENTS", "View Documents"], ["ADD_DOCUMENT_DISPATCH", "Add Document Dispatch"], ["VIEW_DOCUMENT_DISPATCH", "View Document Dispatch"],
  ["ISSUE_CONTRACT", "Issue Of Contract"], ["UPLOAD_SIGNED_CONTRACT", "Upload Signed Contract"], ["VIEW_SIGNED_CONTRACT", "View Signed Contract"], ["INITIATE_EMBASSY_APPOINTMENT", "Initiate Embassy Appointment"],
  ["VIEW_EMBASSY_APPOINTMENT", "View Embassy Appointment"], ["ADD_APPOINTMENT_TRAVEL", "Adding Travel Details of Embassy Appointment"], ["ADD_APPOINTMENT_BIOMETRIC", "Adding Biometric of Embassy Appointment"], ["VIEW_APPOINTMENT_TRAVEL_BIOMETRIC", "View Travel Details and Biometric of Embassy Appointment"],
  ["INITIATE_EMBASSY_INTERVIEW", "Initiate Embassy Interview"], ["VIEW_EMBASSY_INTERVIEW", "View Embassy Interview"], ["ADD_INTERVIEW_TRAVEL", "Adding Travel Details of Embassy Interview"], ["ADD_INTERVIEW_BIOMETRIC", "Adding Biometric of Embassy Interview"],
  ["VIEW_INTERVIEW_TRAVEL_BIOMETRIC", "View Travel Details and Biometric of Embassy Interview"], ["INITIATE_VISA_COLLECTION", "Initiate Visa Collection"], ["VIEW_VISA_COLLECTION", "View Visa Collection"], ["ADD_VISA_TRAVEL", "Adding Travel Details of Visa Collection"],
  ["VIEW_VISA_TRAVEL", "View Travel Details of Visa Collection"], ["UPLOAD_TRC", "Upload TRC"], ["VIEW_TRC", "View TRC"], ["ADD_APPLICANT_ARRIVAL", "Adding applicant arrival details"],
  ["VIEW_APPLICANT_ARRIVAL", "View applicant arrival details"], ["COMPLETE_APPLICANT_ARRIVAL", "Complete Applicant arrival"], ["ADD_PAYMENT_DETAILS", "Add Payment details"], ["VIEW_PAYMENT_DETAILS", "View Payment Details"],
  ["ACKNOWLEDGE_PAYMENT", "Acknowledge Payment"], ["CONFIRM_PAYMENT", "Confirm Payment"]
];

const all = USER_RIGHTS.map(([key]) => key);
export const DEFAULT_RIGHTS = {
  SUPER_USER: all,
  ADMIN: all.filter((right) => !["DELETE_USERS", "DELETE_COMPANIES", "DELETE_JOB_POSITION", "DELETE_APPLICANT"].includes(right)),
  EMPLOYER: ["VIEW_APPLICANT_PROFILE", "VIEW_APPLICANT_INFORMATION", "VIEW_DOCUMENTS", "VIEW_DOCUMENT_DISPATCH", "ISSUE_CONTRACT", "VIEW_SIGNED_CONTRACT", "INITIATE_EMBASSY_APPOINTMENT", "VIEW_EMBASSY_APPOINTMENT", "VIEW_APPOINTMENT_TRAVEL_BIOMETRIC", "INITIATE_EMBASSY_INTERVIEW", "VIEW_EMBASSY_INTERVIEW", "VIEW_INTERVIEW_TRAVEL_BIOMETRIC", "INITIATE_VISA_COLLECTION", "VIEW_VISA_COLLECTION", "VIEW_VISA_TRAVEL", "VIEW_TRC", "VIEW_APPLICANT_ARRIVAL"],
  AGENCY: ["CREATE_APPLICANT", "VIEW_APPLICANT_PROFILE", "VIEW_APPLICANT_INFORMATION", "UPLOAD_DOCUMENT", "VIEW_DOCUMENTS", "ADD_DOCUMENT_DISPATCH", "VIEW_DOCUMENT_DISPATCH", "UPLOAD_SIGNED_CONTRACT", "VIEW_SIGNED_CONTRACT", "VIEW_EMBASSY_APPOINTMENT", "ADD_APPOINTMENT_TRAVEL", "ADD_APPOINTMENT_BIOMETRIC", "VIEW_APPOINTMENT_TRAVEL_BIOMETRIC", "VIEW_EMBASSY_INTERVIEW", "ADD_INTERVIEW_TRAVEL", "ADD_INTERVIEW_BIOMETRIC", "VIEW_INTERVIEW_TRAVEL_BIOMETRIC", "VIEW_VISA_COLLECTION", "ADD_VISA_TRAVEL", "VIEW_VISA_TRAVEL", "UPLOAD_TRC", "VIEW_TRC", "ADD_APPLICANT_ARRIVAL", "VIEW_APPLICANT_ARRIVAL", "ADD_PAYMENT_DETAILS", "VIEW_PAYMENT_DETAILS"],
  JUNIOR_ACCOUNTANT: ["ACKNOWLEDGE_PAYMENT", "VIEW_PAYMENT_DETAILS"],
  SENIOR_ACCOUNTANT: ["VIEW_APPLICANT_PROFILE", "VIEW_APPLICANT_INFORMATION", "VIEW_PAYMENT_DETAILS", "CONFIRM_PAYMENT"]
};

export const roleLabel = (role) => USER_ROLES.find((item) => item.value === role)?.label || role || "-";

const { z } = require("zod");

const trimmedString = z.string().trim();
const optionalTrimmedString = trimmedString.optional().or(z.literal(""));
const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.union([z.literal(""), z.string().email("Valid email is required")]).optional()
);
const idSchema = trimmedString.min(1, "Id is required");

const applicantIdParamsSchema = z.object({
  applicantId: idSchema
});

const idParamsSchema = z.object({
  id: idSchema
});

const quickPrintAssetParamsSchema = z.object({
  id: idSchema,
  assetType: z.enum(["photo", "flight", "bus"])
});

const applicantDocParamsSchema = z.object({
  applicantId: idSchema,
  docType: idSchema
});

const documentVersionParamsSchema = z.object({
  id: idSchema,
  docType: idSchema,
  versionId: idSchema
});

const idDocTypeParamsSchema = z.object({
  id: idSchema,
  docType: idSchema
});

const signedContractDocumentParamsSchema = z.object({
  id: idSchema,
  documentId: idSchema
});

const appointmentParamsSchema = z.object({
  applicantId: idSchema,
  type: z.enum(["medical", "biometric", "embassy"])
});

const interviewOrStageParamsSchema = z.object({
  id: idSchema
});

const createApplicantSchema = z.object({
  firstName: optionalTrimmedString,
  lastName: optionalTrimmedString,
  education: optionalTrimmedString,
  countryId: idSchema,
  companyId: idSchema,
  jobPositionId: idSchema,
  jobPositionName: optionalTrimmedString,
  agencyId: optionalTrimmedString,
  email: optionalEmailSchema,
  totalAmount: z.coerce.number().optional(),
  amountPaid: z.coerce.number().optional(),
  paidAmount: z.coerce.number().optional(),
  whatsappNumber: optionalTrimmedString,
  currency: optionalTrimmedString,
  paymentCurrency: optionalTrimmedString,
  totalApplicantPayment: z.coerce.number().optional(),
  totalEmployerPayment: z.coerce.number().optional(),
  personalDetails: z.object({
    firstName: optionalTrimmedString,
    lastName: optionalTrimmedString,
    email: optionalEmailSchema,
    dob: optionalTrimmedString,
    age: z.union([z.coerce.number(), z.literal(""), z.null()]).optional(),
    placeOfBirth: optionalTrimmedString,
    passportNumber: optionalTrimmedString,
    address: optionalTrimmedString,
    phone: optionalTrimmedString,
    whatsappNumber: optionalTrimmedString,
    whatsapp: optionalTrimmedString,
    education: optionalTrimmedString
  }).optional().default({})
});

const updateApplicantSchema = createApplicantSchema.partial();

const deferDocumentSchema = z.object({
  reason: optionalTrimmedString
});

const addPaymentSchema = z.object({
  type: z.enum(["APPLICANT", "EMPLOYER"]),
  amount: z.coerce.number(),
  currency: optionalTrimmedString,
  note: optionalTrimmedString,
  paidDate: optionalTrimmedString,
  paymentMode: optionalTrimmedString,
  bankAccountId: optionalTrimmedString,
  utrNumber: optionalTrimmedString,
  payeeName: optionalTrimmedString,
  payeeBankName: optionalTrimmedString,
  payeeBankBranch: optionalTrimmedString
});

const paymentActionParamsSchema = z.object({
  applicantId: idSchema,
  paymentId: idSchema
});

const appointmentBodySchema = z.object({
  date: trimmedString.min(1, "Date is required"),
  time: trimmedString.min(1, "Time is required")
});

const rejectDocumentSchema = z.object({
  reason: optionalTrimmedString
});

const dispatchBodySchema = z.object({
  note: trimmedString.min(1, "Note is required"),
  trackingUrl: optionalTrimmedString,
  awbNumber: optionalTrimmedString,
  dispatchDate: optionalTrimmedString
});

const bulkDispatchBodySchema = z.object({
  note: trimmedString.min(1, "Dispatch note is required"),
  trackingUrl: trimmedString.min(1, "Tracking URL is required"),
  awbNumber: trimmedString.min(1, "AWB Number is required"),
  dispatchDate: trimmedString.min(1, "Dispatch date is required"),
  applicantIds: z.array(idSchema).min(1, "Select at least one applicant")
});

const embassyAppointmentBodySchema = z.object({
  dateTime: optionalTrimmedString,
  date: optionalTrimmedString,
  time: optionalTrimmedString
}).refine((value) => Boolean(value.dateTime || (value.date && value.time)), {
  message: "Appointment date/time is required"
});

const travelBodySchema = z.object({
  travelDate: trimmedString.min(1, "Travel date is required"),
  time: trimmedString.min(1, "Time is required"),
  ticketNumber: optionalTrimmedString
});

const interviewBodySchema = z.object({
  dateTime: trimmedString.min(1, "Interview date/time is required")
});

const dateTimeBodySchema = z.object({
  date: trimmedString.min(1, "Date is required"),
  time: trimmedString.min(1, "Time is required")
});

const visaTravelBodySchema = z.object({
  date: trimmedString.min(1, "Date is required"),
  time: trimmedString.min(1, "Time is required"),
  flightNumber: trimmedString.min(1, "Flight number is required"),
  arrivalPlace: trimmedString.min(1, "Arrival place is required"),
  arrivalBusNumber: optionalTrimmedString,
  arrivalBusDate: optionalTrimmedString,
  arrivalBusTime: optionalTrimmedString,
  busArrivalPlace: optionalTrimmedString,
  hotelNameAddress: optionalTrimmedString,
  removeTravelFile: optionalTrimmedString,
  removeBusTicket: optionalTrimmedString,
  ticketNumber: optionalTrimmedString
});

const residencePermitBodySchema = z.object({
  type: z.enum(["FRONT", "BACK", "TRP"]).optional().default("TRP")
});

const uploadDocumentBodySchema = z.object({
  documentType: trimmedString.min(1, "Document type is required")
});

const dashboardQuerySchema = z.object({
  companyId: optionalTrimmedString.optional(),
  agencyId: optionalTrimmedString.optional(),
  fromDate: optionalTrimmedString.optional(),
  toDate: optionalTrimmedString.optional()
});

const applicantsListQuerySchema = z.object({
  lite: z.preprocess(
    (value) => String(value || "").toLowerCase() === "true",
    z.boolean()
  ).optional().default(false),
  paginated: z.preprocess(
    (value) => String(value || "").toLowerCase() === "true",
    z.boolean()
  ).optional().default(true),
  page: z.coerce.number().int().min(1).optional().default(1),
  cursor: optionalTrimmedString.optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  q: optionalTrimmedString.optional().default(""),
  fields: optionalTrimmedString.optional().default(""),
  type: optionalTrimmedString.optional().default(""),
  country: optionalTrimmedString.optional().default(""),
  company: optionalTrimmedString.optional().default(""),
  agency: optionalTrimmedString.optional().default(""),
  notificationApplicants: optionalTrimmedString.optional().default(""),
  markNotificationsRead: optionalTrimmedString.optional().default(""),
  dashboardFilter: optionalTrimmedString.optional().default(""),
  fromDate: optionalTrimmedString.optional().default(""),
  toDate: optionalTrimmedString.optional().default("")
});

module.exports = {
  addPaymentSchema,
  applicantDocParamsSchema,
  applicantIdParamsSchema,
  appointmentBodySchema,
  appointmentParamsSchema,
  bulkDispatchBodySchema,
  createApplicantSchema,
  applicantsListQuerySchema,
  dashboardQuerySchema,
  dateTimeBodySchema,
  deferDocumentSchema,
  dispatchBodySchema,
  documentVersionParamsSchema,
  idDocTypeParamsSchema,
  embassyAppointmentBodySchema,
  idParamsSchema,
  interviewBodySchema,
  interviewOrStageParamsSchema,
  paymentActionParamsSchema,
  rejectDocumentSchema,
  quickPrintAssetParamsSchema,
  residencePermitBodySchema,
  signedContractDocumentParamsSchema,
  travelBodySchema,
  updateApplicantSchema,
  uploadDocumentBodySchema,
  visaTravelBodySchema
};

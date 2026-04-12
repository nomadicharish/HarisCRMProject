const { z } = require("zod");

const trimmedString = z.string().trim();
const optionalTrimmedString = trimmedString.optional().or(z.literal(""));
const idSchema = trimmedString.min(1, "Id is required");

const applicantIdParamsSchema = z.object({
  applicantId: idSchema
});

const idParamsSchema = z.object({
  id: idSchema
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
  countryId: idSchema,
  companyId: idSchema,
  agencyId: optionalTrimmedString,
  totalAmount: z.coerce.number().optional(),
  amountPaid: z.coerce.number().optional(),
  paidAmount: z.coerce.number().optional(),
  currency: optionalTrimmedString,
  totalApplicantPayment: z.coerce.number().optional(),
  totalEmployerPayment: z.coerce.number().optional(),
  personalDetails: z.object({
    firstName: optionalTrimmedString,
    lastName: optionalTrimmedString,
    dob: optionalTrimmedString,
    age: z.union([z.coerce.number(), z.literal(""), z.null()]).optional(),
    address: optionalTrimmedString,
    phone: optionalTrimmedString,
    maritalStatus: optionalTrimmedString
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
  paymentMode: optionalTrimmedString
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
  awbNumber: optionalTrimmedString
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
  ticketNumber: optionalTrimmedString
});

const residencePermitBodySchema = z.object({
  type: z.enum(["FRONT", "BACK"])
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

module.exports = {
  addPaymentSchema,
  applicantDocParamsSchema,
  applicantIdParamsSchema,
  appointmentBodySchema,
  appointmentParamsSchema,
  createApplicantSchema,
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
  rejectDocumentSchema,
  residencePermitBodySchema,
  travelBodySchema,
  updateApplicantSchema,
  uploadDocumentBodySchema,
  visaTravelBodySchema
};

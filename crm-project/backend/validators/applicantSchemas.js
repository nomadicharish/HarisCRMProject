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
  email: optionalEmailSchema,
  totalAmount: z.coerce.number().optional(),
  amountPaid: z.coerce.number().optional(),
  paidAmount: z.coerce.number().optional(),
  whatsappNumber: optionalTrimmedString,
  currency: optionalTrimmedString,
  totalApplicantPayment: z.coerce.number().optional(),
  totalEmployerPayment: z.coerce.number().optional(),
  personalDetails: z.object({
    firstName: optionalTrimmedString,
    lastName: optionalTrimmedString,
    email: optionalEmailSchema,
    dob: optionalTrimmedString,
    age: z.union([z.coerce.number(), z.literal(""), z.null()]).optional(),
    address: optionalTrimmedString,
    phone: optionalTrimmedString,
    whatsappNumber: optionalTrimmedString,
    whatsapp: optionalTrimmedString,
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
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  q: optionalTrimmedString.optional().default(""),
  fields: optionalTrimmedString.optional().default(""),
  type: optionalTrimmedString.optional().default(""),
  country: optionalTrimmedString.optional().default(""),
  company: optionalTrimmedString.optional().default(""),
  agency: optionalTrimmedString.optional().default("")
});

module.exports = {
  addPaymentSchema,
  applicantDocParamsSchema,
  applicantIdParamsSchema,
  appointmentBodySchema,
  appointmentParamsSchema,
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
  rejectDocumentSchema,
  residencePermitBodySchema,
  travelBodySchema,
  updateApplicantSchema,
  uploadDocumentBodySchema,
  visaTravelBodySchema
};

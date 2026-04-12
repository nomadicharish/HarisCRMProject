const { z } = require("zod");

const trimmedString = z.string().trim();
const optionalTrimmedString = z.string().trim().optional().or(z.literal(""));
const emailField = z.email("Valid email is required").transform((value) => value.trim().toLowerCase());
const numericAmountField = z.coerce.number().min(0, "Enter a valid amount");

const companyDocumentSchema = z.object({
  id: optionalTrimmedString,
  docType: optionalTrimmedString,
  label: optionalTrimmedString,
  name: optionalTrimmedString,
  required: z.boolean().optional(),
  templateFileName: optionalTrimmedString,
  templateFileUrl: optionalTrimmedString
});

const idParamSchema = z.object({
  id: trimmedString.min(1, "Id is required")
});

const countryPayloadSchema = z.object({
  name: trimmedString.min(1, "Country name is required")
});

const companyPayloadSchema = z.object({
  name: trimmedString.min(1, "Company name is required"),
  countryId: trimmedString.min(1, "Country is required"),
  companyPaymentPerApplicant: numericAmountField,
  employerIds: z.array(trimmedString).optional().default([]),
  contactNumber: optionalTrimmedString,
  whatsappNumber: optionalTrimmedString,
  documentsNeeded: z.array(companyDocumentSchema).optional().default([])
});

const employerPayloadSchema = z.object({
  name: trimmedString.min(1, "Employer name is required"),
  email: emailField,
  contactNumber: trimmedString.min(1, "Contact number is required"),
  whatsappNumber: optionalTrimmedString,
  companyId: optionalTrimmedString,
  countryId: optionalTrimmedString
});

const agencyPayloadSchema = z.object({
  name: trimmedString.min(1, "Agency name is required"),
  email: emailField,
  contactNumber: trimmedString.min(1, "Contact number is required"),
  whatsappNumber: optionalTrimmedString,
  address: trimmedString.min(1, "Address is required"),
  assignedCompanyIds: z.array(trimmedString).optional().default([])
});

const listCompaniesQuerySchema = z.object({
  countryId: optionalTrimmedString.optional()
});

const documentTemplateParamsSchema = z.object({
  id: trimmedString.min(1, "Company id is required")
});

const documentTemplateBodySchema = z.object({
  documentId: trimmedString.min(1, "Document id is required")
});

module.exports = {
  agencyPayloadSchema,
  companyPayloadSchema,
  countryPayloadSchema,
  documentTemplateBodySchema,
  documentTemplateParamsSchema,
  employerPayloadSchema,
  idParamSchema,
  listCompaniesQuerySchema
};

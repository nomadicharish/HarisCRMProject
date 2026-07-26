const { z } = require("zod");

const trimmedString = z.string().trim();

const checkEmailSchema = z.object({
  email: z.email("Valid email is required").transform((value) => value.trim().toLowerCase())
});

const changePasswordSchema = z.object({
  newPassword: trimmedString.min(1, "Password is required")
});

const updateSettingsSchema = z.object({
  name: trimmedString.min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
  contactNumber: trimmedString.min(1, "Contact number is required")
});

const disableUserParamsSchema = z.object({
  uid: trimmedString.min(1, "User id is required")
});

const bankAccountSchema = z.object({
  beneficiaryName: trimmedString.min(1, "Beneficiary name is required"),
  accountNumber: trimmedString.min(1, "Account number is required"),
  bankNameBranch: trimmedString.min(1, "Bank name and branch are required")
});

const bankAccountParamsSchema = z.object({
  id: trimmedString.min(1, "Bank account id is required")
});

const accountantSchema = z.object({
  name: trimmedString.min(1, "Name is required"),
  contactNumber: trimmedString.min(1, "Contact number is required"),
  email: z.email("Valid email is required").transform((value) => value.trim().toLowerCase()),
  accountantType: z.enum(["JUNIOR_ACCOUNTANT", "SENIOR_ACCOUNTANT"])
});

module.exports = {
  accountantSchema,
  bankAccountParamsSchema,
  bankAccountSchema,
  changePasswordSchema,
  checkEmailSchema,
  disableUserParamsSchema,
  updateSettingsSchema
};

const { z } = require("zod");

const trimmedString = z.string().trim();

const checkEmailSchema = z.object({
  email: z.email("Valid email is required").transform((value) => value.trim().toLowerCase())
});

const changePasswordSchema = z.object({
  newPassword: trimmedString.min(1, "Password is required")
});

const updateSettingsSchema = z.object({
  contactNumber: trimmedString.min(1, "Contact number is required")
});

const createAdminSchema = z.object({
  name: trimmedString.min(1, "Name is required"),
  email: z.email("Valid email is required").transform((value) => value.trim().toLowerCase()),
  contactNumber: trimmedString.min(1, "Contact number is required"),
  whatsappNumber: trimmedString.optional().default("")
});

const disableUserParamsSchema = z.object({
  uid: trimmedString.min(1, "User id is required")
});

module.exports = {
  changePasswordSchema,
  checkEmailSchema,
  createAdminSchema,
  disableUserParamsSchema,
  updateSettingsSchema
};

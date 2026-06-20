const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const { verifyToken } = require("../middleware/authMiddleware");
const { noStore } = require("../middleware/noStore");
const allowRoles = require("../middleware/roleMiddleware");
const { validate } = require("../middleware/validate");
const authController = require("../controllers/authController");
const accountantAccountController = require("../controllers/accountantAccountController");
const bankAccountController = require("../controllers/bankAccountController");
const { createAuthRateLimiter } = require("../config/security");
const {
  accountantSchema,
  bankAccountParamsSchema,
  bankAccountSchema,
  changePasswordSchema,
  checkEmailSchema,
  disableUserParamsSchema,
  updateSettingsSchema
} = require("../validators/authSchemas");

const router = express.Router();

function requireRootSuperUser(req, res, next) {
  if (req.user?.role !== "SUPER_USER") {
    return res.status(403).json({ message: "Access Denied" });
  }
  return next();
}

router.get("/me", noStore, verifyToken, asyncHandler(authController.getCurrentUser));
router.post("/check-email", noStore, createAuthRateLimiter(), validate(checkEmailSchema), asyncHandler(authController.checkEmail));
router.post("/change-password", noStore, verifyToken, validate(changePasswordSchema), asyncHandler(authController.changePassword));
router.get("/settings", noStore, verifyToken, asyncHandler(authController.getSettings));
router.patch("/settings", noStore, verifyToken, validate(updateSettingsSchema), asyncHandler(authController.updateSettings));
router.get(
  "/bank-accounts",
  noStore,
  verifyToken,
  allowRoles("SUPER_USER", "AGENCY"),
  asyncHandler(bankAccountController.listBankAccounts)
);
router.post(
  "/bank-accounts",
  noStore,
  verifyToken,
  requireRootSuperUser,
  validate(bankAccountSchema),
  asyncHandler(bankAccountController.createBankAccount)
);
router.patch(
  "/bank-accounts/:id",
  noStore,
  verifyToken,
  requireRootSuperUser,
  validate(bankAccountParamsSchema, "params"),
  validate(bankAccountSchema),
  asyncHandler(bankAccountController.updateBankAccount)
);
router.delete(
  "/bank-accounts/:id",
  noStore,
  verifyToken,
  requireRootSuperUser,
  validate(bankAccountParamsSchema, "params"),
  asyncHandler(bankAccountController.deleteBankAccount)
);
router.get("/accountants", noStore, verifyToken, requireRootSuperUser, asyncHandler(accountantAccountController.listAccountants));
router.post(
  "/accountants",
  noStore,
  verifyToken,
  requireRootSuperUser,
  validate(accountantSchema),
  asyncHandler(accountantAccountController.createAccountant)
);
router.patch(
  "/accountants/:uid",
  noStore,
  verifyToken,
  requireRootSuperUser,
  validate(disableUserParamsSchema, "params"),
  validate(accountantSchema),
  asyncHandler(accountantAccountController.updateAccountant)
);
router.delete(
  "/accountants/:uid",
  noStore,
  verifyToken,
  requireRootSuperUser,
  validate(disableUserParamsSchema, "params"),
  asyncHandler(accountantAccountController.removeAccountant)
);
router.post("/password-updated", noStore, verifyToken, asyncHandler(authController.markPasswordUpdated));
router.post(
  "/users/disable/:uid",
  noStore,
  verifyToken,
  allowRoles("SUPER_USER"),
  validate(disableUserParamsSchema, "params"),
  asyncHandler(authController.disableUser)
);

module.exports = router;

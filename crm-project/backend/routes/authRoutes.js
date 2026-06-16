const express = require("express");
const { asyncHandler } = require("../lib/asyncHandler");
const { verifyToken } = require("../middleware/authMiddleware");
const { noStore } = require("../middleware/noStore");
const allowRoles = require("../middleware/roleMiddleware");
const { validate } = require("../middleware/validate");
const authController = require("../controllers/authController");
const adminAccountController = require("../controllers/adminAccountController");
const { createAuthRateLimiter } = require("../config/security");
const {
  changePasswordSchema,
  checkEmailSchema,
  createAdminSchema,
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
router.get("/admins", noStore, verifyToken, requireRootSuperUser, asyncHandler(adminAccountController.listAdmins));
router.post("/admins", noStore, verifyToken, requireRootSuperUser, validate(createAdminSchema), asyncHandler(adminAccountController.createAdmin));
router.delete(
  "/admins/:uid",
  noStore,
  verifyToken,
  requireRootSuperUser,
  validate(disableUserParamsSchema, "params"),
  asyncHandler(adminAccountController.removeAdmin)
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

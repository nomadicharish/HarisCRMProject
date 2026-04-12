const cors = require("cors");
const express = require("express");
const applicantRoutes = require("./routes/applicantRoutes");
const authController = require("./controllers/authController");
const { asyncHandler } = require("./lib/asyncHandler");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const entityRoutes = require("./routes/entityRoutes");
const userRoutes = require("./routes/userRoutes");
const { verifyToken } = require("./middleware/authMiddleware");
const allowRoles = require("./middleware/roleMiddleware");
const { errorHandler } = require("./middleware/errorHandler");
const { responseSanitizer } = require("./middleware/responseSanitizer");
const { validate } = require("./middleware/validate");
const { disableUserParamsSchema } = require("./validators/authSchemas");
const {
  buildCorsOptions,
  createAuthRateLimiter,
  createGeneralRateLimiter,
  createHelmetMiddleware
} = require("./config/security");

const app = express();

app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.disable("x-powered-by");
app.use(createHelmetMiddleware());
app.use(cors(buildCorsOptions()));
app.use(createGeneralRateLimiter());
app.use(express.json({ limit: "1mb" }));
app.use(responseSanitizer);

app.get("/", (req, res) => {
  res.send("CRM Backend is running");
});

app.get("/api/super-user-only", verifyToken, allowRoles("SUPER_USER"), (req, res) => {
  res.json({ message: "Welcome Super User" });
});

app.post(
  "/api/users/disable/:uid",
  verifyToken,
  allowRoles("SUPER_USER"),
  validate(disableUserParamsSchema, "params"),
  asyncHandler(authController.disableUser)
);

app.use("/api/users", userRoutes);
app.use("/api/applicants", applicantRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", createAuthRateLimiter());
app.use("/api/auth", authRoutes);
app.use("/api", entityRoutes);

app.use(errorHandler);

module.exports = { app };

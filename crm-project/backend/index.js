// ================================
// BASIC SERVER SETUP
// ================================
const express = require("express");
const cors = require("cors");

// 🔹 Initialize Express FIRST
const app = express();

// Middleware to read JSON body
app.use(cors());
app.use(express.json());

// 🔹 Import Routes AFTER app is created
const applicantRoutes = require("./routes/applicantRoutes");

const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

// 🔹 Import Routes AFTER app is created  
app.use("/api/applicants", applicantRoutes);



// ================================
// AUTH & ROLE MIDDLEWARE
// ================================
const { verifyToken } = require("./middleware/authMiddleware");

const { admin, db } = require("./config/firebase");


// ===============================
// DASHBOARD ROUTES
// ===============================
const dashboardRoutes = require("./routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);


// ===============================
// TEST ROUTES
// ================================

// Public route (no login required)
app.get("/", (req, res) => {
  res.send("CRM Backend is running");
});

// Super User only route (TEST)
app.get("/api/super-user-only", verifyToken, (req, res) => {
  if (req.user.role !== "SUPER_USER") {
    return res.status(403).json({ message: "Access denied" });
  }

  res.json({ message: "Welcome Super User" });
});


// ===============================
// Agency or Employer route (TEST)
// ================================

// Get current user info (used after login)
app.get("/api/auth/me", verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const userData = userDoc.data();

    return res.json({
      uid: req.user.uid,
      email: userData.email,
      role: userData.role,
      forcePasswordReset: userData.forcePasswordReset,
      active: userData.active
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// ================================
// START SERVER
// ================================
const PORT = 3000;


// Add Country (Super User only)
app.post("/api/add-country", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name } = req.body;

    const docRef = await admin.firestore().collection("countries").add({
      name,
      createdAt: new Date()
    });

    res.json({ message: "Country added", id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Company (Super User only)
app.post("/api/add-company", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name, countryId, companyPaymentPerApplicant } = req.body;

    const docRef = await admin.firestore().collection("companies").add({
      name,
      countryId,
      companyPaymentPerApplicant,
      employerIds: [],
      createdAt: new Date()
    });

    res.json({ message: "Company added", id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Add Agency (Super User only)
app.post("/api/add-agency", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name, email, contactNumber } = req.body;

    const docRef = await admin.firestore().collection("agencies").add({
      name,
      email,
      contactNumber,
      assignedCompanyIds: [],
      createdAt: new Date()
    });

    res.json({ message: "Agency added", id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Add Employer (Super User only)
app.post("/api/add-employer", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name, email, contactNumber, companyId, countryId } = req.body;

    const docRef = await admin.firestore().collection("employers").add({
      name,
      email,
      contactNumber,
      companyId,
      countryId,
      createdAt: new Date()
    });

    res.json({ message: "Employer added", id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Change password (first login or manual reset)
app.post("/api/auth/change-password", verifyToken, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters"
      });
    }

    // Update Firebase password
    await admin.auth().updateUser(req.user.uid, {
      password: newPassword
    });

    // Remove force reset flag
    await db.collection("users").doc(req.user.uid).update({
      forcePasswordReset: false
    });

    res.json({ message: "Password updated successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Password update failed" });
  }
});


// Disable user (Super User only)
app.post("/api/users/disable/:uid", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { uid } = req.params;

    // Disable Firebase Auth user
    await admin.auth().updateUser(uid, { disabled: true });

    // Mark inactive in Firestore
    await db.collection("users").doc(uid).update({
      active: false
    });

    return res.json({ message: "User disabled successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

//Get countries for dropdowns
app.get("/api/countries", verifyToken, async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("countries").get();

    const countries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(countries);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Get companies for dropdowns
app.get("/api/companies", verifyToken, async (req, res) => {
  try {

    const { countryId } = req.query;

    let query = admin.firestore().collection("companies");

    if (countryId) {
      query = query.where("countryId", "==", countryId);
    }

    const snapshot = await query.get();

    const companies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(companies);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/agencies", verifyToken, async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("agencies").get();

    const agencies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(agencies);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.listen(PORT, () => {
  console.log("Server running successfully on port " + PORT);
});

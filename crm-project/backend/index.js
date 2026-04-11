// ================================
// BASIC SERVER SETUP
// ================================
const express = require("express");
const cors = require("cors");

// 🔹 Initialize Express FIRST
const app = express();
app.disable("x-powered-by");

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
const upload = require("./middleware/uploadMiddleware");

function normalizeIdList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function buildCompanyDocumentId(value, fallbackIndex = 0) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `document_${fallbackIndex + 1}`;
}

function normalizeCompanyDocuments(value) {
  if (!Array.isArray(value)) return [];

  return value.reduce((documents, item, index) => {
    if (!item || typeof item !== "object") return documents;

    const name = String(item.name || item.label || "").trim();
    const id = String(item.id || item.docType || buildCompanyDocumentId(name, index)).trim();

    if (!name || !id) return documents;

    documents.push({
      id,
      name,
      required: Boolean(item.required),
      templateFileName: String(item.templateFileName || "").trim(),
      templateFileUrl: String(item.templateFileUrl || "").trim(),
      updatedAt: new Date()
    });

    return documents;
  }, []);
}

async function syncCompanyEmployerLinks(companyId, countryId, nextEmployerIds = [], previousEmployerIds = []) {
  const batch = admin.firestore().batch();
  const nextSet = new Set(nextEmployerIds);
  const previousSet = new Set(previousEmployerIds);

  nextEmployerIds.forEach((employerId) => {
    const employerRef = admin.firestore().collection("employers").doc(employerId);
    batch.set(
      employerRef,
      {
        companyId,
        countryId: countryId || null
      },
      { merge: true }
    );
  });

  previousEmployerIds.forEach((employerId) => {
    if (nextSet.has(employerId)) return;
    const employerRef = admin.firestore().collection("employers").doc(employerId);
    batch.set(
      employerRef,
      {
        companyId: null
      },
      { merge: true }
    );
  });

  if (nextEmployerIds.length || previousEmployerIds.length) {
    await batch.commit();
  }
}

function validatePassword(password) {
  if (typeof password !== "string" || password.trim().length === 0) {
    return "Password is required";
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter";
  }

  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one special character";
  }

  return "";
}

function normalizeEmailValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhoneValue(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function findDuplicateByField(collectionName, fieldName, rawValue, excludeId = "") {
  const normalizedValue =
    fieldName === "email" ? normalizeEmailValue(rawValue) : normalizePhoneValue(rawValue);

  if (!normalizedValue) return null;

  const snapshot = await db.collection(collectionName).get();
  const match = snapshot.docs.find((doc) => {
    if (excludeId && doc.id === excludeId) return false;
    const docValue =
      fieldName === "email"
        ? normalizeEmailValue(doc.data()?.[fieldName])
        : normalizePhoneValue(doc.data()?.[fieldName]);

    return Boolean(docValue) && docValue === normalizedValue;
  });

  return match
    ? {
        id: match.id,
        collection: collectionName,
        ...match.data()
      }
    : null;
}

async function ensureUniqueEntityDetails({
  email = "",
  contactNumber = "",
  excludeAgencyId = "",
  excludeEmployerId = "",
  excludeUserUid = ""
}) {
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedPhone = normalizePhoneValue(contactNumber);

  if (normalizedEmail) {
    const [agencyMatch, employerMatch, userMatch] = await Promise.all([
      findDuplicateByField("agencies", "email", normalizedEmail, excludeAgencyId),
      findDuplicateByField("employers", "email", normalizedEmail, excludeEmployerId),
      findDuplicateByField("users", "email", normalizedEmail, excludeUserUid)
    ]);

    const duplicateEmailMatch =
      agencyMatch ||
      employerMatch ||
      (userMatch &&
      userMatch.agencyId !== excludeAgencyId &&
      userMatch.employerId !== excludeEmployerId &&
      userMatch.id !== excludeUserUid
        ? userMatch
        : null);

    if (duplicateEmailMatch) {
      return "Email already exists in the system";
    }
  }

  if (normalizedPhone) {
    const [agencyPhoneMatch, employerPhoneMatch, userPhoneMatch] = await Promise.all([
      findDuplicateByField("agencies", "contactNumber", normalizedPhone, excludeAgencyId),
      findDuplicateByField("employers", "contactNumber", normalizedPhone, excludeEmployerId),
      findDuplicateByField("users", "contactNumber", normalizedPhone, excludeUserUid)
    ]);

    if (agencyPhoneMatch || employerPhoneMatch || userPhoneMatch) {
      return "Contact number already exists in the system";
    }
  }

  return "";
}

const DEFAULT_ENTITY_PASSWORD = "ChangeMe@123";

async function findLinkedUserByField(fieldName, entityId, role) {
  if (!entityId) return null;

  const snapshot = await db
    .collection("users")
    .where("role", "==", role)
    .where(fieldName, "==", entityId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  return snapshot.docs[0];
}

async function createLinkedUserAccount({ email, name, role, agencyId = null, employerId = null }) {
  const normalizedEmail = String(email || "").trim();
  const normalizedName = String(name || "").trim();

  const userRecord = await admin.auth().createUser({
    email: normalizedEmail,
    password: DEFAULT_ENTITY_PASSWORD
  });

  await admin.auth().setCustomUserClaims(userRecord.uid, { role });

  await db.collection("users").doc(userRecord.uid).set({
    name: normalizedName,
    email: normalizedEmail,
    role,
    agencyId: agencyId || null,
    employerId: employerId || null,
    active: true,
    forcePasswordReset: true,
    createdAt: new Date()
  });

  return userRecord.uid;
}

async function syncLinkedUserAccount({ email, name, role, agencyId = null, employerId = null }) {
  const entityId = role === "AGENCY" ? agencyId : employerId;
  const fieldName = role === "AGENCY" ? "agencyId" : "employerId";
  const linkedUserDoc = await findLinkedUserByField(fieldName, entityId, role);

  if (!linkedUserDoc) return;

  const uid = linkedUserDoc.id;
  const normalizedEmail = String(email || "").trim();
  const normalizedName = String(name || "").trim();

  await admin.auth().updateUser(uid, {
    email: normalizedEmail,
    displayName: normalizedName
  });

  await db.collection("users").doc(uid).set(
    {
      name: normalizedName,
      email: normalizedEmail,
      role,
      agencyId: agencyId || null,
      employerId: employerId || null,
      updatedAt: new Date()
    },
    { merge: true }
  );
}

async function deleteLinkedUserAccount(role, entityId) {
  const fieldName = role === "AGENCY" ? "agencyId" : "employerId";
  const linkedUserDoc = await findLinkedUserByField(fieldName, entityId, role);

  if (!linkedUserDoc) return;

  await admin.auth().deleteUser(linkedUserDoc.id);
  await db.collection("users").doc(linkedUserDoc.id).delete();
}


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
      name: userData.name || "",
      email: userData.email,
      role: userData.role,
      forcePasswordReset: userData.forcePasswordReset,
      active: userData.active,
      agencyId: userData.agencyId || null,
      employerId: userData.employerId || null
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

    const name = String(req.body?.name || "").trim();

    if (!name) {
      return res.status(400).json({ message: "Country name is required" });
    }

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

    const {
      name,
      countryId,
      companyPaymentPerApplicant,
      employerIds,
      contactNumber,
      whatsappNumber,
      documentsNeeded
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Company name is required" });
    }

    if (!countryId) {
      return res.status(400).json({ message: "Country is required" });
    }

    const normalizedEmployerIds = normalizeIdList(employerIds);

    const docRef = await admin.firestore().collection("companies").add({
      name: String(name).trim(),
      countryId,
      companyPaymentPerApplicant: Number(companyPaymentPerApplicant || 0) || 0,
      contactNumber: contactNumber || "",
      whatsappNumber: whatsappNumber || "",
      employerIds: normalizedEmployerIds,
      documentsNeeded: normalizeCompanyDocuments(documentsNeeded),
      createdAt: new Date()
    });

    await syncCompanyEmployerLinks(docRef.id, countryId, normalizedEmployerIds, []);

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

    const { name, email, contactNumber, whatsappNumber, address, assignedCompanyIds } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Agency name is required" });
    }

    if (!contactNumber) {
      return res.status(400).json({ message: "Contact number is required" });
    }

    if (!address || !String(address).trim()) {
      return res.status(400).json({ message: "Address is required" });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const duplicateMessage = await ensureUniqueEntityDetails({ email, contactNumber });
    if (duplicateMessage) {
      return res.status(400).json({ message: duplicateMessage });
    }

    const normalizedAssignedCompanyIds = normalizeIdList(assignedCompanyIds);

    const docRef = await admin.firestore().collection("agencies").add({
      name: String(name).trim(),
      email: String(email).trim(),
      contactNumber,
      whatsappNumber: whatsappNumber || "",
      address: String(address).trim(),
      assignedCompanyIds: normalizedAssignedCompanyIds,
      createdAt: new Date()
    });

    await createLinkedUserAccount({
      email,
      name,
      role: "AGENCY",
      agencyId: docRef.id
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

    const { name, email, contactNumber, whatsappNumber, companyId, countryId } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Employer name is required" });
    }

    if (!contactNumber) {
      return res.status(400).json({ message: "Contact number is required" });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const duplicateMessage = await ensureUniqueEntityDetails({ email, contactNumber });
    if (duplicateMessage) {
      return res.status(400).json({ message: duplicateMessage });
    }

    const docRef = await admin.firestore().collection("employers").add({
      name: String(name).trim(),
      email: String(email).trim(),
      contactNumber,
      whatsappNumber: whatsappNumber || "",
      companyId: companyId || null,
      countryId: countryId || null,
      createdAt: new Date()
    });

    await createLinkedUserAccount({
      email,
      name,
      role: "EMPLOYER",
      employerId: docRef.id
    });

    if (companyId) {
      await admin.firestore().collection("companies").doc(companyId).set(
        {
          employerIds: admin.firestore.FieldValue.arrayUnion(docRef.id)
        },
        { merge: true }
      );
    }

    res.json({ message: "Employer added", id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Change password (first login or manual reset)
app.post("/api/auth/change-password", verifyToken, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    // Update Firebase password
    await admin.auth().updateUser(req.user.uid, {
      password: newPassword
    });

    await admin.auth().revokeRefreshTokens(req.user.uid);

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
    const userRole = req.user?.role || "";
    const userId = req.user?.uid || "";
    let snapshot = null;

    if (userRole === "SUPER_USER" || userRole === "ACCOUNTANT") {
      let query = admin.firestore().collection("companies");
      if (countryId) {
        query = query.where("countryId", "==", countryId);
      }
      snapshot = await query.get();
    } else if (userRole === "EMPLOYER") {
      const userDoc = await db.collection("users").doc(userId).get();
      const employerId = userDoc.exists ? userDoc.data()?.employerId : null;
      const employerDoc = employerId ? await db.collection("employers").doc(employerId).get() : null;
      const companyId = employerDoc?.exists ? employerDoc.data()?.companyId : null;
      const docs = [];

      if (companyId) {
        const companyDoc = await db.collection("companies").doc(companyId).get();
        if (companyDoc.exists && (!countryId || companyDoc.data()?.countryId === countryId)) {
          docs.push(companyDoc);
        }
      }

      snapshot = { docs };
    } else if (userRole === "AGENCY") {
      const agencyId = req.user?.agencyId || userId;
      const agencyDoc = await db.collection("agencies").doc(agencyId).get();
      const assignedCompanyIds = agencyDoc.exists ? normalizeIdList(agencyDoc.data()?.assignedCompanyIds) : [];
      const docs = [];

      await Promise.all(
        assignedCompanyIds.map(async (companyIdValue) => {
          const companyDoc = await db.collection("companies").doc(companyIdValue).get();
          if (companyDoc.exists && (!countryId || companyDoc.data()?.countryId === countryId)) {
            docs.push(companyDoc);
          }
        })
      );

      snapshot = { docs };
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

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
    if (req.user.role !== "SUPER_USER") {
      return res.json([]);
    }

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

app.post("/api/auth/check-email", async (req, res) => {
  try {
    const email = normalizeEmailValue(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const snapshot = await db.collection("users").where("email", "==", email).limit(1).get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "Email is not registered in the system" });
    }

    const userData = snapshot.docs[0].data();
    if (userData?.active === false) {
      return res.status(400).json({ message: "User account is inactive" });
    }

    return res.json({ exists: true });
  } catch (error) {
    return res.status(500).json({ message: "Unable to validate email" });
  }
});

app.get("/api/auth/settings", verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const userData = userDoc.data() || {};
    let contactNumber = userData.contactNumber || "";

    if (userData.role === "AGENCY" && userData.agencyId) {
      const agencyDoc = await db.collection("agencies").doc(userData.agencyId).get();
      contactNumber = agencyDoc.exists ? String(agencyDoc.data()?.contactNumber || "") : "";
    } else if (userData.role === "EMPLOYER" && userData.employerId) {
      const employerDoc = await db.collection("employers").doc(userData.employerId).get();
      contactNumber = employerDoc.exists ? String(employerDoc.data()?.contactNumber || "") : "";
    }

    return res.json({
      name: userData.name || "",
      email: userData.email || "",
      role: userData.role || "",
      contactNumber,
      passwordMasked: "********"
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load settings" });
  }
});

app.patch("/api/auth/settings", verifyToken, async (req, res) => {
  try {
    const contactNumber = String(req.body?.contactNumber || "").trim();

    if (!contactNumber) {
      return res.status(400).json({ message: "Contact number is required" });
    }

    const userDoc = await db.collection("users").doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const userData = userDoc.data() || {};
    const duplicateMessage = await ensureUniqueEntityDetails({
      contactNumber,
      excludeAgencyId: userData.agencyId || "",
      excludeEmployerId: userData.employerId || "",
      excludeUserUid: req.user.uid
    });

    if (duplicateMessage) {
      return res.status(400).json({ message: duplicateMessage });
    }

    if (userData.role === "AGENCY" && userData.agencyId) {
      await db.collection("agencies").doc(userData.agencyId).set(
        {
          contactNumber,
          updatedAt: new Date()
        },
        { merge: true }
      );
    } else if (userData.role === "EMPLOYER" && userData.employerId) {
      await db.collection("employers").doc(userData.employerId).set(
        {
          contactNumber,
          updatedAt: new Date()
        },
        { merge: true }
      );
    }

    await db.collection("users").doc(req.user.uid).set(
      {
        contactNumber,
        updatedAt: new Date()
      },
      { merge: true }
    );

    return res.json({ message: "Settings updated successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update settings" });
  }
});

app.post("/api/auth/password-updated", verifyToken, async (req, res) => {
  try {
    await db.collection("users").doc(req.user.uid).set(
      {
        forcePasswordReset: false,
        updatedAt: new Date()
      },
      { merge: true }
    );

    return res.json({ message: "Password status updated" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update password status" });
  }
});

app.patch("/api/countries/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const name = String(req.body?.name || "").trim();

    if (!name) {
      return res.status(400).json({ message: "Country name is required" });
    }

    const countryRef = admin.firestore().collection("countries").doc(id);
    const countryDoc = await countryRef.get();

    if (!countryDoc.exists) {
      return res.status(404).json({ message: "Country not found" });
    }

    await countryRef.set(
      {
        name,
        updatedAt: new Date()
      },
      { merge: true }
    );

    res.json({ message: "Country updated", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/companies/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const {
      name,
      countryId,
      companyPaymentPerApplicant,
      employerIds,
      contactNumber,
      whatsappNumber,
      documentsNeeded
    } = req.body;
    const companyRef = admin.firestore().collection("companies").doc(id);
    const companyDoc = await companyRef.get();

    if (!companyDoc.exists) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Company name is required" });
    }

    if (!countryId) {
      return res.status(400).json({ message: "Country is required" });
    }

    const previousEmployerIds = normalizeIdList(companyDoc.data()?.employerIds);
    const normalizedEmployerIds = normalizeIdList(employerIds);

    await companyRef.set(
      {
        name: String(name).trim(),
        countryId,
        companyPaymentPerApplicant: Number(companyPaymentPerApplicant || 0) || 0,
        contactNumber: contactNumber || "",
        whatsappNumber: whatsappNumber || "",
        employerIds: normalizedEmployerIds,
        documentsNeeded: normalizeCompanyDocuments(documentsNeeded),
        updatedAt: new Date()
      },
      { merge: true }
    );

    await syncCompanyEmployerLinks(id, countryId, normalizedEmployerIds, previousEmployerIds);

    res.json({ message: "Company updated", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/employers/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const { name, email, contactNumber, whatsappNumber, companyId, countryId } = req.body;
    const employerRef = admin.firestore().collection("employers").doc(id);
    const employerDoc = await employerRef.get();

    if (!employerDoc.exists) {
      return res.status(404).json({ message: "Employer not found" });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Employer name is required" });
    }

    if (!contactNumber) {
      return res.status(400).json({ message: "Contact number is required" });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const linkedUserDoc = await findLinkedUserByField("employerId", id, "EMPLOYER");
    const duplicateMessage = await ensureUniqueEntityDetails({
      email,
      contactNumber,
      excludeEmployerId: id,
      excludeUserUid: linkedUserDoc?.id || ""
    });

    if (duplicateMessage) {
      return res.status(400).json({ message: duplicateMessage });
    }

    const previousCompanyId = employerDoc.data()?.companyId || null;

    await employerRef.set(
      {
        name: String(name).trim(),
        email: String(email).trim(),
        contactNumber,
        whatsappNumber: whatsappNumber || "",
        companyId: companyId || null,
        countryId: countryId || null,
        updatedAt: new Date()
      },
      { merge: true }
    );

    if (previousCompanyId && previousCompanyId !== companyId) {
      await admin.firestore().collection("companies").doc(previousCompanyId).set(
        {
          employerIds: admin.firestore.FieldValue.arrayRemove(id)
        },
        { merge: true }
      );
    }

    if (companyId) {
      await admin.firestore().collection("companies").doc(companyId).set(
        {
          employerIds: admin.firestore.FieldValue.arrayUnion(id)
        },
        { merge: true }
      );
    }

    await syncLinkedUserAccount({
      email,
      name,
      role: "EMPLOYER",
      employerId: id
    });

    res.json({ message: "Employer updated", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/agencies/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const { name, email, contactNumber, whatsappNumber, address, assignedCompanyIds } = req.body;
    const agencyRef = admin.firestore().collection("agencies").doc(id);
    const agencyDoc = await agencyRef.get();

    if (!agencyDoc.exists) {
      return res.status(404).json({ message: "Agency not found" });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Agency name is required" });
    }

    if (!contactNumber) {
      return res.status(400).json({ message: "Contact number is required" });
    }

    if (!address || !String(address).trim()) {
      return res.status(400).json({ message: "Address is required" });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const linkedUserDoc = await findLinkedUserByField("agencyId", id, "AGENCY");
    const duplicateMessage = await ensureUniqueEntityDetails({
      email,
      contactNumber,
      excludeAgencyId: id,
      excludeUserUid: linkedUserDoc?.id || ""
    });

    if (duplicateMessage) {
      return res.status(400).json({ message: duplicateMessage });
    }

    await agencyRef.set(
      {
        name: String(name).trim(),
        email: String(email).trim(),
        contactNumber,
        whatsappNumber: whatsappNumber || "",
        address: String(address).trim(),
        assignedCompanyIds: normalizeIdList(assignedCompanyIds),
        updatedAt: new Date()
      },
      { merge: true }
    );

    await syncLinkedUserAccount({
      email,
      name,
      role: "AGENCY",
      agencyId: id
    });

    res.json({ message: "Agency updated", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/companies/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const companyRef = admin.firestore().collection("companies").doc(id);
    const companyDoc = await companyRef.get();

    if (!companyDoc.exists) {
      return res.status(404).json({ message: "Company not found" });
    }

    const employerIds = normalizeIdList(companyDoc.data()?.employerIds);

    if (employerIds.length) {
      const batch = admin.firestore().batch();
      employerIds.forEach((employerId) => {
        const employerRef = admin.firestore().collection("employers").doc(employerId);
        batch.set(
          employerRef,
          {
            companyId: null
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    await companyRef.delete();

    res.json({ message: "Company deleted successfully", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/employers/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const employerRef = admin.firestore().collection("employers").doc(id);
    const employerDoc = await employerRef.get();

    if (!employerDoc.exists) {
      return res.status(404).json({ message: "Employer not found" });
    }

    const previousCompanyId = employerDoc.data()?.companyId || null;

    if (previousCompanyId) {
      await admin.firestore().collection("companies").doc(previousCompanyId).set(
        {
          employerIds: admin.firestore.FieldValue.arrayRemove(id)
        },
        { merge: true }
      );
    }

    await deleteLinkedUserAccount("EMPLOYER", id);
    await employerRef.delete();

    res.json({ message: "Employer deleted successfully", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/agencies/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const agencyRef = admin.firestore().collection("agencies").doc(id);
    const agencyDoc = await agencyRef.get();

    if (!agencyDoc.exists) {
      return res.status(404).json({ message: "Agency not found" });
    }

    await deleteLinkedUserAccount("AGENCY", id);
    await agencyRef.delete();

    res.json({ message: "Agency deleted successfully", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/employers", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.json([]);
    }

    const snapshot = await admin.firestore().collection("employers").get();

    const employers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(employers);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/companies/:id/document-template", verifyToken, upload.single("file"), async (req, res) => {
  try {
    if (req.user.role !== "SUPER_USER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const { documentId } = req.body;
    const file = req.file;

    if (!documentId || !String(documentId).trim()) {
      return res.status(400).json({ message: "Document id is required" });
    }

    if (!file) {
      return res.status(400).json({ message: "Template file is required" });
    }

    const companyRef = admin.firestore().collection("companies").doc(id);
    const companyDoc = await companyRef.get();

    if (!companyDoc.exists) {
      return res.status(404).json({ message: "Company not found" });
    }

    const documentsNeeded = normalizeCompanyDocuments(companyDoc.data()?.documentsNeeded);
    const targetIndex = documentsNeeded.findIndex((document) => document.id === String(documentId).trim());

    if (targetIndex === -1) {
      return res.status(404).json({ message: "Company document not found" });
    }

    const bucket = admin.storage().bucket();
    const safeFileName = String(file.originalname || "template")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `companies/${id}/document-templates/${String(documentId).trim()}_${Date.now()}_${safeFileName}`;
    const fileRef = bucket.file(storagePath);

    await fileRef.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    });

    await fileRef.makePublic();

    documentsNeeded[targetIndex] = {
      ...documentsNeeded[targetIndex],
      templateFileName: file.originalname || safeFileName,
      templateFileUrl: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
      updatedAt: new Date()
    };

    await companyRef.set(
      {
        documentsNeeded,
        updatedAt: new Date()
      },
      { merge: true }
    );

    res.json({
      message: "Template uploaded successfully",
      document: documentsNeeded[targetIndex]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.listen(PORT, () => {
  console.log("Server running successfully on port " + PORT);
});

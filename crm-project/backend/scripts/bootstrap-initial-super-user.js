require("dotenv").config();

const { admin, db } = require("../config/firebase");
const { buildUserProfileRecord } = require("../services/accountService");
const { normalizeEmailValue } = require("../utils/normalizers");

const role = "SUPER_USER";
const email = normalizeEmailValue(process.env.SUPER_USER_EMAIL || "");
const name = String(process.env.SUPER_USER_NAME || "").trim();
const webApiKey = String(process.env.FIREBASE_WEB_API_KEY || "").trim();
const continueUrl = String(process.env.APP_LOGIN_URL || "").trim();

async function sendPasswordResetEmail() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(webApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email,
        continueUrl
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Firebase password-reset email could not be sent (${response.status}).`);
  }
}

async function main() {
  if (process.env.BOOTSTRAP_SUPER_USER !== "true") {
    throw new Error("Set BOOTSTRAP_SUPER_USER=true to run this script.");
  }
  if (!email || !name || !webApiKey || !continueUrl) {
    throw new Error("SUPER_USER_EMAIL, SUPER_USER_NAME, FIREBASE_WEB_API_KEY, and APP_LOGIN_URL are required.");
  }

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { displayName: name });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    user = await admin.auth().createUser({ email, displayName: name });
  }

  await admin.auth().setCustomUserClaims(user.uid, { role });
  await db.collection("users").doc(user.uid).set({
    ...(await buildUserProfileRecord({ email, name, role })),
    active: true,
    forcePasswordReset: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await sendPasswordResetEmail();
  console.log(`Created the initial production SUPER_USER account for ${email} and sent its password-reset email.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

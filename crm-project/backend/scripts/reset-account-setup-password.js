const { admin, db } = require("../config/firebase");
const { buildUserProfileRecord, generateOneTimePassword, sendAccountSetupEmail } = require("../services/accountService");

async function main() {
  const email = String(process.env.TARGET_EMAIL || "").trim().toLowerCase();
  if (!email) throw new Error("TARGET_EMAIL is required");

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    user = null;
  }

  const oneTimePassword = generateOneTimePassword();
  const isNewUser = !user;
  if (!user) {
    user = await admin.auth().createUser({
      email,
      displayName: "Geethashri Rao",
      password: oneTimePassword
    });
    await admin.auth().setCustomUserClaims(user.uid, { role: "SUPER_USER" });
    await db.collection("users").doc(user.uid).set({
      ...(await buildUserProfileRecord({ email, name: "Geethashri Rao", role: "SUPER_USER" })),
      active: true,
      forcePasswordReset: true,
      createdAt: new Date()
    });
  } else {
    const profileSnapshot = await db.collection("users").doc(user.uid).get();
    if (!profileSnapshot.exists) throw new Error("User profile was not found");
    await admin.auth().updateUser(user.uid, { password: oneTimePassword, disabled: false });
    await db.collection("users").doc(user.uid).update({ active: true, forcePasswordReset: true });
  }

  const profileSnapshot = await db.collection("users").doc(user.uid).get();
  const profile = profileSnapshot.data() || {};

  const result = await sendAccountSetupEmail({
    email,
    name: profile.name || user.displayName || "User",
    role: profile.role || "SUPER_USER",
    oneTimePassword
  });

  if (result?.skipped) throw new Error(`Welcome email was not sent: ${result.reason || "unknown"}`);
  console.log(JSON.stringify({ created: isNewUser, reset: !isNewUser, welcomeEmailSent: true }));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

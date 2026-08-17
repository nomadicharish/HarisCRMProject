const { admin, db } = require("../config/firebase");
const { buildUserProfileRecord, generateOneTimePassword, sendAccountSetupEmail } = require("../services/accountService");

async function main() {
  const email = String(process.env.TARGET_EMAIL || "").trim().toLowerCase();
  if (!email) throw new Error("TARGET_EMAIL is required");
  const requestedName = String(process.env.TARGET_NAME || "").trim();

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    user = null;
  }

  const existingProfile = user
    ? (await db.collection("users").doc(user.uid).get()).data() || {}
    : {};
  const name = requestedName || existingProfile.name || user?.displayName || "User";
  // Preserve the account's existing role when resending credentials. This
  // script is also used for non-super-user accounts and must never elevate
  // their permissions as a side effect of a password reset.
  const role = existingProfile.role || "SUPER_USER";
  const oneTimePassword = generateOneTimePassword();
  const isNewUser = !user;
  if (!user) {
    user = await admin.auth().createUser({
      email,
      displayName: name,
      password: oneTimePassword
    });
  } else {
    await admin.auth().updateUser(user.uid, {
      displayName: name,
      password: oneTimePassword,
      disabled: false
    });
  }

  await admin.auth().setCustomUserClaims(user.uid, { role });

  const userProfileRef = db.collection("users").doc(user.uid);
  const profileSnapshot = await userProfileRef.get();
  if (!profileSnapshot.exists) {
    await userProfileRef.set({
      ...(await buildUserProfileRecord({ email, name, role })),
      active: true,
      forcePasswordReset: true,
      createdAt: new Date()
    });
  } else {
    await userProfileRef.update({
      name,
      role,
      active: true,
      forcePasswordReset: true,
      updatedAt: new Date()
    });
  }

  const profile = (await userProfileRef.get()).data() || {};

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

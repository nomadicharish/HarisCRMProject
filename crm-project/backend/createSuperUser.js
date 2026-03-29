const admin = require("./config/firebase");

async function makeSuperUser() {
  const email = "harishnomadic@gmail.com";

  const user = await admin.auth().getUserByEmail(email);

  await admin.auth().setCustomUserClaims(user.uid, {
    role: "SUPER_USER"
  });

  process.exit();
}

makeSuperUser();

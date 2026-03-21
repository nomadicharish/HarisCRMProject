const admin = require("./config/firebase");

async function makeSuperUser() {
  const email = "harishnomadic@gmail.com";

  const user = await admin.auth().getUserByEmail(email);

  await admin.auth().setCustomUserClaims(user.uid, {
    role: "SUPER_USER"
  });

  console.log("SUPER_USER role assigned successfully");
  process.exit();
}

makeSuperUser();

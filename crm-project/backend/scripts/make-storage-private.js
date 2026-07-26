/*
 * One-time production migration. Run with the same Firebase service account
 * used by the API: node scripts/make-storage-private.js
 */
require("dotenv").config();
const { admin } = require("../config/firebase");

async function main() {
  const bucket = admin.storage().bucket();
  const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
  const bindings = (policy.bindings || [])
    .map((binding) => ({
      ...binding,
      members: (binding.members || []).filter((member) => member !== "allUsers" && member !== "allAuthenticatedUsers")
    }))
    .filter((binding) => binding.members.length);

  await bucket.iam.setPolicy({ ...policy, bindings });
  try {
    await bucket.makePrivate({ includeFiles: true, force: true });
  } catch (error) {
    // With uniform bucket-level access, object ACLs are already disabled and
    // the IAM policy above is the only access control to update.
    if (!/uniform bucket-level access|uniform access/i.test(String(error?.message || ""))) throw error;
  }
  console.log(`Bucket ${bucket.name} is private; public IAM members and object ACLs were removed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const { admin } = require("../config/firebase");
const { AppError } = require("../lib/AppError");
const { isSafeStoragePath } = require("../utils/storageFiles");

async function streamFile(req, res) {
  const storagePath = String(req.query.path || "").trim();
  if (!isSafeStoragePath(storagePath)) throw new AppError("Invalid file path", 400);

  // Only application document prefixes may be streamed. Authentication is
  // applied by the route before this controller is reached.
  const allowedPrefixes = [
    "applicants/", "contracts/", "signed-contracts/", "payments/", "appointments/",
    "travel/", "biometric/", "interview-ticket/", "interview-biometric/",
    "embassy-interview-documents/", "visa-collection-documents/", "visa-collection-travel/",
    "visa-travel/", "residence/", "companies/"
  ];
  if (!allowedPrefixes.some((prefix) => storagePath.startsWith(prefix))) {
    throw new AppError("File is not available", 404);
  }

  const file = admin.storage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new AppError("File not found", 404);

  const [metadata] = await file.getMetadata();
  const fileName = String(metadata?.name || storagePath).split("/").pop().replace(/[\r\n\"]/g, "_");
  res.setHeader("Content-Type", metadata?.contentType || "application/octet-stream");
  res.setHeader("Content-Length", metadata?.size || "");
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  file.createReadStream()
    .on("error", (error) => {
      if (!res.headersSent) res.status(500).json({ message: "Unable to stream file" });
      else res.destroy(error);
    })
    .pipe(res);
}

module.exports = { streamFile };

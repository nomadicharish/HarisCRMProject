function extractStoragePath(fileUrl, bucketName) {
  const normalizedUrl = String(fileUrl || "").trim();
  if (!normalizedUrl) return "";

  if (normalizedUrl.startsWith(`gs://${bucketName}/`)) {
    return normalizedUrl.slice(`gs://${bucketName}/`.length);
  }

  const publicPrefix = `https://storage.googleapis.com/${bucketName}/`;
  if (normalizedUrl.startsWith(publicPrefix)) {
    return decodeURIComponent(normalizedUrl.slice(publicPrefix.length).split("?")[0]);
  }

  return "";
}

async function deleteStorageFileIfExists(bucket, fileUrl) {
  const path = extractStoragePath(fileUrl, bucket.name);
  if (!path) return;

  try {
    await bucket.file(path).delete({ ignoreNotFound: true });
  } catch {
    // Best-effort cleanup.
  }
}

async function getAuthorizedReadUrl(bucket, fileUrl, expiresInMs = 15 * 60 * 1000) {
  const path = extractStoragePath(fileUrl, bucket.name);
  // Preserve legacy/external URLs during the public-file transition.
  if (!path) return fileUrl || "";

  const [signedUrl] = await bucket.file(path).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInMs
  });
  return signedUrl;
}

module.exports = {
  deleteStorageFileIfExists,
  extractStoragePath,
  getAuthorizedReadUrl
};


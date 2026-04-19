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

module.exports = {
  deleteStorageFileIfExists,
  extractStoragePath
};


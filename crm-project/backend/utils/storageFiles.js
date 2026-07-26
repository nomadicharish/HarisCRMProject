function extractStoragePath(fileUrl, bucketName) {
  const normalizedUrl = String(fileUrl || "").trim();
  if (!normalizedUrl) return "";

  // New records store the object name directly. Keep URL support temporarily so
  // replacing an existing file also cleans up records created before this change.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedUrl)) {
    return normalizedUrl.replace(/^\/+/, "");
  }

  if (normalizedUrl.startsWith(`gs://${bucketName}/`)) {
    return normalizedUrl.slice(`gs://${bucketName}/`.length);
  }

  const publicPrefix = `https://storage.googleapis.com/${bucketName}/`;
  if (normalizedUrl.startsWith(publicPrefix)) {
    return decodeURIComponent(normalizedUrl.slice(publicPrefix.length).split("?")[0]);
  }

  return "";
}

function isSafeStoragePath(value) {
  const path = String(value || "").trim().replace(/^\/+/, "");
  return Boolean(path) && !path.includes("..") && !path.includes("\\") && !/^[a-z][a-z0-9+.-]*:/i.test(path);
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
  extractStoragePath,
  isSafeStoragePath
};


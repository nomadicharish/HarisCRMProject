import API from "../services/api";

const STORAGE_PATH_PREFIXES = [
  "applicants/", "contracts/", "signed-contracts/", "payments/", "appointments/", "travel/", "biometric/",
  "interview-ticket/", "interview-biometric/", "embassy-interview-documents/", "visa-collection-documents/",
  "visa-collection-travel/", "visa-travel/", "residence/", "companies/"
];

export function getStoragePath(value) {
  const raw = String(value || "").trim();
  if (STORAGE_PATH_PREFIXES.some((prefix) => raw.startsWith(prefix))) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname === "storage.googleapis.com") {
      const [, bucket, ...segments] = url.pathname.split("/");
      return bucket && segments.length ? decodeURIComponent(segments.join("/")) : "";
    }

    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
      return match ? decodeURIComponent(match[1]) : "";
    }

    return "";
  } catch {
    return "";
  }
}

export async function getSecureFileBlob(file) {
  const path = getStoragePath(file);
  if (!path) throw new Error("Unsupported file path");
  // Firebase Hosting can cache a prior error response for the exact document URL.
  // File responses are private/no-store, so every secure read should use a fresh URL.
  const response = await API.get("/files", { params: { path, v: Date.now() }, responseType: "blob" });
  return response.data;
}

export async function downloadSecureFile(file, fileName = "document") {
  const objectUrl = URL.createObjectURL(await getSecureFileBlob(file));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function installSecureFileLinkHandler() {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("a");
    const path = link ? getStoragePath(link.getAttribute("href")) : "";
    if (!path) return;

    event.preventDefault();
    const isDownload = link.hasAttribute("download");
    // Open synchronously while the browser still considers this a user gesture.
    // Opening it after the API request is commonly blocked as a popup.
    const previewWindow = isDownload ? null : window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    try {
      const objectUrl = URL.createObjectURL(await getSecureFileBlob(path));
      if (isDownload) {
        const downloadLink = document.createElement("a");
        downloadLink.href = objectUrl;
        downloadLink.download = link.getAttribute("download") || path.split("/").pop() || "document";
        downloadLink.click();
        URL.revokeObjectURL(objectUrl);
      } else {
        if (previewWindow) previewWindow.location.replace(objectUrl);
        else window.location.assign(objectUrl);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (error) {
      if (previewWindow) previewWindow.close();
      console.error("Unable to open secure file", error);
    }
  });
}

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
    if (url.hostname !== "storage.googleapis.com") return "";
    const [, bucket, ...segments] = url.pathname.split("/");
    return bucket && segments.length ? decodeURIComponent(segments.join("/")) : "";
  } catch {
    return "";
  }
}

export async function getSecureFileBlob(file) {
  const path = getStoragePath(file);
  if (!path) throw new Error("Unsupported file path");
  const response = await API.get("/files", { params: { path }, responseType: "blob" });
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
    try {
      const objectUrl = URL.createObjectURL(await getSecureFileBlob(path));
      if (link.hasAttribute("download")) {
        const downloadLink = document.createElement("a");
        downloadLink.href = objectUrl;
        downloadLink.download = link.getAttribute("download") || path.split("/").pop() || "document";
        downloadLink.click();
        URL.revokeObjectURL(objectUrl);
      } else {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (error) {
      console.error("Unable to open secure file", error);
    }
  });
}

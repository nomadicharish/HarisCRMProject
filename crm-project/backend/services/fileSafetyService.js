const { AppError } = require("../lib/AppError");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAX_ZIP_ENTRIES = 1_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;

function extensionOf(file) {
  return String(file?.originalname || "").split(".").pop().toLowerCase();
}

function startsWith(buffer, signature) {
  return Buffer.isBuffer(buffer) && buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function getZipCentralDirectoryStats(buffer) {
  // Locate End Of Central Directory in the final 64 KiB as required by ZIP.
  const start = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new AppError("Invalid DOCX archive", 400);

  const entries = buffer.readUInt16LE(eocd + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries > MAX_ZIP_ENTRIES || centralDirectoryOffset >= buffer.length) {
    throw new AppError("Document archive exceeds safety limits", 400);
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  let hasContentTypes = false;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new AppError("Invalid DOCX archive", 400);
    }
    totalUncompressedBytes += buffer.readUInt32LE(offset + 24);
    if (totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new AppError("Document archive exceeds safety limits", 400);
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > buffer.length) throw new AppError("Invalid DOCX archive", 400);
    if (buffer.subarray(fileNameStart, fileNameEnd).toString("utf8") === "[Content_Types].xml") hasContentTypes = true;
    offset = fileNameEnd + extraLength + commentLength;
  }

  return { hasContentTypes };
}

function assertFileContentMatchesDeclaredType(file) {
  const extension = extensionOf(file);
  const buffer = file?.buffer;
  if (!buffer?.length) throw new AppError("Uploaded file is empty", 400);

  const valid =
    extension === "pdf" ? buffer.subarray(0, 5).toString("ascii") === "%PDF-" :
    ["jpg", "jpeg"].includes(extension) ? startsWith(buffer, Buffer.from([0xff, 0xd8, 0xff])) :
    extension === "png" ? startsWith(buffer, PNG_SIGNATURE) :
    extension === "doc" ? startsWith(buffer, OLE_SIGNATURE) :
    extension === "docx" ? startsWith(buffer, ZIP_SIGNATURE) :
    false;

  if (!valid) throw new AppError("File contents do not match its declared type", 400);
  if (extension === "docx" && !getZipCentralDirectoryStats(buffer).hasContentTypes) {
    throw new AppError("Invalid DOCX document", 400);
  }
}

async function validateUploadedFiles(req, res, next) {
  try {
    const files = [
      ...(req.file ? [req.file] : []),
      ...(Array.isArray(req.files) ? req.files : []),
      ...(!Array.isArray(req.files) && req.files ? Object.values(req.files).flat() : [])
    ];
    files.forEach(assertFileContentMatchesDeclaredType);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { validateUploadedFiles };

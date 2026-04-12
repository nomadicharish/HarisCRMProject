function sanitizeString(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeOutput(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeOutput);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, sanitizeOutput(entryValue)])
    );
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  return value;
}

function maskValue(value, { visibleStart = 2, visibleEnd = 2 } = {}) {
  const stringValue = String(value || "");
  if (!stringValue) return "";
  if (stringValue.length <= visibleStart + visibleEnd) {
    return "*".repeat(stringValue.length);
  }

  return `${stringValue.slice(0, visibleStart)}${"*".repeat(
    stringValue.length - visibleStart - visibleEnd
  )}${stringValue.slice(-visibleEnd)}`;
}

module.exports = {
  maskValue,
  sanitizeOutput
};

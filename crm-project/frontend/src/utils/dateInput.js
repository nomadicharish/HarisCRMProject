/**
 * Converts an ISO calendar date (YYYY-MM-DD) into a local Date without a UTC
 * conversion. Use this for date-picker values so a user's selected calendar
 * day is never shifted by their timezone.
 */
export function parseDateInput(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

/**
 * Serializes a local Date for APIs and URL filters that accept YYYY-MM-DD.
 */
export function formatDateInput(date) {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

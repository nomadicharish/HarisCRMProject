/**
 * Development-only diagnostic logging.
 *
 * User-facing failures should still be handled at the call site. This helper
 * keeps browser consoles clean in production while retaining actionable
 * context during local development.
 */
export function logError(context, error) {
  if (import.meta.env.DEV) {
    console.error(`[CRM] ${context}`, error);
  }
}

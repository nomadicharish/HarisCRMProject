/**
 * Returns the user-safe message supplied by the API, or the caller's
 * operation-specific fallback. Keeping the fallback at each call site
 * preserves context while centralizing Axios response traversal.
 */
export function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const MAX_TTL_MS = 14 * 60 * 1000;

// Signed document URLs currently expire after 15 minutes. Keep this cache below
// that limit so a cached response never returns an expired URL.
const configuredTtl = Number(process.env.APPLICANT_DOCUMENT_CACHE_TTL_MS || DEFAULT_TTL_MS);
const ttlMs = Math.max(5_000, Math.min(Number.isFinite(configuredTtl) ? configuredTtl : DEFAULT_TTL_MS, MAX_TTL_MS));
const latestDocumentsCache = new Map();

function getLatestDocumentsCache(applicantId) {
  const item = latestDocumentsCache.get(applicantId);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    latestDocumentsCache.delete(applicantId);
    return null;
  }
  return item.value;
}

function setLatestDocumentsCache(applicantId, documents) {
  latestDocumentsCache.set(applicantId, {
    value: documents,
    expiresAt: Date.now() + ttlMs
  });
}

function invalidateLatestDocumentsCache(applicantId) {
  latestDocumentsCache.delete(applicantId);
}

module.exports = {
  getLatestDocumentsCache,
  setLatestDocumentsCache,
  invalidateLatestDocumentsCache
};

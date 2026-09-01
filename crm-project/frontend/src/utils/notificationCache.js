const CACHE_PREFIX = "crm_notification_cache:";
const CACHE_VERSION = 1;
const MAX_CACHED_NOTIFICATIONS = 100;
const READ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value?._seconds) return Number(value._seconds) * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1e6);
  return 0;
}

function keyFor(userId, scope) {
  return `${CACHE_PREFIX}${userId}:${scope}`;
}

function prune(items = []) {
  const now = Date.now();
  return items
    .filter((item) => !(item?.read && timestampMs(item.readAt) && timestampMs(item.readAt) + READ_RETENTION_MS <= now))
    .sort((left, right) => timestampMs(right.createdAt) - timestampMs(left.createdAt))
    .slice(0, MAX_CACHED_NOTIFICATIONS);
}

export function readNotificationCache(userId, scope = "list") {
  if (!userId) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(keyFor(userId, scope)) || "null");
    if (!cached || cached.version !== CACHE_VERSION || !Array.isArray(cached.items)) return null;
    return { ...cached, items: prune(cached.items) };
  } catch {
    return null;
  }
}

export function writeNotificationCache(userId, scope, value = {}) {
  if (!userId) return null;
  const next = {
    version: CACHE_VERSION,
    items: prune(value.items || []),
    syncCursor: value.syncCursor || "",
    hasMore: Boolean(value.hasMore),
    nextCursor: value.nextCursor || null,
    savedAt: Date.now()
  };
  try {
    localStorage.setItem(keyFor(userId, scope), JSON.stringify(next));
  } catch {
    // A full or unavailable browser store must never block notifications.
  }
  return next;
}

export function mergeNotificationItems(current = [], changes = []) {
  const byId = new Map(current.map((item) => [item.id, item]));
  changes.forEach((item) => {
    if (item?.id) byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
  });
  return prune([...byId.values()]);
}

export function clearNotificationCaches() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore unavailable browser storage
  }
}

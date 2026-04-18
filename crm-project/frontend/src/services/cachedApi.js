import API from "./api";
import { queryClient } from "./queryClient";

const staleTimeByKey = new Map();

function toStaleTime(ttlMs) {
  const parsed = Number(ttlMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

function buildKey(url, params = {}) {
  const serializedParams = Object.keys(params || {})
    .sort()
    .map((key) => `${key}=${Array.isArray(params[key]) ? params[key].join(",") : String(params[key])}`)
    .join("&");
  return serializedParams ? `${url}?${serializedParams}` : url;
}

export async function getCached(url, { params = {}, ttlMs = 30000, force = false } = {}) {
  const key = buildKey(url, params);
  const queryKey = ["api", key];
  const staleTime = toStaleTime(ttlMs);
  staleTimeByKey.set(key, staleTime);

  if (force) {
    queryClient.removeQueries({ queryKey, exact: true });
  }

  return queryClient.fetchQuery({
    queryKey,
    queryFn: async () => {
      const response = await API.get(url, { params });
      return response.data;
    },
    staleTime
  });
}

export function hasFreshCache(url, { params = {} } = {}) {
  const key = buildKey(url, params);
  const state = queryClient.getQueryState(["api", key]);
  if (!state?.dataUpdatedAt) return false;

  const staleTime = Number(staleTimeByKey.get(key) || 0);
  if (!staleTime) return false;

  return Date.now() - state.dataUpdatedAt < staleTime;
}

export function invalidateCache(prefix = "") {
  if (!prefix) {
    queryClient.invalidateQueries({ queryKey: ["api"] });
    return;
  }

  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = Array.isArray(query.queryKey) ? query.queryKey[1] : "";
      return typeof key === "string" && key.startsWith(prefix);
    }
  });
}

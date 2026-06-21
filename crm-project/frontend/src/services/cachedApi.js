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

export function prefetchCached(url, { params = {}, ttlMs = 30000 } = {}) {
  const key = buildKey(url, params);
  const queryKey = ["api", key];
  const staleTime = toStaleTime(ttlMs);
  staleTimeByKey.set(key, staleTime);

  return queryClient.prefetchQuery({
    queryKey,
    queryFn: async () => {
      const response = await API.get(url, { params });
      return response.data;
    },
    staleTime
  });
}

export function readCached(url, { params = {} } = {}) {
  const key = buildKey(url, params);
  return queryClient.getQueryData(["api", key]);
}

export function writeCached(url, data, { params = {}, ttlMs = 30000 } = {}) {
  const key = buildKey(url, params);
  const staleTime = toStaleTime(ttlMs);
  staleTimeByKey.set(key, staleTime);
  queryClient.setQueryData(["api", key], data);
}

export function updateCached(url, updater, { params = {}, ttlMs = 30000 } = {}) {
  const key = buildKey(url, params);
  const staleTime = toStaleTime(ttlMs);
  staleTimeByKey.set(key, staleTime);
  queryClient.setQueryData(["api", key], (current) =>
    typeof updater === "function" ? updater(current) : current
  );
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

  const prefixes = [prefix];
  if (prefix.startsWith("/applicants")) prefixes.push("/dashboard");

  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = Array.isArray(query.queryKey) ? query.queryKey[1] : "";
      return typeof key === "string" && prefixes.some((candidate) => key.startsWith(candidate));
    }
  });
}

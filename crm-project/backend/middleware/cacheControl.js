function readCache(maxAgeSeconds = 30) {
  const safeMaxAge = Math.max(5, Number(maxAgeSeconds || 30));

  return function readCacheMiddleware(req, res, next) {
    res.setHeader("Cache-Control", `private, max-age=${safeMaxAge}, stale-while-revalidate=${safeMaxAge * 2}`);
    res.setHeader("Vary", "Authorization, Accept-Encoding");
    next();
  };
}

module.exports = { readCache };

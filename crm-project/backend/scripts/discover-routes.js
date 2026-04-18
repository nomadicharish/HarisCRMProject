const fs = require("node:fs");
const path = require("node:path");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseRouteModuleMap(appSource = "") {
  const moduleMap = new Map();
  const requireRegex = /const\s+([A-Za-z0-9_]+)\s*=\s*require\(["']\.\/routes\/([^"']+)["']\);/g;
  let match;
  while ((match = requireRegex.exec(appSource))) {
    moduleMap.set(match[1], `backend/routes/${match[2]}.js`);
  }
  return moduleMap;
}

function parseMounts(appSource = "") {
  const mounts = [];
  const mountRegex = /app\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
  let match;
  while ((match = mountRegex.exec(appSource))) {
    mounts.push({
      prefix: match[1],
      variable: match[2]
    });
  }
  return mounts;
}

function parseRoutesFromFile(fileSource = "") {
  const routes = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = routeRegex.exec(fileSource))) {
    routes.push({
      method: match[1].toLowerCase(),
      path: match[2]
    });
  }
  return routes;
}

function joinPath(prefix, routePath) {
  const left = String(prefix || "").replace(/\/+$/, "");
  const right = String(routePath || "").replace(/^\/+/, "");
  if (!left) return `/${right}`;
  if (!right) return left || "/";
  return `${left}/${right}`.replace(/\/+/g, "/");
}

function discoverApiRoutes(projectRoot) {
  const appPath = path.resolve(projectRoot, "backend/app.js");
  const appSource = readFile(appPath);
  const moduleMap = parseRouteModuleMap(appSource);
  const mounts = parseMounts(appSource);

  const discovered = [];

  mounts.forEach(({ prefix, variable }) => {
    const routeRelativePath = moduleMap.get(variable);
    if (!routeRelativePath) return;

    const routeFilePath = path.resolve(projectRoot, routeRelativePath);
    if (!fs.existsSync(routeFilePath)) return;

    const routeSource = readFile(routeFilePath);
    const routes = parseRoutesFromFile(routeSource);

    routes.forEach((route) => {
      discovered.push({
        method: route.method,
        path: joinPath(prefix, route.path)
      });
    });
  });

  const unique = new Map();
  discovered.forEach((entry) => {
    const key = `${entry.method}:${entry.path}`;
    unique.set(key, entry);
  });

  return Array.from(unique.values()).sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.method.localeCompare(b.method);
  });
}

module.exports = {
  discoverApiRoutes
};

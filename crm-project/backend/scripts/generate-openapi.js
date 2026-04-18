const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const { routeContracts } = require("../contracts/routeContracts");
const { discoverApiRoutes } = require("./discover-routes");

function safeToJsonSchema(schema, fallback = { type: "object" }) {
  try {
    return z.toJSONSchema(schema);
  } catch {
    return fallback;
  }
}

function defaultTagForPath(apiPath = "") {
  if (apiPath.startsWith("/api/applicants")) return "Applicants";
  if (apiPath.startsWith("/api/agents")) return "Agents";
  if (apiPath.startsWith("/api/auth")) return "Auth";
  if (apiPath.startsWith("/api/dashboard")) return "Dashboard";
  if (apiPath.startsWith("/api/change-feed")) return "ChangeFeed";
  if (apiPath.startsWith("/api/users")) return "Users";
  return "Entities";
}

function defaultSummary(method, routePath) {
  const resource = String(routePath || "").split("/").filter(Boolean).slice(1).join(" ");
  return `${String(method || "").toUpperCase()} ${resource || "resource"}`;
}

function makeOperation(discoveredRoute, contractMap) {
  const key = `${discoveredRoute.method}:${discoveredRoute.path.replace(/^\/api/, "")}`;
  const contract = contractMap.get(key);

  const operation = {
    tags: contract?.tags || [defaultTagForPath(discoveredRoute.path)],
    summary: contract?.summary || defaultSummary(discoveredRoute.method, discoveredRoute.path),
    responses: {
      200: { description: "Success" },
      400: { description: "Bad Request" },
      401: { description: "Unauthorized" }
    }
  };

  if (!contract || contract.security !== false) {
    operation.security = [{ bearerAuth: [] }];
  }

  if (contract?.query) {
    const querySchema = safeToJsonSchema(contract.query, { type: "object", properties: {} });
    const properties = querySchema.properties || {};
    operation.parameters = Object.entries(properties).map(([name, schema]) => ({
      in: "query",
      name,
      required: Array.isArray(querySchema.required) ? querySchema.required.includes(name) : false,
      schema
    }));
  }

  if (contract?.body) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: safeToJsonSchema(contract.body)
        }
      }
    };
  }

  return operation;
}

function buildOpenApiDoc(projectRoot) {
  const discoveredRoutes = discoverApiRoutes(projectRoot);
  const contractMap = new Map(
    routeContracts.map((contract) => [`${contract.method}:${contract.path}`, contract])
  );

  const doc = {
    openapi: "3.0.3",
    info: {
      title: "CRM Backend API (Generated)",
      version: "1.0.0"
    },
    servers: [{ url: "http://localhost:3000" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    },
    paths: {}
  };

  discoveredRoutes.forEach((route) => {
    if (!doc.paths[route.path]) doc.paths[route.path] = {};
    doc.paths[route.path][route.method] = makeOperation(route, contractMap);
  });

  return doc;
}

function writeOpenApiDoc(projectRoot) {
  const openapi = buildOpenApiDoc(projectRoot);
  const outputPath = path.resolve(projectRoot, "docs/openapi.generated.json");
  fs.writeFileSync(outputPath, JSON.stringify(openapi, null, 2));
  return outputPath;
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, "../..");
  const outputPath = writeOpenApiDoc(projectRoot);
  process.stdout.write(`Generated ${outputPath}\n`);
}

module.exports = {
  buildOpenApiDoc,
  writeOpenApiDoc
};

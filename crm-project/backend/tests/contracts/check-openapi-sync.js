const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { buildOpenApiDoc } = require("../../scripts/generate-openapi");

function run() {
  const projectRoot = path.resolve(__dirname, "../../..");
  const generated = JSON.stringify(buildOpenApiDoc(projectRoot), null, 2);
  const targetPath = path.resolve(projectRoot, "docs/openapi.generated.json");

  if (!fs.existsSync(targetPath)) {
    throw new Error("Missing docs/openapi.generated.json. Run: npm run generate:openapi");
  }

  const existing = fs.readFileSync(targetPath, "utf8");
  assert.equal(
    existing,
    generated,
    "OpenAPI contract drift detected. Run: npm run generate:openapi"
  );

  process.stdout.write("OpenAPI contract sync check passed\n");
}

run();

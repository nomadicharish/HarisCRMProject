const fs = require("node:fs");
const path = require("node:path");

function run() {
  const unitDir = __dirname;
  const testFiles = fs
    .readdirSync(unitDir)
    .filter((fileName) => fileName.endsWith(".unit.test.js"))
    .sort();

  for (const fileName of testFiles) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const runTest = require(path.join(unitDir, fileName));
    if (typeof runTest === "function") {
      runTest();
      process.stdout.write(`PASS ${fileName}\n`);
    }
  }

  process.stdout.write("Unit checks passed\n");
}

run();

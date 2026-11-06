// The World's ABI file and the deploy page's contracts must match what was just compiled.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { generate } = require("../scripts/export.cjs");

describe("exported ABI and bytecode", () => {
  it("are up to date with the compiled contracts (npm run export)", () => {
    for (const [file, text] of Object.entries(generate())) {
      assert.equal(fs.readFileSync(file, "utf8"), text, `${file} is stale: run npm run export in contracts/`);
    }
  });
});

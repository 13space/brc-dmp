import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateEvent } from "../packages/schema/src/validate.js";

async function loadJsonFiles(directory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const values = [];
  for (const file of files) {
    values.push({
      file,
      value: JSON.parse(await readFile(path.join(directory, file), "utf8"))
    });
  }
  return values;
}

test("valid fixtures pass protocol validation", async () => {
  for (const { file, value } of await loadJsonFiles("fixtures/valid")) {
    const result = validateEvent(value);
    assert.equal(result.valid, true, `${file}: ${result.issues.join("; ")}`);
  }
});

test("invalid fixtures are rejected", async () => {
  for (const { file, value } of await loadJsonFiles("fixtures/invalid")) {
    const result = validateEvent(value);
    assert.equal(result.valid, false, `${file} should be invalid`);
  }
});

test("schema documents are parseable JSON", async () => {
  const schemaDirs = ["packages/schema", "packages/schema/events"];
  for (const directory of schemaDirs) {
    for (const { file } of await loadJsonFiles(directory)) {
      assert.match(file, /\.json$/);
    }
  }
});

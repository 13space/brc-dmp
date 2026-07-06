import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateEvent } from "./validate.js";

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("Usage: node packages/schema/src/cli.js <fixture-dir> [fixture-dir...]");
  process.exit(1);
}

let failures = 0;

for (const target of targets) {
  const files = (await readdir(target))
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const fullPath = path.join(target, file);
    const event = JSON.parse(await readFile(fullPath, "utf8"));
    const result = validateEvent(event);
    const shouldBeInvalid = target.includes(`${path.sep}invalid`) || path.basename(target) === "invalid";

    if (result.valid === shouldBeInvalid) {
      failures += 1;
      const status = result.valid ? "valid" : "invalid";
      console.error(`${fullPath}: expected ${shouldBeInvalid ? "invalid" : "valid"}, got ${status}`);
      if (!result.valid) console.error(`  ${result.issues.join("; ")}`);
    } else {
      console.log(`${fullPath}: ok`);
    }
  }
}

if (failures > 0) {
  process.exit(1);
}

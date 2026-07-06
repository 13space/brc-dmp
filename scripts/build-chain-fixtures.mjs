import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { buildChainFixtureTxs } from "../services/csv-adapter/src/chain-fixtures.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chainDir = path.join(root, "fixtures/chain");
const createEvent = JSON.parse(await readFile(path.join(root, "fixtures/valid/001-create-rwa.json"), "utf8"));
const attestEvent = JSON.parse(await readFile(path.join(root, "fixtures/chain/offchain/002-attest-rwa.json"), "utf8"));
const txs = buildChainFixtureTxs(createEvent, attestEvent);

await mkdir(chainDir, { recursive: true });
const names = ["tx-001-inscription-create.json", "tx-002-inscription-attest.json", "tx-003-opreturn-hash-attest.json"];
for (const [index, tx] of txs.entries()) {
  const file = path.join(chainDir, names[index]);
  await writeFile(file, `${JSON.stringify(tx, null, 2)}\n`, "utf8");
  console.log(`wrote ${file}`);
}

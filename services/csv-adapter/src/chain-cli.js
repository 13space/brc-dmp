import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEsploraBitcoin } from "./bitcoin-esplora.js";
import { createHashResolver, indexChainEvents, loadOffchainEventMap, scanAndIndexTransactions } from "./chain-indexer.js";
import { scanTransactions } from "./chain-scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const chainFixtureDir = path.resolve(projectRoot, "fixtures/chain");

const command = process.argv[2] || "scan-fixtures";

if (command === "scan-fixtures") {
  const txs = await loadChainFixtures(chainFixtureDir);
  const offchain = await loadOffchainEventMap(path.join(chainFixtureDir, "offchain"));
  const result = await scanAndIndexTransactions(txs, {
    resolveEventByHash: createHashResolver(offchain)
  });
  printResult(result);
} else if (command === "scan-block") {
  const block = Number(process.argv[3]);
  if (!Number.isInteger(block) || block < 0) throw new Error("usage: node chain-cli.js scan-block <height>");
  const backend = createEsploraBitcoin();
  const baseUrl = backend.baseUrl;
  const fetchImpl = globalThis.fetch;
  const hash = await fetchJson(`${baseUrl}/block-height/${block}`, fetchImpl);
  const blockBody = await fetchJson(`${baseUrl}/block/${hash}/txs`, fetchImpl);
  const result = await scanAndIndexTransactions(blockBody);
  printResult(result);
} else {
  throw new Error(`unknown command: ${command}`);
}

async function loadChainFixtures(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json") && file.startsWith("tx-"))
    .sort();
  const txs = [];
  for (const file of files) {
    txs.push(JSON.parse(await readFile(path.join(directory, file), "utf8")));
  }
  return txs;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`fetch failed ${response.status} ${url}`);
  return response.json();
}

function printResult(result) {
  console.log("\nBRC-DMP Chain Adapter");
  console.log("=".repeat(64));
  console.log(`events indexed: ${result.event_count}`);
  console.log(`assets: ${result.state.assets.length}`);
  console.log(`state_root: ${result.state.state_root}`);
  console.log(`engine_root: ${result.world.engine_root}`);
  console.log(`life: alive ${result.world.alive}/${result.world.population}`);
  for (const event of result.events) {
    console.log(
      `- ${event.op} ${event.dmo_id} @ btc#${event.source?.block} ${event.chain_meta?.transport || "fixture"}`
    );
  }
  console.log("");
}

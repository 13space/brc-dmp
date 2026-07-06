import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEsploraBitcoin } from "./bitcoin-esplora.js";
import { loadChainFixtureTxs } from "./chain-fixtures.js";
import { createHashResolver, loadOffchainEventMap, scanAndIndexTransactions } from "./chain-indexer.js";
import { createChainIngestor } from "./chain-ingest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const chainFixtureDir = path.resolve(projectRoot, "fixtures/chain");

const command = process.argv[2] || "scan-fixtures";

if (command === "scan-fixtures") {
  const txs = await loadChainFixtureTxs(chainFixtureDir);
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
} else if (command === "ingest-fixtures") {
  const statePath = process.env.BRC_CHAIN_STATE_PATH || path.join(projectRoot, ".tmp/chain-ingest/state.json");
  const ingestor = createChainIngestor({
    statePath,
    offchainDir: path.join(chainFixtureDir, "offchain")
  });
  await ingestor.init();
  const txs = await loadChainFixtureTxs(chainFixtureDir);
  const result = await ingestor.ingestTransactions(txs);
  ingestor.getState().last_height = 840011;
  ingestor.getState().tip_height = 840011;
  await ingestor.persist();
  const snapshot = await ingestor.getSnapshot();
  console.log("\nBRC-DMP Chain Ingest (fixtures)");
  console.log("=".repeat(64));
  console.log(`events added: ${result.added_events}`);
  console.log(`state_root: ${snapshot.indexed.state.state_root}`);
  console.log(`stored at: ${statePath}`);
  console.log("");
} else {
  throw new Error(`unknown command: ${command} (scan-fixtures | scan-block | ingest-fixtures)`);
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

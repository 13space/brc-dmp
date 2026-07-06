import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChainIngestor } from "./chain-ingest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const command = process.argv[2] || "catch-up";
const pollMs = Number(process.env.BRC_CHAIN_POLL_MS || 30_000);
const statePath = process.env.BRC_CHAIN_STATE_PATH || path.join(projectRoot, ".tmp/chain-ingest/state.json");
const offchainDir = process.env.BRC_CHAIN_OFFCHAIN_DIR || path.join(projectRoot, "fixtures/chain/offchain");
const baseUrl = process.env.BRC_ESPLORA;

const ingestor = createChainIngestor({ statePath, offchainDir, baseUrl });

if (command === "catch-up") {
  const from = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;
  await ingestor.init();
  const start = from ?? Math.max(0, ingestor.getState().last_height + 1);
  const summary = await ingestor.catchUp({ fromHeight: start });
  printSnapshot(summary);
} else if (command === "daemon") {
  await ingestor.init();
  console.log(`chain ingest daemon polling every ${pollMs}ms`);
  console.log(`state: ${statePath}`);
  console.log(`esplora: ${baseUrl || "https://blockstream.info/signet/api"}`);
  for (;;) {
    try {
      const state = ingestor.getState();
      const from = Math.max(0, state.last_height + 1);
      const summary = await ingestor.catchUp({ fromHeight: from });
      if (summary.blocks > 0) printSnapshot(summary);
    } catch (error) {
      console.error(`[chain-ingest] ${error.message}`);
    }
    await sleep(pollMs);
  }
} else if (command === "status") {
  await ingestor.init();
  printSnapshot({ status_only: true });
} else {
  throw new Error(`unknown command: ${command} (catch-up | daemon | status)`);
}

async function printSnapshot(summary) {
  const { ingest, indexed } = await ingestor.getSnapshot();
  console.log("\nBRC-DMP Chain Ingest");
  console.log("=".repeat(64));
  if (!summary.status_only) {
    console.log(`blocks scanned: ${summary.blocks ?? 0}`);
    console.log(`events added: ${summary.added_events ?? 0}`);
  }
  console.log(`last_height: ${ingest.last_height}`);
  console.log(`tip_height: ${ingest.tip_height ?? "?"}`);
  console.log(`stored events: ${ingest.event_count}`);
  console.log(`assets: ${indexed.state.assets.length}`);
  console.log(`state_root: ${indexed.state.state_root}`);
  console.log(`engine_root: ${indexed.world.engine_root}`);
  for (const event of indexed.events) {
    console.log(`- ${event.op} ${event.dmo_id} @ btc#${event.source?.block} ${event.chain_meta?.transport || "?"}`);
  }
  console.log("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

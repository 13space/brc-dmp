import { resolveChainConfig } from "./chain-config.js";
import { createChainIngestor } from "./chain-ingest.js";

const config = resolveChainConfig();
const command = process.argv[2] || "catch-up";
const ingestor = createChainIngestor({
  statePath: config.statePath,
  offchainDir: config.offchainDir,
  baseUrl: config.baseUrl,
  network: config.network
});

if (command === "catch-up") {
  const from = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;
  await ingestor.init();
  const start = from ?? Math.max(0, ingestor.getState().last_height + 1);
  const summary = await ingestor.catchUp({ fromHeight: start });
  await printSnapshot(summary);
} else if (command === "daemon") {
  await ingestor.init();
  console.log(`BRC-DMP chain ingest daemon (${config.network})`);
  console.log(`polling every ${config.pollMs}ms`);
  console.log(`state: ${config.statePath}`);
  console.log(`esplora: ${config.baseUrl}`);
  console.log(`offchain: ${config.offchainDir}`);
  for (;;) {
    try {
      const state = ingestor.getState();
      const from = Math.max(0, state.last_height + 1);
      const summary = await ingestor.catchUp({ fromHeight: from });
      if (summary.blocks > 0) await printSnapshot(summary);
    } catch (error) {
      console.error(`[chain-ingest] ${error.message}`);
    }
    await sleep(config.pollMs);
  }
} else if (command === "bootstrap") {
  const txid = process.argv[3];
  if (!txid) throw new Error("usage: chain-daemon.js bootstrap <txid>");
  const summary = await ingestor.bootstrapFromTxid(txid);
  console.log("\nBRC-DMP Chain Ingest Bootstrap");
  console.log("=".repeat(64));
  console.log(`network: ${config.network}`);
  console.log(`anchor tx: ${summary.bootstrap.txid}`);
  console.log(`start height: ${summary.bootstrap.height}`);
  console.log(`blocks scanned: ${summary.blocks}`);
  console.log(`events added: ${summary.added_events}`);
  await printSnapshot(summary);
} else if (command === "status") {
  await ingestor.init();
  await printSnapshot({ status_only: true });
} else {
  throw new Error(`unknown command: ${command} (catch-up | daemon | bootstrap | status)`);
}

async function printSnapshot(summary) {
  const { ingest, indexed } = await ingestor.getSnapshot();
  console.log("\nBRC-DMP Chain Ingest");
  console.log("=".repeat(64));
  if (!summary.status_only) {
    console.log(`blocks scanned: ${summary.blocks ?? 0}`);
    console.log(`events added: ${summary.added_events ?? 0}`);
  }
  console.log(`network: ${ingest.network}`);
  console.log(`esplora: ${ingest.esplora_base}`);
  if (ingest.bootstrap) {
    console.log(`bootstrap: ${ingest.bootstrap.txid} @ height ${ingest.bootstrap.height}`);
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

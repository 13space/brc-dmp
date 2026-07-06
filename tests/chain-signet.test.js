import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildChainFixtureTxs } from "../services/csv-adapter/src/chain-fixtures.js";
import { resolveChainConfig, SIGNET_ESPLORA } from "../services/csv-adapter/src/chain-config.js";
import { createChainIngestor } from "../services/csv-adapter/src/chain-ingest.js";

const CREATE_EVENT = JSON.parse(await readFile("fixtures/valid/001-create-rwa.json", "utf8"));
const ATTEST_EVENT = JSON.parse(await readFile("fixtures/chain/offchain/002-attest-rwa.json", "utf8"));

test("resolveChainConfig defaults to signet Esplora and per-network state path", () => {
  const config = resolveChainConfig({
    BRC_CHAIN_NETWORK: "signet",
    BRC_ESPLORA: undefined,
    BRC_CHAIN_STATE_PATH: undefined,
    BRC_CHAIN_OFFCHAIN_DIR: undefined,
    BRC_CHAIN_POLL_MS: "15000"
  });
  assert.equal(config.network, "signet");
  assert.equal(config.baseUrl, SIGNET_ESPLORA);
  assert.match(config.statePath, /\/\.tmp\/chain-ingest\/signet\/state\.json$/);
  assert.equal(config.pollMs, 15000);
});

test("blockTxs paginates Esplora block pages", async () => {
  const txs = buildChainFixtureTxs(CREATE_EVENT, ATTEST_EVENT);
  const pageOne = Array.from({ length: 25 }, (_, index) => ({
    txid: `aa${String(index).padStart(62, "0")}`,
    status: { confirmed: true, block_height: 840000 }
  }));
  pageOne[0] = txs[0];
  const fetchImpl = async (url) => {
    if (url.endsWith("/block-height/840000")) return { ok: true, text: async () => '"hash000"' };
    if (url.endsWith("/block/hash000/txs")) return { ok: true, text: async () => JSON.stringify(pageOne) };
    if (url.endsWith("/block/hash000/txs/25")) return { ok: true, text: async () => JSON.stringify([txs[1], txs[2]]) };
    if (url.endsWith("/blocks/tip/height")) return { ok: true, text: async () => "840000" };
    return { ok: false, status: 404, text: async () => "" };
  };

  const ingestor = createChainIngestor({
    offchainDir: "fixtures/chain/offchain",
    baseUrl: "https://mock.esplora",
    network: "signet",
    fetchImpl
  });

  const block = await ingestor.blockTxs(840000);
  assert.equal(block.length, 27);
  const summary = await ingestor.catchUp({ fromHeight: 840000, toHeight: 840000 });
  assert.equal(summary.added_events, 3);
});

test("bootstrapFromTxid starts ingest at the anchor block and catches up", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "brc-chain-bootstrap-"));
  const statePath = path.join(dir, "state.json");
  const txs = buildChainFixtureTxs(CREATE_EVENT, ATTEST_EVENT);
  const anchorTxid = txs[0].txid;
  const fetchImpl = async (url) => {
    if (url.endsWith(`/tx/${anchorTxid}`)) {
      return { ok: true, text: async () => JSON.stringify(txs[0]) };
    }
    if (url.endsWith("/blocks/tip/height")) return { ok: true, text: async () => "840011" };
    if (url.endsWith("/block-height/840000")) return { ok: true, text: async () => '"hash000"' };
    if (url.endsWith("/block-height/840010")) return { ok: true, text: async () => '"hash010"' };
    if (url.endsWith("/block-height/840011")) return { ok: true, text: async () => '"hash011"' };
    if (url.match(/\/block-height\/\d+$/)) return { ok: true, text: async () => '"hashempty"' };
    if (url.endsWith("/block/hash000/txs")) return { ok: true, text: async () => JSON.stringify([txs[0]]) };
    if (url.endsWith("/block/hash010/txs")) return { ok: true, text: async () => JSON.stringify([txs[1]]) };
    if (url.endsWith("/block/hash011/txs")) return { ok: true, text: async () => JSON.stringify([txs[2]]) };
    if (url.endsWith("/txs")) return { ok: true, text: async () => "[]" };
    return { ok: false, status: 404, text: async () => "" };
  };

  const ingestor = createChainIngestor({
    statePath,
    offchainDir: "fixtures/chain/offchain",
    baseUrl: "https://mock.esplora",
    network: "signet",
    fetchImpl
  });

  const summary = await ingestor.bootstrapFromTxid(anchorTxid);
  assert.equal(summary.bootstrap.txid, anchorTxid);
  assert.equal(summary.bootstrap.height, 840000);
  assert.equal(summary.blocks, 12);
  assert.equal(summary.added_events, 3);

  const snapshot = await ingestor.getSnapshot();
  assert.equal(snapshot.ingest.network, "signet");
  assert.equal(snapshot.ingest.bootstrap.txid, anchorTxid);
  assert.equal(snapshot.indexed.state.assets.length, 1);

  await rm(dir, { recursive: true, force: true });
});

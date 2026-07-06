import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildChainFixtureTxs } from "../services/csv-adapter/src/chain-fixtures.js";
import { createChainIngestor } from "../services/csv-adapter/src/chain-ingest.js";
import { loadOffchainEventMap } from "../services/csv-adapter/src/chain-indexer.js";

const CREATE_EVENT = JSON.parse(await readFile("fixtures/valid/001-create-rwa.json", "utf8"));
const ATTEST_EVENT = JSON.parse(await readFile("fixtures/chain/offchain/002-attest-rwa.json", "utf8"));

test("committed chain tx fixtures match the generator", async () => {
  const generated = buildChainFixtureTxs(CREATE_EVENT, ATTEST_EVENT);
  const files = [
    "fixtures/chain/tx-001-inscription-create.json",
    "fixtures/chain/tx-002-inscription-attest.json",
    "fixtures/chain/tx-003-opreturn-hash-attest.json"
  ];
  for (const [index, file] of files.entries()) {
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(saved, generated[index], file);
  }
});

test("chain ingestor persists fixture txs and rebuilds indexed state", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "brc-chain-ingest-"));
  const statePath = path.join(dir, "state.json");
  const txs = buildChainFixtureTxs(CREATE_EVENT, ATTEST_EVENT);
  const ingestor = createChainIngestor({
    statePath,
    offchainDir: "fixtures/chain/offchain"
  });

  await ingestor.init();
  const first = await ingestor.ingestTransactions(txs);
  assert.equal(first.added_events, 3);
  assert.equal(first.added_txs, 3);

  const second = await ingestor.ingestTransactions(txs);
  assert.equal(second.added_events, 0);
  assert.equal(second.added_txs, 0);

  ingestor.getState().last_height = 840011;
  ingestor.getState().tip_height = 840011;
  await ingestor.persist();

  const reloaded = createChainIngestor({ statePath, offchainDir: "fixtures/chain/offchain" });
  await reloaded.init();
  const snapshot = await reloaded.getSnapshot();
  assert.equal(snapshot.ingest.event_count, 3);
  assert.equal(snapshot.indexed.state.assets.length, 1);
  assert.equal(snapshot.indexed.state.assets[0].id, "dmo:the-one-rwa-001");

  await rm(dir, { recursive: true, force: true });
});

test("chain ingestor catchUp scans mocked Esplora blocks", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "brc-chain-esplora-"));
  const statePath = path.join(dir, "state.json");
  const txs = buildChainFixtureTxs(CREATE_EVENT, ATTEST_EVENT);
  const fetchImpl = async (url) => {
    if (url.endsWith("/blocks/tip/height")) return { ok: true, text: async () => "840011" };
    if (url.endsWith("/block-height/840000")) return { ok: true, text: async () => "hash000" };
    if (url.endsWith("/block-height/840010")) return { ok: true, text: async () => "hash010" };
    if (url.endsWith("/block-height/840011")) return { ok: true, text: async () => "hash011" };
    if (url.match(/\/block-height\/\d+$/)) return { ok: true, text: async () => "hashempty" };
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
    fetchImpl
  });

  const summary = await ingestor.catchUp({ fromHeight: 840000, toHeight: 840011 });
  assert.equal(summary.blocks, 12);
  assert.equal(summary.added_events, 3);
  assert.equal((await ingestor.getSnapshot()).indexed.state.assets[0].trust.curation, 75);

  await rm(dir, { recursive: true, force: true });
});

test("loadOffchainEventMap resolves attest hash anchors", async () => {
  const map = await loadOffchainEventMap("fixtures/chain/offchain");
  assert.equal(map.size, 1);
});

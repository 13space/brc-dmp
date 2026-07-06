import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createEsploraBitcoin } from "./bitcoin-esplora.js";
import { createHashResolver, indexChainEvents, loadOffchainEventMap } from "./chain-indexer.js";
import { scanTransactions, sortChainEvents } from "./chain-scanner.js";

const DEFAULT_STATE = {
  version: 1,
  network: null,
  esplora_base: null,
  last_height: -1,
  tip_height: null,
  bootstrap: null,
  seen_txids: [],
  events: [],
  updated_at: null
};

export function createChainIngestor(options = {}) {
  const statePath = options.statePath;
  const offchainDir = options.offchainDir;
  const network = options.network || "signet";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const backend = options.backend || createEsploraBitcoin({ baseUrl: options.baseUrl, fetchImpl });
  const baseUrl = backend.baseUrl;

  let state = structuredClone(DEFAULT_STATE);
  let offchain = new Map();

  async function init() {
    if (offchainDir) offchain = await loadOffchainEventMap(offchainDir);
    if (statePath) {
      try {
        state = { ...DEFAULT_STATE, ...JSON.parse(await readFile(statePath, "utf8")) };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return state;
  }

  async function persist() {
    if (!statePath) return;
    state.network = network;
    state.esplora_base = baseUrl;
    state.updated_at = new Date().toISOString();
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async function fetchJson(urlPath) {
    const response = await fetchImpl(`${baseUrl}${urlPath}`);
    if (!response.ok) throw new Error(`esplora ${response.status} for ${urlPath}`);
    const body = await response.text();
    try {
      return JSON.parse(body);
    } catch {
      return body.trim();
    }
  }

  async function tipHeight() {
    return Number(await fetchJson("/blocks/tip/height"));
  }

  async function blockTxs(height) {
    const hash = await fetchJson(`/block-height/${height}`);
    const txs = [];
    let start = 0;
    for (;;) {
      const pagePath = start === 0 ? `/block/${hash}/txs` : `/block/${hash}/txs/${start}`;
      const page = await fetchJson(pagePath);
      if (!Array.isArray(page) || page.length === 0) break;
      txs.push(...page);
      if (page.length < 25) break;
      start += page.length;
    }
    return txs;
  }

  async function fetchTx(txid) {
    return fetchJson(`/tx/${txid}`);
  }

  async function ingestTransactions(txs) {
    const fresh = txs.filter((tx) => tx.txid && !state.seen_txids.includes(tx.txid));
    if (fresh.length === 0) return { added_events: 0, added_txs: 0 };

    const extracted = await scanTransactions(fresh, {
      resolveEventByHash: createHashResolver(offchain)
    });
    if (extracted.length === 0) {
      for (const tx of fresh) state.seen_txids.push(tx.txid);
      return { added_events: 0, added_txs: fresh.length };
    }

    state.events = sortChainEvents(state.events.concat(extracted));
    for (const tx of fresh) state.seen_txids.push(tx.txid);
    return { added_events: extracted.length, added_txs: fresh.length };
  }

  async function scanBlock(height) {
    const txs = await blockTxs(height);
    const result = await ingestTransactions(txs);
    state.last_height = Math.max(state.last_height, height);
    state.tip_height = await tipHeight();
    await persist();
    return { height, ...result, event_count: state.events.length };
  }

  async function bootstrapFromTxid(txid) {
    await init();
    const tx = await fetchTx(txid);
    const height = tx.status?.block_height;
    if (!Number.isInteger(height) || height < 0) {
      throw new Error(`tx ${txid} is not confirmed on ${network}`);
    }
    state.bootstrap = { txid, height, at: new Date().toISOString() };
    state.last_height = height - 1;
    await persist();
    const summary = await catchUp({ fromHeight: height });
    return { bootstrap: state.bootstrap, ...summary };
  }

  async function catchUp({ fromHeight = state.last_height + 1, toHeight = null } = {}) {
    await init();
    const tip = toHeight ?? (await tipHeight());
    state.tip_height = tip;
    const summary = { from: fromHeight, to: tip, blocks: 0, added_events: 0, added_txs: 0 };

    for (let height = fromHeight; height <= tip; height += 1) {
      const block = await scanBlock(height);
      summary.blocks += 1;
      summary.added_events += block.added_events;
      summary.added_txs += block.added_txs;
    }

    await persist();
    return summary;
  }

  async function getSnapshot() {
    const indexed = await indexChainEvents(state.events);
    return {
      ingest: {
        network: state.network || network,
        esplora_base: state.esplora_base || baseUrl,
        bootstrap: state.bootstrap,
        updated_at: state.updated_at,
        last_height: state.last_height,
        tip_height: state.tip_height,
        seen_txids: state.seen_txids.length,
        event_count: state.events.length
      },
      indexed
    };
  }

  return {
    init,
    persist,
    tipHeight,
    blockTxs,
    fetchTx,
    ingestTransactions,
    scanBlock,
    bootstrapFromTxid,
    catchUp,
    getSnapshot,
    getState: () => state
  };
}

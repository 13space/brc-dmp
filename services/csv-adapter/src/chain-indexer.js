import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { hashObject } from "../../../packages/schema/src/canonicalize.js";
import { assertValidEvent } from "../../../packages/schema/src/validate.js";
import { buildState } from "../../indexer/src/state.js";
import { runWorldEngine } from "../../world-engine/src/engine.js";
import { scanTransactions, sortChainEvents } from "./chain-scanner.js";

export async function indexChainEvents(events) {
  const ordered = sortChainEvents(events.map((event) => assertValidEvent(event)));
  const state = buildState(ordered);
  const world = runWorldEngine(state);
  return {
    event_count: ordered.length,
    events: ordered,
    state,
    world: {
      at_tick: world.at_tick,
      population: world.population,
      alive: world.alive,
      critical: world.critical,
      dead: world.dead,
      engine_root: world.engine_root
    }
  };
}

export async function scanAndIndexTransactions(txs, options = {}) {
  const events = await scanTransactions(txs, options);
  return indexChainEvents(events);
}

export async function loadOffchainEventMap(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const entries = await Promise.all(
    files.map(async (file) => {
      const event = JSON.parse(await readFile(path.join(directory, file), "utf8"));
      return [hashObject(event), event];
    })
  );
  return new Map(entries);
}

export function createHashResolver(map) {
  return async (hash) => map.get(hash) || null;
}

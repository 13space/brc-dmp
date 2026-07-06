import assert from "node:assert/strict";
import test from "node:test";
import { server } from "../services/api/server.js";
import { buildEngineRootPayload, buildLifeWorld, loadLifeWorld } from "../services/api/life.js";
import { buildStateFromDirectory } from "../services/indexer/src/state.js";
import { runWorldEngine } from "../services/world-engine/src/engine.js";

let baseUrl;

test.before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(() => {
  server.close();
});

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.json();
  return { status: response.status, body };
}

test("GET /health exposes indexed asset protocol state", async () => {
  const { status, body } = await fetchJson("/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.protocol, "brc-life");
  assert.equal(body.version, "1.0");
  assert.ok(body.assets >= 4);
  assert.match(body.state_root, /^sha256:[a-f0-9]{64}$/);
});

test("GET /life returns World Engine summary and agents", async () => {
  const { status, body } = await fetchJson("/life");
  assert.equal(status, 200);
  assert.equal(body.world, "life");
  assert.deepEqual(body.available_worlds, ["life", "population"]);
  assert.equal(body.summary.population, 3);
  assert.equal(body.summary.alive, 2);
  assert.equal(body.summary.dead, 1);
  assert.equal(body.agents.length, 3);
  assert.match(body.engine_root, /^sha256:[a-f0-9]{64}$/);
  assert.ok(body.agents.every((agent) => Array.isArray(agent.arc)));
});

test("GET /life/:id returns a single autopoietic agent", async () => {
  const { status, body } = await fetchJson("/life/dmo:genesis-cell-0002");
  assert.equal(status, 200);
  assert.equal(body.id, "dmo:genesis-cell-0002");
  assert.equal(body.status, "closed");
  assert.ok(body.genome.has_triad);
  assert.ok(body.children.includes("dmo:genesis-cell-0003"));
});

test("GET /life/engine-root returns deterministic closure roots", async () => {
  const first = await fetchJson("/life/engine-root");
  const second = await fetchJson("/life/engine-root");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.engine_root, second.body.engine_root);
  assert.equal(first.body.summary.population, 3);
  assert.match(first.body.engine_root, /^sha256:[a-f0-9]{64}$/);
});

test("GET /life?world=population exposes Zipf population world", async () => {
  const { status, body } = await fetchJson("/life?world=population");
  assert.equal(status, 200);
  assert.equal(body.world, "population");
  assert.equal(body.summary.population, 20);
  assert.equal(body.summary.alive, 20);
  assert.ok(body.zipf?.evaluated);
});

test("GET /life?world=unknown is rejected", async () => {
  const { status, body } = await fetchJson("/life?world=unknown");
  assert.equal(status, 404);
  assert.equal(body.error, "unknown_world");
});

test("buildLifeWorld matches direct World Engine output", async () => {
  const state = await buildStateFromDirectory("fixtures/life");
  const apiWorld = await loadLifeWorld("life");
  const engineWorld = runWorldEngine(state);

  assert.equal(apiWorld.engine_root, engineWorld.engine_root);
  assert.equal(apiWorld.summary.alive, engineWorld.alive);
  assert.deepEqual(
    buildEngineRootPayload(apiWorld),
    {
      world: "life",
      available_worlds: ["life", "population"],
      engine_root: apiWorld.engine_root,
      state_root: apiWorld.state_root,
      summary: apiWorld.summary,
      zipf: null
    }
  );
});

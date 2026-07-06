import assert from "node:assert/strict";
import test from "node:test";
import { buildStateFromDirectory } from "../services/indexer/src/state.js";
import { computeAgentClosure, computeLifeArc, runWorldEngine } from "../services/world-engine/src/engine.js";

const LIFE_DIR = "fixtures/life";

function agent(state, id) {
  const found = state.assets.find((item) => item.id === id);
  assert.ok(found, `missing agent ${id}`);
  return found;
}

test("world engine is deterministic (stable engine_root and state_root)", async () => {
  const first = await buildStateFromDirectory(LIFE_DIR);
  const second = await buildStateFromDirectory(LIFE_DIR);

  assert.equal(first.state_root, second.state_root);
  assert.equal(runWorldEngine(first).engine_root, runWorldEngine(second).engine_root);
});

test("starving MVO: born -> metabolize -> starve -> dead, judged by constraint closure", async () => {
  const state = await buildStateFromDirectory(LIFE_DIR);
  const cell = agent(state, "dmo:genesis-cell-0001");

  // Structural closure: the (M,R) triad and a bound membrane are present.
  assert.ok(cell.genome.M && cell.genome.R && cell.genome.phi);
  assert.ok(cell.membrane.binding);

  // Liveness is computed from CoC³, not declared. The arc is closed -> critical -> broken.
  assert.equal(computeAgentClosure(cell, 905001).status, "closed");
  assert.equal(computeAgentClosure(cell, 905005).status, "critical_closed");
  assert.equal(computeAgentClosure(cell, 905009).status, "broken");

  const statuses = computeLifeArc(cell, 905000, 905010).map((point) => point.status);
  const firstClosed = statuses.indexOf("closed");
  const firstCritical = statuses.indexOf("critical_closed");
  const firstBroken = statuses.indexOf("broken");
  assert.ok(firstClosed === 0, "should begin closed");
  assert.ok(firstCritical > firstClosed, "should become critical after closed");
  assert.ok(firstBroken > firstCritical, "should break after critical");
});

test("metabolism ledger conserves energy (genesis + intake - spend)", async () => {
  const state = await buildStateFromDirectory(LIFE_DIR);
  const cell = agent(state, "dmo:genesis-cell-0001");
  const m = cell.metabolism;

  assert.equal(m.energy_genesis, 100);
  assert.equal(m.intake_total, 60); // three forage intakes of 20
  assert.equal(m.spend_total, 0);
  assert.equal(m.ledger.at(-1).explicit_balance_after, 160);

  // Starvation is real: World Engine energy at death tick is far below birth.
  const arc = computeLifeArc(cell, 905000, 905010);
  assert.ok(arc.at(-1).energy < arc[0].energy);
  assert.equal(arc[0].energy, 100);
});

test("self-replication: parent spawns child with incremented lineage and a metabolic cost", async () => {
  const state = await buildStateFromDirectory(LIFE_DIR);
  const parent = agent(state, "dmo:genesis-cell-0002");
  const child = agent(state, "dmo:genesis-cell-0003");

  assert.equal(child.kind, "autopoietic_agent");
  assert.equal(child.lineage.generation, 1);
  assert.equal(child.lineage.parent, "dmo:genesis-cell-0002");
  assert.ok(parent.children.includes("dmo:genesis-cell-0003"));

  // Reproduction is expensive: parent spent the 100 endowment plus a 20-energy act.
  assert.equal(parent.metabolism.spend_total, 120);

  // Child inherited the genome and carries logged, auditable mutations (spawn + mutate).
  assert.ok(child.genome.M);
  assert.equal(child.genome_mutations.length, 2);
});

test("world summary: population 3, two alive, one dead", async () => {
  const state = await buildStateFromDirectory(LIFE_DIR);
  const world = runWorldEngine(state);

  assert.equal(world.population, 3);
  assert.equal(world.dead, 1);
  assert.equal(world.alive, 2);

  const verdict = (id) => world.agents.find((report) => report.id === id).status;
  assert.equal(verdict("dmo:genesis-cell-0001"), "broken");
  assert.equal(verdict("dmo:genesis-cell-0002"), "closed");
  assert.equal(verdict("dmo:genesis-cell-0003"), "closed");
});

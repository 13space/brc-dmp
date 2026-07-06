import assert from "node:assert/strict";
import test from "node:test";
import { EVOLVE_DEFAULTS, evolveSweep, runEvolution } from "../services/world-engine/src/evolve.js";

test("evolution is deterministic for a fixed seed", () => {
  const a = runEvolution({ seed: 42, ticks: 300 });
  const b = runEvolution({ seed: 42, ticks: 300 });
  assert.equal(a.settled.tau, b.settled.tau);
  assert.equal(a.settled.mean_dark, b.settled.mean_dark);
  assert.equal(a.lineage.total_born, b.lineage.total_born);
});

test("a different seed gives a different (but valid) run", () => {
  const a = runEvolution({ seed: 1, ticks: 300 });
  const b = runEvolution({ seed: 2, ticks: 300 });
  assert.notEqual(a.lineage.total_born, b.lineage.total_born);
});

test("population survives, stays bounded, and the lineage is multi-generational", () => {
  const run = runEvolution({ seed: 42, ticks: 400 });
  assert.ok(run.lineage.final_alive > 0, "population should not go extinct");
  assert.ok(run.lineage.final_alive <= EVOLVE_DEFAULTS.maxPop, "population should respect the cap");
  assert.ok(run.lineage.total_born > EVOLVE_DEFAULTS.initialPop, "reproduction should occur");
  assert.ok(run.lineage.max_generation >= 3, "lineage should span several generations");
  assert.ok(run.lineage.deepest_path.length >= 3, "a deep ancestral path should exist");
});

test("selection maintains an INTERIOR dark-causality ratio P^D* (not 0, not 1)", () => {
  const run = runEvolution({ seed: 42, ticks: 600 });
  assert.ok(run.settled.mean_dark > 0.1 && run.settled.mean_dark < 0.9, `interior P^D*, got ${run.settled.mean_dark}`);
});

test("dark causality drives a phase transition: more dark ⇒ concentration & collapse", () => {
  const sweep = evolveSweep({ seed: 42, ticks: 400 }, [0, 0.5, 0.9]);
  const byDark = Object.fromEntries(sweep.map((r) => [r.dark, r]));

  // The diverse, viable regime exists at low P^D.
  assert.ok(byDark[0].alive >= 40, "low P^D should support a large diverse population");

  // High P^D concentrates the distribution (higher τ) and collapses the population.
  assert.ok(byDark[0.9].tau > byDark[0].tau, "τ should rise with dark-causality (concentration)");
  assert.ok(byDark[0.9].alive < byDark[0].alive, "high dark-causality should collapse the population");
  assert.ok(byDark[0.9].diversity < byDark[0].diversity, "high dark-causality should reduce diversity");
});

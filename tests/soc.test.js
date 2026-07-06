import assert from "node:assert/strict";
import test from "node:test";
import { runSandpile, socRobustness } from "../services/world-engine/src/soc.js";

test("sandpile is deterministic for a fixed seed", () => {
  const a = runSandpile({ seed: 7, drives: 20000 });
  const b = runSandpile({ seed: 7, drives: 20000 });
  assert.equal(a.tau, b.tau);
  assert.equal(a.critical_density, b.critical_density);
});

test("POISE: the system self-organizes to a STABLE critical fixed point (not bistable)", () => {
  const run = runSandpile({ seed: 7, drives: 40000 });
  // A tiny fixed-point std is the poise signature — contrast the eco-evolution
  // models, whose τ flickered bimodally across the edge.
  assert.ok(run.load_fixed_point_std < 0.05, `mean load should converge (got std ${run.load_fixed_point_std})`);
});

test("τ ≈ 2: the self-organized avalanche exponent sits at the trinity's value", () => {
  const run = runSandpile({ seed: 7, drives: 60000 });
  assert.ok(run.tau > 1.6 && run.tau < 2.4, `expected τ near 2, got ${run.tau}`);
  assert.ok(run.tau_r_squared > 0.8, `expected a clean power law, got R² ${run.tau_r_squared}`);
  assert.ok(run.max_avalanche > 50 * run.mean_avalanche || run.max_avalanche > 500, "avalanches should span many scales");
});

test("SELF-ORGANIZED: the same critical state is reached from any initial condition", () => {
  const rows = socRobustness({ seed: 7, drives: 40000 }, [0, 1, 4]);
  const densities = rows.map((r) => r.critical_density);
  const taus = rows.map((r) => r.tau);
  const spread = Math.max(...densities) - Math.min(...densities);
  assert.ok(spread < 0.05, `critical density should be init-independent (spread ${spread})`);
  assert.ok(taus.every((t) => t > 1.6 && t < 2.4), "τ should be init-independent and near 2");
});

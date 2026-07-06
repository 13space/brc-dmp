import assert from "node:assert/strict";
import test from "node:test";
import { ADAPT_DEFAULTS, adaptiveDriftStudy, runAdaptiveEvolution } from "../services/world-engine/src/adapt.js";

test("adaptive evolution is deterministic for a fixed seed", () => {
  const a = runAdaptiveEvolution({ seed: 7, ticks: 500, envDrift: 0.1 });
  const b = runAdaptiveEvolution({ seed: 7, ticks: 500, envDrift: 0.1 });
  assert.equal(a.settled.mean_dark, b.settled.mean_dark);
  assert.equal(a.settled.tau, b.settled.tau);
  assert.equal(a.lineage.total_born, b.lineage.total_born);
});

test("a static environment stays well-adapted and populated", () => {
  const run = runAdaptiveEvolution({ seed: 7, ticks: 800, envDrift: 0 });
  assert.ok(run.lineage.final_alive > 0, "population should persist");
  assert.ok(run.settled.maladaptation < ADAPT_DEFAULTS.nicheWidth, "static env should be well-tracked");
});

test("SOC: a CHANGING environment selects dark-causality UP (interior peak), the trinity's adaptability premium", () => {
  // static, moderate change, too-fast change
  const study = adaptiveDriftStudy({ ticks: 900 }, [0, 0.08, 0.4]);
  const byDrift = Object.fromEntries(study.map((r) => [r.env_drift, r]));

  // Moderate environmental change selects evolvability (dark causality) UP vs static.
  assert.ok(byDrift[0.08].evolved_dark > byDrift[0].evolved_dark, "moderate change should raise P^D* above static");

  // The optimum is INTERIOR: too-fast change does worse than moderate.
  assert.ok(byDrift[0.08].evolved_dark > byDrift[0.4].evolved_dark, "P^D* should peak at an intermediate change rate");

  // At the moderate (peak) rate the population still tracks the moving optimum.
  assert.ok(byDrift[0.08].maladaptation < ADAPT_DEFAULTS.nicheWidth, "the population should track θ at the optimal change rate");

  // Too-fast change degrades tracking (edge of chaos: it can no longer keep up).
  assert.ok(byDrift[0.4].maladaptation > byDrift[0].maladaptation, "too-fast change should degrade adaptation");
});

test("honest negative: the Zipf exponent τ stays decoupled from dark-causality here", () => {
  const study = adaptiveDriftStudy({ ticks: 900 }, [0, 0.08, 0.4]);
  // τ does not swing toward 2 with environmental change — it stays sub-critical.
  for (const row of study) {
    assert.ok(row.tau < 1.5, `τ stays sub-critical (got ${row.tau} at drift ${row.env_drift})`);
  }
});

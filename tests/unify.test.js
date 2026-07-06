import assert from "node:assert/strict";
import test from "node:test";
import { runUnified, unifiedDriftStudy } from "../services/world-engine/src/unify.js";

test("unified model is deterministic for a fixed seed", () => {
  const a = runUnified({ seed: 7, ticks: 500, envDrift: 0.12 });
  const b = runUnified({ seed: 7, ticks: 500, envDrift: 0.12 });
  assert.equal(a.settled.tau, b.settled.tau);
  assert.equal(a.settled.mean_dark, b.settled.mean_dark);
  assert.equal(a.lineage.total_born, b.lineage.total_born);
});

test("dark causality now COUPLES to τ (τ moves into the critical band, no longer flat ~0.8)", () => {
  const study = unifiedDriftStudy({ ticks: 900 });
  // In adapt.js τ stayed ~0.8 everywhere; here the heavy-tailed dark upside lifts
  // the median τ into the critical band for at least some change rates.
  assert.ok(
    study.some((r) => r.tau_median > 1.3),
    `expected τ to couple and rise into the critical band, got medians ${study.map((r) => r.tau_median).join(", ")}`
  );
});

test("selection still maintains an interior dark-causality ratio P^D*", () => {
  const study = unifiedDriftStudy({ ticks: 900 });
  assert.ok(study.every((r) => r.evolved_dark > 0.1 && r.evolved_dark < 0.6), "P^D* should stay interior");
});

test("HONEST: τ≈2 is NOT a poised attractor — the system flickers across the edge (bistable)", () => {
  const study = unifiedDriftStudy({ ticks: 900 });
  // The system spends almost no time poised near τ=2 ...
  assert.ok(study.every((r) => r.frac_near_two < 0.2), "the system should rarely sit near τ=2");
  // ... it lives in the diverse (τ<1) and concentrated (τ≥3) phases instead.
  const coupled = study.filter((r) => r.tau_median > 1.3);
  assert.ok(coupled.length > 0);
  assert.ok(
    coupled.every((r) => r.frac_sub_critical + r.frac_super_critical > 0.6),
    "coupled rows should be dominated by the sub- and super-critical phases (bistable flickering)"
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildStateFromDirectory } from "../services/indexer/src/state.js";
import { runWorldEngine } from "../services/world-engine/src/engine.js";
import { analyzePopulation, fitZipf, zipfClosure } from "../services/world-engine/src/zipf.js";

test("fitZipf recovers the exponent of a synthetic r^-2 power law", () => {
  const sizes = Array.from({ length: 20 }, (_, i) => Math.round(10000 / (i + 1) ** 2));
  const fit = fitZipf(sizes);
  assert.ok(Math.abs(fit.tau - 2) < 0.05, `expected tau ~2, got ${fit.tau}`);
  assert.ok(fit.r_squared > 0.99);
  assert.equal(fit.n, 20);
});

test("fitZipf recovers tau ≈ 1 for a 1/r law", () => {
  const sizes = Array.from({ length: 20 }, (_, i) => Math.round(10000 / (i + 1)));
  const fit = fitZipf(sizes);
  assert.ok(Math.abs(fit.tau - 1) < 0.05, `expected tau ~1, got ${fit.tau}`);
});

test("zipfClosure is C5⁺-dominant at τ=2 and C5⁻-dominant far from 2", () => {
  const atTwo = zipfClosure(2);
  assert.ok(atTwo.pos > atTwo.neg && atTwo.pos > atTwo.dark, "τ=2 should be C5⁺-dominant");
  const farOff = zipfClosure(4);
  assert.ok(farOff.neg > farOff.pos, "τ=4 should be C5⁻-dominant");
});

test("analyzePopulation gates on minimum population", () => {
  assert.equal(analyzePopulation([5, 4, 3]).evaluated, false);
  const big = analyzePopulation(Array.from({ length: 12 }, (_, i) => Math.round(10000 / (i + 1) ** 2)));
  assert.equal(big.evaluated, true);
});

test("population world sits at Zipf criticality (τ ≈ 2, C5⁺, optimal)", async () => {
  const state = await buildStateFromDirectory("fixtures/population");
  const world = runWorldEngine(state);

  assert.equal(world.population, 20);
  assert.equal(world.alive, 20);
  assert.ok(world.zipf.evaluated);
  assert.ok(Math.abs(world.zipf.tau - 2) < 0.1, `expected tau ~2, got ${world.zipf.tau}`);
  assert.ok(world.zipf.r_squared > 0.99);
  assert.equal(world.zipf.status, "optimal_criticality");
  assert.ok(world.zipf.c5.pos > world.zipf.c5.neg, "C5⁺ should dominate C5⁻ at criticality");
});

test("small life world does not evaluate Zipf (population below threshold)", async () => {
  const state = await buildStateFromDirectory("fixtures/life");
  const world = runWorldEngine(state);
  assert.equal(world.zipf.evaluated, false);
});

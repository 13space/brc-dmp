import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  ASSET_KINDS,
  CAUSAL_TAGS,
  CLOSURE_STATUS,
  CONSTRAINT_RELATIONS,
  ENERGY_FLOWS,
  MUTATION_OPERATORS,
  OPERATIONS,
  PROTOCOL,
  SUPPORTED_PROTOCOLS,
  SUPPORTED_VERSIONS,
  VERSION
} from "../packages/schema/src/constants.js";
import { validateEvent } from "../packages/schema/src/validate.js";

const PROTOCOL_DOC = "docs/protocol-v1.0-draft.md";
const LIFE_OPS = [
  "bind_membrane",
  "metabolize",
  "sense",
  "act",
  "form_constraint",
  "spawn",
  "mutate",
  "apoptose"
];
const LIFE_KINDS = ["autopoietic_agent", "constraint_edge", "niche", "species_genome"];

test("protocol constants match the documented v1.0 surface", () => {
  assert.equal(PROTOCOL, "brc-life");
  assert.equal(VERSION, "1.0");
  assert.deepEqual(SUPPORTED_PROTOCOLS, ["brc-dmp", "brc-life"]);
  assert.deepEqual(SUPPORTED_VERSIONS, ["0.1", "1.0"]);

  for (const kind of LIFE_KINDS) assert.ok(ASSET_KINDS.includes(kind), `missing asset kind ${kind}`);
  for (const op of LIFE_OPS) assert.ok(OPERATIONS.includes(op), `missing operation ${op}`);

  assert.deepEqual(CAUSAL_TAGS, ["pos", "neg", "dark"]);
  assert.deepEqual(CLOSURE_STATUS, ["closed", "critical_closed", "broken"]);
  assert.deepEqual(MUTATION_OPERATORS, ["param_perturb", "module_add", "module_remove", "recombine"]);
  assert.deepEqual(CONSTRAINT_RELATIONS, ["constrains_flow", "constrains_constraint", "produced_by"]);
  assert.deepEqual(ENERGY_FLOWS, ["intake", "spend", "basal", "transfer_in", "transfer_out", "reclaim"]);
});

test("protocol-v1.0 draft documents the implemented life surface", async () => {
  const doc = await readFile(PROTOCOL_DOC, "utf8");

  for (const kind of LIFE_KINDS) assert.match(doc, new RegExp(`\`${kind}\``), `doc missing kind ${kind}`);
  for (const op of LIFE_OPS) assert.match(doc, new RegExp(`\`${op}\``), `doc missing op ${op}`);
  for (const status of CLOSURE_STATUS) assert.match(doc, new RegExp(status), `doc missing status ${status}`);

  assert.match(doc, /92 tests/);
  assert.match(doc, /\/life/);
  assert.match(doc, /engine-root/);
  assert.match(doc, /fixtures\/population/);
});

test("fixture inventory matches the documented validation set", async () => {
  const counts = {
    valid: (await readdir("fixtures/valid")).filter((name) => name.endsWith(".json")).length,
    life: (await readdir("fixtures/life")).filter((name) => name.endsWith(".json")).length,
    population: (await readdir("fixtures/population")).filter((name) => name.endsWith(".json")).length,
    invalid: (await readdir("fixtures/invalid")).filter((name) => name.endsWith(".json")).length
  };

  assert.equal(counts.valid, 12);
  assert.equal(counts.life, 16);
  assert.equal(counts.population, 20);
  assert.equal(counts.invalid, 6);
});

test("life fixtures use brc-life v1.0 and invalid samples reject life-rule violations", async () => {
  const lifeDir = "fixtures/life";
  const files = (await readdir(lifeDir)).filter((name) => name.endsWith(".json")).sort();

  for (const file of files) {
    const event = JSON.parse(await readFile(path.join(lifeDir, file), "utf8"));
    assert.equal(event.p, "brc-life");
    assert.equal(event.v, "1.0");
    assert.equal(validateEvent(event).valid, true, file);
  }

  const invalidCases = [
    ["fixtures/invalid/bad-autopoietic-no-genome.json", "genome"],
    ["fixtures/invalid/bad-metabolize-negative.json", "amount"],
    ["fixtures/invalid/bad-act-no-cost.json", "energy_cost"]
  ];

  for (const [file, needle] of invalidCases) {
    const event = JSON.parse(await readFile(file, "utf8"));
    const result = validateEvent(event);
    assert.equal(result.valid, false, file);
    assert.ok(result.issues.some((issue) => issue.includes(needle)), `${file}: ${result.issues.join("; ")}`);
  }
});

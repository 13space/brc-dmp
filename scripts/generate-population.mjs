// Deterministically generate a population of autopoietic agents whose genesis
// energies follow a Zipf rank-size curve size(r) = round(K / r^2), i.e. a power
// law with exponent τ ≈ 2 — the critical, maximally diverse state of
// ConstraintNet's deepened trinity. The World Engine should then *recover* τ ≈ 2
// from this population (a falsifiable check of the C5 closure condition).
//
//   node scripts/generate-population.mjs
//
// Writes fixtures/population/pop-001.json ... pop-0NN.json
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../fixtures/population");

const N = 20; // population size
const K = 32000; // scale so the smallest organism (r=N) starts at 80 energy
const TAU = 2; // target exponent
const TICK = 905000;

function hex64(seed) {
  return createHash("sha256").update(seed).digest("hex");
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

function agentEvent(rank) {
  const id = `pop-cell-${pad(rank, 3)}`;
  const energy = Math.round(K / rank ** TAU);
  const txid = hex64(`pop-txid-${rank}`);
  const sat = String(20000 + rank);
  return {
    p: "brc-life",
    v: "1.0",
    op: "create",
    event_id: `evt:pop-create-${id}`,
    dmo_id: `dmo:${id}`,
    buc: `btc:${TICK}:${txid}:0:${sat}`,
    tick: TICK,
    source: { chain: "bitcoin", block: TICK, txid, vout: 0, sat },
    actor: { type: "did", id: "did:plutus:13space", label: "13space" },
    timestamp: "2026-06-03T00:00:00.000Z",
    kind: "autopoietic_agent",
    subject: {
      title: `Pop Cell ${pad(rank, 3)}`,
      creator: "13space",
      category: "autopoietic_agent",
      description: `Population organism rank ${rank}; genesis energy follows a Zipf r^-${TAU} curve.`
    },
    owner: {
      type: "agent_wallet",
      id: `agent-wallet:${id}`,
      address: `bc1ppop${pad(rank, 3)}00000000000000000000000000000000000`
    },
    metadata: {
      uri: `ipfs://brc-life-fixtures/population/${id}.json`,
      hash: `sha256:${hex64(`pop-meta-${rank}`)}`,
      mime: "application/json"
    },
    genome: {
      M: "ref://genome/M/forage-and-convert-energy",
      R: "ref://genome/R/repair-and-replicate-components",
      phi: "ref://genome/phi/organization-map-that-reproduces-R",
      inscription: `btc:${TICK}:sat:${sat}`,
      hash: `sha256:${hex64(`pop-genome-${rank}`)}`,
      lineage: { parent: null, generation: 0 }
    },
    membrane: {
      binding: `rgbpp:cell:${id}:outpoint-0`,
      boundary_hash: `sha256:${hex64(`pop-membrane-${rank}`)}`,
      permeability: { energy_in: true, signal_in: true, matter_out: "controlled" }
    },
    metabolism: { energy, basal_cost_per_tick: 1 }
  };
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const energies = [];
for (let rank = 1; rank <= N; rank += 1) {
  const event = agentEvent(rank);
  energies.push(event.metabolism.energy);
  const file = path.join(outDir, `pop-${pad(rank, 3)}.json`);
  await writeFile(file, JSON.stringify(event, null, 2) + "\n");
}

console.log(`Wrote ${N} population agents to ${path.relative(process.cwd(), outDir)}`);
console.log(`Genesis energies (rank-size): ${energies.join(", ")}`);

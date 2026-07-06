import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStateFromDirectory } from "../indexer/src/state.js";
import { computeLifeArc, runWorldEngine } from "../world-engine/src/engine.js";

const defaultProjectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const LIFE_WORLDS = Object.freeze({
  life: "fixtures/life",
  population: "fixtures/population"
});

// Run the World Engine over a fixture world and shape one payload the UI can
// render without further requests: per-agent liveness verdict, full life arc,
// genome/membrane/lineage, and the metabolism ledger.
export function buildLifeWorld(state) {
  const world = runWorldEngine(state);
  const reportById = new Map(world.agents.map((report) => [report.id, report]));
  const agents = state.assets
    .filter((asset) => asset.kind === "autopoietic_agent" && asset.metabolism)
    .map((dmo) => {
      const report = reportById.get(dmo.id);
      const genome = dmo.genome || {};
      return {
        id: dmo.id,
        title: dmo.subject.title,
        generation: dmo.lineage?.generation ?? 0,
        parent: dmo.lineage?.parent ?? null,
        children: dmo.children ?? [],
        status: report.status,
        energy: report.energy,
        delta_energy: report.delta_energy,
        coc3: report.coc3,
        c1_energy_work: report.c1_energy_work,
        c2_timescale: report.c2_timescale,
        c3_ergodicity: report.c3_ergodicity,
        c4_topological: report.c4_topological,
        evaluated_conditions: report.evaluated_conditions,
        pending_conditions: report.pending_conditions,
        recorded_death: report.recorded_death,
        genome: {
          M: genome.M ?? null,
          R: genome.R ?? null,
          phi: genome.phi ?? null,
          has_triad: Boolean(genome.M && genome.R && genome.phi)
        },
        membrane_bound: Boolean(dmo.membrane?.binding),
        metabolism: {
          energy_genesis: dmo.metabolism.energy_genesis,
          basal_cost_per_tick: dmo.metabolism.basal_cost_per_tick,
          intake_total: dmo.metabolism.intake_total,
          spend_total: dmo.metabolism.spend_total
        },
        ledger: dmo.metabolism.ledger,
        actions: dmo.actions ?? [],
        constraints: dmo.constraints ?? [],
        mutations: dmo.genome_mutations ?? [],
        owner: dmo.owner,
        buc: dmo.buc,
        arc: computeLifeArc(dmo, dmo.metabolism.genesis_tick ?? 0, world.at_tick)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    summary: {
      at_tick: world.at_tick,
      population: world.population,
      alive: world.alive,
      critical: world.critical,
      dead: world.dead
    },
    zipf: world.zipf,
    params: world.params,
    engine_root: world.engine_root,
    state_root: state.state_root,
    agents
  };
}

export async function loadLifeWorld(worldName = "life", projectRoot = defaultProjectRoot) {
  const relativeDir = LIFE_WORLDS[worldName];
  if (!relativeDir) {
    return { error: "unknown_world", world: worldName, available: Object.keys(LIFE_WORLDS) };
  }

  const worldDir = path.resolve(projectRoot, relativeDir);
  const state = await buildStateFromDirectory(worldDir);
  const world = buildLifeWorld(state);
  return {
    ...world,
    world: worldName,
    available_worlds: Object.keys(LIFE_WORLDS)
  };
}

export function buildEngineRootPayload(world) {
  return {
    world: world.world,
    available_worlds: world.available_worlds,
    engine_root: world.engine_root,
    state_root: world.state_root,
    summary: world.summary,
    zipf: world.zipf?.evaluated ? { tau: world.zipf.tau, status: world.zipf.status } : null
  };
}

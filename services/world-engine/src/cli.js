// World Engine CLI — prints the liveness verdict and the life arc of every
// autopoietic agent in a fixture world.
//
//   node services/world-engine/src/cli.js [fixture-dir]
//
// Default fixture dir: fixtures/life
import { buildStateFromDirectory } from "../../indexer/src/index.js";
import { computeLifeArc, runWorldEngine } from "./engine.js";

const dir = process.argv[2] || "fixtures/life";

const STATUS_GLYPH = {
  closed: "●", // alive and closed
  critical_closed: "◐", // critical (edge of chaos)
  broken: "○" // dead
};

const state = await buildStateFromDirectory(dir);
const world = runWorldEngine(state);

console.log(`\nBRC-LIFE World Engine — ${dir}`);
console.log("=".repeat(64));
console.log(
  `tick ${world.at_tick} | population ${world.population} | ` +
    `alive ${world.alive} | critical ${world.critical} | dead ${world.dead}`
);
console.log(`engine_root ${world.engine_root}`);
console.log(`state_root  ${state.state_root}`);

const agents = state.assets.filter((a) => a.kind === "autopoietic_agent" && a.metabolism);

for (const agent of agents) {
  const m = agent.metabolism;
  const from = m.genesis_tick ?? 0;
  const to = world.at_tick;
  const arc = computeLifeArc(agent, from, to);
  const report = world.agents.find((r) => r.id === agent.id);

  console.log("\n" + "-".repeat(64));
  console.log(`${agent.id}  (gen ${agent.lineage?.generation ?? 0})  ${agent.subject.title}`);
  console.log(
    `genome M/R/φ: ${agent.genome?.M ? "✓" : "✗"}  ` +
      `membrane: ${agent.membrane?.binding ? "✓" : "✗"}  ` +
      `basal/tick: ${m.basal_cost_per_tick}  status: ${report?.status} ${STATUS_GLYPH[report?.status]}`
  );
  console.log(`CoC³ pos/neg/dark: ${report?.coc3.pos} / ${report?.coc3.neg} / ${report?.coc3.dark}`);

  const maxEnergy = Math.max(1, ...arc.map((a) => a.energy));
  for (const point of arc) {
    const barLen = Math.max(0, Math.round((point.energy / maxEnergy) * 32));
    const bar = "█".repeat(barLen);
    const e = String(point.energy).padStart(6);
    console.log(`  t${String(point.tick).padStart(7)}  E=${e}  ${STATUS_GLYPH[point.status]} ${point.status.padEnd(16)} ${bar}`);
  }
}

console.log("");

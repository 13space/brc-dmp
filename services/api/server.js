import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStateFromDirectory, loadEventsFromDirectory } from "../indexer/src/state.js";
import { batchEvents, buildContract, createMockBitcoin, planGenesis, validateContract } from "../csv-adapter/src/index.js";
import { computeLifeArc, runWorldEngine } from "../world-engine/src/engine.js";
import { evolveSweep, runEvolution } from "../world-engine/src/evolve.js";
import { adaptiveDriftStudy, runAdaptiveEvolution } from "../world-engine/src/adapt.js";
import { runUnified, unifiedDriftStudy } from "../world-engine/src/unify.js";
import { runSandpile, socRobustness } from "../world-engine/src/soc.js";
import { addBlock, createChain, mineBlock, populationFitness, tip, validateChain } from "../organic-chain/src/index.js";
import { broadcast, converged, createNetwork, gossipToConsensus, heal, mineAndBroadcast, partition, tipsSummary } from "../organic-chain/src/network.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.BRC_DMP_PORT || 8787);
const host = process.env.BRC_DMP_HOST || "127.0.0.1";
const fixtureDir = path.resolve(projectRoot, process.env.BRC_DMP_FIXTURE_DIR || "fixtures/valid");
const lifeFixtureDir = path.resolve(projectRoot, process.env.BRC_LIFE_FIXTURE_DIR || "fixtures/life");
const populationFixtureDir = path.resolve(projectRoot, process.env.BRC_POP_FIXTURE_DIR || "fixtures/population");
const LIFE_WORLDS = { life: lifeFixtureDir, population: populationFixtureDir };

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      return send(response, 204, null);
    }

    if (request.method !== "GET") {
      return send(response, 405, { error: "method_not_allowed" });
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/" || url.pathname === "/app.js" || url.pathname === "/styles.css") {
      return serveWebFile(response, url.pathname);
    }
    if (url.pathname.startsWith("/media/")) {
      return serveMediaFile(response, url.pathname);
    }

    // BRC-LIFE World Engine routes (independent, selectable fixture worlds).
    if (url.pathname === "/life" || url.pathname.startsWith("/life/")) {
      const worldName = url.searchParams.get("world") || "life";
      const worldDir = LIFE_WORLDS[worldName];
      if (!worldDir) {
        return send(response, 404, { error: "unknown_world", world: worldName, available: Object.keys(LIFE_WORLDS) });
      }
      const lifeState = await buildStateFromDirectory(worldDir);
      const world = buildLifeWorld(lifeState);
      world.world = worldName;
      world.available_worlds = Object.keys(LIFE_WORLDS);
      const lifeParts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (url.pathname === "/life") return send(response, 200, world);
      const lifeAgent = world.agents.find((agent) => agent.id === lifeParts[1]);
      if (!lifeAgent) return send(response, 404, { error: "agent_not_found", id: lifeParts[1] });
      return send(response, 200, lifeAgent);
    }

    // Dark-causality open-ended evolution experiment.
    if (url.pathname === "/evolve") {
      const seed = Number(url.searchParams.get("seed") || 42);
      const ticks = Math.min(1200, Math.max(50, Number(url.searchParams.get("ticks") || 600)));
      const run = runEvolution({ seed, ticks });
      const sweep = evolveSweep({ seed, ticks: Math.min(ticks, 400) });
      const maxPoints = 80;
      const step = Math.max(1, Math.ceil(run.history.length / maxPoints));
      const history = run.history.filter((_, index) => index % step === 0);
      return send(response, 200, { params: run.params, settled: run.settled, lineage: run.lineage, history, sweep });
    }

    // Changing-environment (self-organized criticality) experiment.
    if (url.pathname === "/adapt") {
      const ticks = Math.min(1500, Math.max(200, Number(url.searchParams.get("ticks") || 900)));
      const study = adaptiveDriftStudy({ ticks });
      const rep = runAdaptiveEvolution({ seed: 7, ticks, envDrift: 0.1 });
      const maxPoints = 80;
      const step = Math.max(1, Math.ceil(rep.history.length / maxPoints));
      const history = rep.history.filter((_, index) => index % step === 0);
      const peak = study.reduce((best, row) => (row.evolved_dark > best.evolved_dark ? row : best), study[0]);
      return send(response, 200, { study, peak, history, settled: rep.settled, lineage: rep.lineage });
    }

    // Unified model: does dark-causality coupling poise the system at τ≈2?
    if (url.pathname === "/unify") {
      const ticks = Math.min(1500, Math.max(200, Number(url.searchParams.get("ticks") || 1000)));
      const study = unifiedDriftStudy({ ticks });
      const rep = runUnified({ seed: 7, ticks, envDrift: 0.12 });
      const tail = rep.history.slice(Math.floor(rep.history.length * 0.4));
      const taus = tail.map((r) => r.tau).filter((v) => v != null);
      const edges = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, Infinity];
      const labels = ["<0.5", "0.5-1", "1-1.5", "1.5-2", "2-2.5", "2.5-3", "3-4", "≥4"];
      const histogram = edges.slice(0, -1).map((lo, i) => ({
        label: labels[i],
        near_two: lo >= 1.5 && lo < 2.5,
        count: taus.filter((v) => v >= lo && v < edges[i + 1]).length
      }));
      const nearTwo = study.reduce((sum, r) => sum + r.frac_near_two, 0) / study.length;
      return send(response, 200, { study, histogram, settled: rep.settled, frac_near_two_avg: Math.round(nearTwo * 1e4) / 1e4 });
    }

    // Self-organized criticality: does a slow-drive/threshold-release feedback poise the system at τ≈2?
    if (url.pathname === "/soc") {
      const drives = Math.min(120000, Math.max(5000, Number(url.searchParams.get("drives") || 50000)));
      const run = runSandpile({ drives });
      const robustness = socRobustness({ drives: Math.min(drives, 40000) });
      const maxPoints = 80;
      const step = Math.max(1, Math.ceil(run.load_series.length / maxPoints));
      const loadSeries = run.load_series.filter((_, index) => index % step === 0);
      return send(response, 200, {
        tau: run.tau,
        tau_r_squared: run.tau_r_squared,
        critical_density: run.critical_density,
        load_fixed_point_std: run.load_fixed_point_std,
        mean_avalanche: run.mean_avalanche,
        max_avalanche: run.max_avalanche,
        histogram: run.histogram,
        load_series: loadSeries,
        robustness
      });
    }

    // Organic chain (Mode B): Proof-of-Useful-Work + world engine in consensus.
    if (url.pathname === "/chain") {
      const n = Math.min(200, Math.max(5, Number(url.searchParams.get("blocks") || 60)));
      const chain = createChain();
      const miners = ["alice", "bob", "carol", "dave", "erin"];
      const series = [];
      for (let h = 1; h <= n; h += 1) {
        const block = mineBlock(chain, miners[h % miners.length]);
        addBlock(chain, block);
        series.push({
          height: block.height,
          miner: block.miner,
          difficulty: block.difficulty,
          trials: block.trials,
          fitness: block.fitness,
          pop: chain.agents.length,
          pop_fitness: populationFitness(chain.agents),
          cumulative_work: block.cumulative_work
        });
      }
      const head = tip(chain);
      const verdict = validateChain(chain.blocks);
      const tampered = chain.blocks.map((b) => ({ ...b }));
      const ti = Math.min(8, tampered.length - 1);
      tampered[ti] = { ...tampered[ti], world_root: "sha256:" + "0".repeat(64) };
      const tamperVerdict = validateChain(tampered);
      return send(response, 200, {
        head: {
          height: head.height,
          difficulty: head.difficulty,
          cumulative_work: head.cumulative_work,
          world_root: head.world_root,
          population: chain.agents.length,
          population_fitness: populationFitness(chain.agents)
        },
        blocks: series,
        population: chain.agents.slice().sort((a, b) => b.energy - a.energy).slice(0, 12),
        validation: { valid: verdict.valid, world_root_reproduced: verdict.world_root === head.world_root },
        tamper: { rejected: !tamperVerdict.valid, reason: tamperVerdict.reason, height: tamperVerdict.height }
      });
    }

    // Toy P2P network: honest convergence → partition/diverge → heal/reorg.
    if (url.pathname === "/network") {
      const net = createNetwork(["n1", "n2", "n3", "n4", "n5"]);
      for (let i = 0; i < 12; i += 1) mineAndBroadcast(net, net.nodes[i % 5].id);
      gossipToConsensus(net);
      const phase1 = { converged: converged(net), tips: tipsSummary(net) };

      partition(net, ["n1", "n2", "n3"], ["n4", "n5"]);
      for (let i = 0; i < 7; i += 1) {
        mineAndBroadcast(net, "n1");
        mineAndBroadcast(net, "n2");
      }
      for (let i = 0; i < 3; i += 1) mineAndBroadcast(net, "n4");
      const phase2 = { converged: converged(net), tips: tipsSummary(net) };

      heal(net);
      const reorgs = [];
      for (let round = 0; round < 30; round += 1) {
        let changed = false;
        for (const node of net.nodes) {
          for (const event of broadcast(net, node.id)) {
            changed = true;
            if (event.reorg_depth > 0) reorgs.push({ node: event.node, orphaned: event.orphaned });
          }
        }
        if (!changed) break;
      }
      const phase3 = { converged: converged(net), tips: tipsSummary(net), reorgs };
      return send(response, 200, { phase1, phase2, phase3 });
    }

    // Mode A: Bitcoin client-side validation — the seal chain, anchors, and verdict.
    if (url.pathname === "/mode-a") {
      const events = await loadEventsFromDirectory(lifeFixtureDir);
      const backend = createMockBitcoin();
      const contract = buildContract(backend, batchEvents(events, 4));
      const valid = await validateContract(backend, contract);

      const tampered = structuredClone(contract);
      tampered.transitions[1].events[0].timestamp = "2099-01-01T00:00:00.000Z";
      const tamperCheck = await validateContract(backend, tampered);
      const forgedCheck = await validateContract(createMockBitcoin(), contract);
      let doubleSpendRejected = false;
      try {
        backend.spend(contract.genesis_seal, "sha256:" + "1".repeat(64));
      } catch {
        doubleSpendRejected = true;
      }
      const plan = planGenesis(events);

      return send(response, 200, {
        genesis_seal: contract.genesis_seal,
        tip_seal: contract.tip_seal,
        transitions: contract.transitions.map((t) => ({
          height: t.height,
          seal_in: t.seal_in,
          seal_out: t.seal_out,
          spend_txid: t.spend_txid,
          anchored_height: t.anchored_height,
          commitment: t.commitment,
          events: t.events.length,
          population: t.population,
          alive: t.alive
        })),
        validation: {
          valid: valid.valid,
          height: valid.height,
          population: valid.world.population,
          alive: valid.world.alive,
          state_root: valid.state_root,
          engine_root: valid.engine_root,
          anchored_height: valid.anchored_height
        },
        security: {
          tamper_rejected: !tamperCheck.valid,
          tamper_reason: tamperCheck.reason,
          forged_rejected: !forgedCheck.valid,
          forged_reason: forgedCheck.reason,
          double_spend_rejected: doubleSpendRejected
        },
        signet: { genesis_commitment: plan.commitment, op_return: `6a20${plan.commitment.slice(7)}` }
      });
    }

    const state = await buildStateFromDirectory(fixtureDir);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (url.pathname === "/health") {
      return send(response, 200, {
        ok: true,
        protocol: state.protocol,
        version: state.version,
        assets: state.assets.length,
        events: state.events.length,
        state_root: state.state_root
      });
    }

    if (url.pathname === "/assets") {
      return send(response, 200, state.assets);
    }

    if (url.pathname === "/agents") {
      return send(response, 200, state.assets.filter((asset) => asset.kind === "agent_identity"));
    }

    if (url.pathname === "/interactions") {
      return send(response, 200, collectInteractions(state));
    }

    if (url.pathname === "/dao/summary") {
      return send(response, 200, buildDaoSummary(state));
    }

    if (parts[0] === "assets" && parts[1]) {
      const asset = state.assets.find((item) => item.id === parts[1]);
      if (!asset) return send(response, 404, { error: "asset_not_found", id: parts[1] });

      if (parts.length === 2) return send(response, 200, asset);
      if (parts[2] === "proofs") return send(response, 200, asset.proofs);
      if (parts[2] === "trust") return send(response, 200, asset.trust);
      if (parts[2] === "interactions") return send(response, 200, asset.interactions);
      if (parts[2] === "agent") return send(response, 200, asset.agent || {});
      if (parts[2] === "did") return send(response, 200, asset.agent?.did_document || {});
    }

    if (url.pathname === "/events") {
      return send(response, 200, state.events);
    }

    if (url.pathname === "/state-root") {
      return send(response, 200, { state_root: state.state_root });
    }

    return send(response, 404, { error: "not_found" });
  } catch (error) {
    return send(response, 500, { error: "internal_error", message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`BRC-DMP API listening on http://${host}:${port}`);
  console.log(`Fixture directory: ${fixtureDir}`);
});

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (body === null) return response.end();
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body, null, 2));
}

async function serveWebFile(response, pathname) {
  const fileName = pathname === "/" ? "index.html" : pathname.slice(1);
  const fullPath = path.join(projectRoot, "apps/web", fileName);
  const body = await readFile(fullPath);
  const contentType = fileName.endsWith(".js")
    ? "text/javascript; charset=utf-8"
    : fileName.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "text/html; charset=utf-8";

  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.end(body);
}

async function serveMediaFile(response, pathname) {
  const fileName = path.basename(pathname);
  const fullPath = path.join(projectRoot, "apps/web/media", fileName);
  const body = await readFile(fullPath);
  response.statusCode = 200;
  response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  response.end(body);
}

function collectInteractions(state) {
  return state.assets.flatMap((asset) =>
    asset.interactions.map((interaction) => ({
      ...interaction,
      dmo_id: asset.id,
      dmo_title: asset.subject.title,
      privacy_level: interaction.privacy?.level || "public"
    }))
  );
}

// Run the World Engine over the life world and shape one payload the UI can
// render without further requests: per-agent liveness verdict, full life arc,
// genome/membrane/lineage, and the metabolism ledger.
function buildLifeWorld(state) {
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

function buildDaoSummary(state) {
  const rwaAssets = state.assets.filter((asset) => asset.kind === "rwa_art");
  const agents = state.assets.filter((asset) => asset.kind === "agent_identity");
  const averageTrust = rwaAssets.length === 0
    ? 0
    : Math.round(rwaAssets.reduce((sum, asset) => sum + trustMean(asset.trust), 0) / rwaAssets.length);

  return {
    treasury: {
      rune: "TOP",
      simulated_balance: 13000000,
      locked_ratio: 0.42
    },
    voting_model: {
      method: "trust_weighted_conviction",
      quorum: 0.18,
      sybil_resistance: ["did", "asset_history", "lock_time", "trust_vector"]
    },
    metrics: {
      rwa_assets: rwaAssets.length,
      agent_identities: agents.length,
      indexed_interactions: collectInteractions(state).length,
      average_rwa_trust: averageTrust
    },
    proposals: [
      {
        id: "dao:proposal:rwa-gallery-alpha",
        title: "Admit RWA sample set into Plutus Gallery Alpha",
        status: "simulated_open",
        target_assets: rwaAssets.map((asset) => asset.id),
        conviction: 0.64,
        risk: "medium"
      },
      {
        id: "dao:proposal:agent-indexer-scope",
        title: "Authorize fixture Agent to prepare live Ordinals adapter",
        status: "simulated_open",
        target_assets: agents.map((asset) => asset.id),
        conviction: 0.58,
        risk: "medium"
      },
      {
        id: "dao:proposal:fractionalization-rwa001",
        title: "Keep RWA-001 fractionalization as indexed statement until RGB++ test",
        status: "simulated_passed",
        target_assets: ["dmo:the-one-rwa-001"],
        conviction: 0.73,
        risk: "low"
      }
    ]
  };
}

function trustMean(trust) {
  return (trust.authenticity + trust.provenance + trust.market + trust.curation + trust.community + (100 - trust.risk)) / 6;
}

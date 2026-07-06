const apiUrl = new URLSearchParams(location.search).get("api") || location.origin;

const stateRoot = document.querySelector("#stateRoot");
const summaryEl = document.querySelector("#summary");
const contentEl = document.querySelector("#content");
const refreshButton = document.querySelector("#refreshButton");
const tabs = Array.from(document.querySelectorAll(".nav-tab"));

let assets = [];
let health = null;
let interactions = [];
let dao = null;
let lifeWorld = null;
let lifeWorldName = "life";
let evolveData = null;
let adaptData = null;
let unifyData = null;
let socData = null;
let chainData = null;
let networkData = null;
let modeAData = null;
let selectedId = null;
let selectedLifeId = null;
let currentView = "assets";

refreshButton.addEventListener("click", load);
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentView = tab.dataset.view;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    render();
  });
});

await load();

async function load() {
  const [healthPayload, assetList, interactionList, daoPayload, lifePayload] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/assets"),
    fetchJson("/interactions"),
    fetchJson("/dao/summary"),
    fetchJson("/life").catch(() => null)
  ]);

  health = healthPayload;
  assets = assetList;
  interactions = interactionList;
  dao = daoPayload;
  lifeWorld = lifePayload;
  selectedId = selectedId || assets[0]?.id || null;
  selectedLifeId = selectedLifeId || lifeWorld?.agents[0]?.id || null;
  stateRoot.textContent = health.state_root;
  render();
}

async function loadLife(name) {
  lifeWorldName = name;
  if (name === "evolution") {
    if (!evolveData) evolveData = await fetchJson("/evolve").catch(() => null);
  } else if (name === "adapt") {
    if (!adaptData) adaptData = await fetchJson("/adapt").catch(() => null);
  } else if (name === "unified") {
    if (!unifyData) unifyData = await fetchJson("/unify").catch(() => null);
  } else if (name === "soc") {
    if (!socData) socData = await fetchJson("/soc").catch(() => null);
  } else if (name === "chain") {
    if (!chainData) chainData = await fetchJson("/chain").catch(() => null);
    if (!networkData) networkData = await fetchJson("/network").catch(() => null);
  } else if (name === "mode-a") {
    if (!modeAData) modeAData = await fetchJson("/mode-a").catch(() => null);
  } else {
    lifeWorld = await fetchJson(`/life?world=${encodeURIComponent(name)}`).catch(() => null);
    selectedLifeId = lifeWorld?.agents[0]?.id || null;
  }
  render();
}

function render() {
  renderSummary();
  if (currentView === "assets") renderAssetsView();
  if (currentView === "agents") renderAgentsView();
  if (currentView === "life") {
    if (lifeWorldName === "evolution") renderEvolutionView();
    else if (lifeWorldName === "adapt") renderAdaptView();
    else if (lifeWorldName === "unified") renderUnifiedView();
    else if (lifeWorldName === "soc") renderSocView();
    else if (lifeWorldName === "chain") renderChainView();
    else if (lifeWorldName === "mode-a") renderModeAView();
    else renderLifeView();
  }
  if (currentView === "proofs") renderProofsView();
  if (currentView === "dao") renderDaoView();
}

function renderSummary() {
  if (currentView === "life" && lifeWorldName === "mode-a") {
    if (modeAData) {
      const v = modeAData.validation;
      summaryEl.innerHTML = `
        ${metric("Seal chain", `${modeAData.transitions.length} txns`)}
        ${metric("Validation", v.valid ? "✓" : "✗", v.valid ? "s-closed" : "s-broken")}
        ${metric("Anchored @btc", `#${v.anchored_height}`)}
        ${metric("Alive / pop", `${v.alive}/${v.population}`, "s-closed")}
      `;
    } else {
      summaryEl.innerHTML = metric("Mode A", "loading…");
    }
    return;
  }
  if (currentView === "life" && lifeWorldName === "chain") {
    if (chainData) {
      const h = chainData.head;
      summaryEl.innerHTML = `
        ${metric("Height", h.height)}
        ${metric("Difficulty", h.difficulty)}
        ${metric("Useful work", `${h.cumulative_work} trials`)}
        ${metric("Pop fitness", h.population_fitness, "s-closed")}
      `;
    } else {
      summaryEl.innerHTML = metric("Organic chain", "mining…");
    }
    return;
  }
  if (currentView === "life" && lifeWorldName === "soc") {
    if (socData) {
      summaryEl.innerHTML = `
        ${metric("τ (self-org)", socData.tau, "s-closed")}
        ${metric("poise std", socData.load_fixed_point_std, "s-closed")}
        ${metric("max avalanche", socData.max_avalanche)}
        ${metric("verdict", "poised ✓")}
      `;
    } else {
      summaryEl.innerHTML = metric("SOC", "loading…");
    }
    return;
  }
  if (currentView === "life" && lifeWorldName === "unified") {
    if (unifyData) {
      const s = unifyData.settled;
      summaryEl.innerHTML = `
        ${metric("P^D*", s.mean_dark, "s-critical")}
        ${metric("τ median", s.tau_median)}
        ${metric("% near τ=2", `${Math.round((unifyData.frac_near_two_avg || 0) * 100)}%`, "s-broken")}
        ${metric("verdict", "bistable")}
      `;
    } else {
      summaryEl.innerHTML = metric("Unified", "loading…");
    }
    return;
  }
  if (currentView === "life" && lifeWorldName === "adapt") {
    if (adaptData) {
      const p = adaptData.peak;
      const staticRow = adaptData.study.find((r) => r.env_drift === 0) || adaptData.study[0];
      summaryEl.innerHTML = `
        ${metric("P^D* static", staticRow.evolved_dark)}
        ${metric("P^D* peak", p.evolved_dark, "s-critical")}
        ${metric("at envDrift", p.env_drift)}
        ${metric("τ (flat)", p.tau)}
      `;
    } else {
      summaryEl.innerHTML = metric("Changing env", "loading…");
    }
    return;
  }
  if (currentView === "life" && lifeWorldName === "evolution") {
    if (evolveData) {
      const s = evolveData.settled;
      summaryEl.innerHTML = `
        ${metric("Alive", s.alive, "s-closed")}
        ${metric("Born", evolveData.lineage.total_born)}
        ${metric("Generations", evolveData.lineage.max_generation)}
        ${metric("Settled τ", s.tau)}
      `;
    } else {
      summaryEl.innerHTML = metric("Evolution", "loading…");
    }
    return;
  }
  if (currentView === "life" && lifeWorld) {
    const summary = lifeWorld.summary;
    summaryEl.innerHTML = `
      ${metric("Population", summary.population)}
      ${metric("Alive", summary.alive, "s-closed")}
      ${metric("Critical", summary.critical, "s-critical")}
      ${metric("Dead", summary.dead, "s-broken")}
    `;
    return;
  }
  const rwaCount = assets.filter((asset) => asset.kind === "rwa_art").length;
  const agentCount = assets.filter((asset) => asset.kind === "agent_identity").length;
  summaryEl.innerHTML = `
    ${metric("Assets", assets.length)}
    ${metric("RWA", rwaCount)}
    ${metric("Agents", agentCount)}
    ${metric("Events", health.events)}
  `;
}

function renderAssetsView() {
  const selected = getSelectedAsset();
  contentEl.innerHTML = `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Assets</h2>
          <span class="badge">${assets.length}</span>
        </div>
        <div class="view-body">
          <div class="card-grid">
            ${assets.map(assetCard).join("")}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>${escapeHtml(selected.subject.title)}</h2>
          <span class="badge">${escapeHtml(selected.kind)}</span>
        </div>
        <div class="detail-body">${assetDetail(selected)}</div>
      </section>
    </div>
  `;
  contentEl.querySelectorAll("[data-asset-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.assetId;
      renderAssetsView();
    });
  });
}

function renderAgentsView() {
  const agents = assets.filter((asset) => asset.kind === "agent_identity");
  contentEl.innerHTML = `
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Agent Profiles</h2>
          <span class="badge">${agents.length}</span>
        </div>
        <div class="view-body">
          ${agents.map((agent) => `
            <div class="item">
              <strong>${escapeHtml(agent.subject.title)}</strong>
              <div class="asset-id">${escapeHtml(agent.agent?.did_document?.id || agent.id)}</div>
              <span class="badge">${escapeHtml(agent.owner.type)}</span>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>${escapeHtml(agents[0]?.subject?.title || "Agent")}</h2>
          <span class="badge">DID Wallet</span>
        </div>
        <div class="detail-body">
          ${agents.map(agentDetail).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderProofsView() {
  const proofItems = assets.flatMap((asset) =>
    asset.proofs.map((proof) => ({ asset, proof }))
  );
  contentEl.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>Proof Chain</h2>
        <span class="badge">${proofItems.length}</span>
      </div>
      <div class="view-body split">
        <div class="list">
          ${proofItems.map(({ asset, proof }) => `
            <div class="item">
              <strong>${escapeHtml(proof.type)}</strong>
              <div>${escapeHtml(asset.subject.title)}</div>
              <div>${escapeHtml(proof.summary || proof.issuer)}</div>
              <div class="mono">${escapeHtml(proof.hash)}</div>
            </div>
          `).join("")}
        </div>
        <div>
          <h3>Interaction Records</h3>
          <div class="list">
            ${interactions.map((interaction) => `
              <div class="item">
                <strong>${escapeHtml(interaction.interaction_id)}</strong>
                <div>${escapeHtml(interaction.dmo_title)}</div>
                <div>${escapeHtml(interaction.summary)}</div>
                <span class="badge">${escapeHtml(interaction.privacy_level)}</span>
                <div class="mono">${escapeHtml(interaction.proof_hash)}</div>
              </div>
            `).join("") || `<div class="item">No interaction records</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderDaoView() {
  contentEl.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>DAO Lab</h2>
        <span class="badge">${escapeHtml(dao.voting_model.method)}</span>
      </div>
      <div class="view-body">
        <div class="metric-grid">
          ${metric("RWA Assets", dao.metrics.rwa_assets)}
          ${metric("Agent IDs", dao.metrics.agent_identities)}
          ${metric("Interactions", dao.metrics.indexed_interactions)}
          ${metric("Avg RWA Trust", dao.metrics.average_rwa_trust)}
          ${metric("TOP Sim", dao.treasury.simulated_balance.toLocaleString("en-US"))}
          ${metric("Locked", `${Math.round(dao.treasury.locked_ratio * 100)}%`)}
        </div>
        <div class="list">
          ${dao.proposals.map((proposal) => `
            <div class="item">
              <strong>${escapeHtml(proposal.title)}</strong>
              <div class="asset-id">${escapeHtml(proposal.id)}</div>
              <div class="bar"><span style="width:${Math.round(proposal.conviction * 100)}%"></span></div>
              <div>
                <span class="badge">${escapeHtml(proposal.status)}</span>
                <span class="badge risk-${escapeHtml(proposal.risk)}">${escapeHtml(proposal.risk)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderLifeView() {
  if (!lifeWorld || !lifeWorld.agents.length) {
    contentEl.innerHTML = `
      <section class="panel">
        <div class="view-body">
          <div class="item">World Engine data unavailable. Is the API serving <span class="mono">fixtures/life</span>?</div>
        </div>
      </section>`;
    return;
  }

  const agents = lifeWorld.agents;
  const selected = agents.find((agent) => agent.id === selectedLifeId) || agents[0];
  const maxEnergy = Math.max(1, ...agents.map((agent) => agent.energy));
  const selectedMeta = statusMeta(selected.status);

  contentEl.innerHTML = `
    <div class="life-stack">
      ${worldSwitcherSection(lifeWorld.engine_root)}
      ${zipfPanel(lifeWorld.zipf)}
      <div class="content-grid">
        <section class="panel">
          <div class="panel-header">
            <h2>Organisms</h2>
            <span class="badge">tick ${escapeHtml(String(lifeWorld.summary.at_tick))}</span>
          </div>
          <div class="view-body">
            <div class="card-grid">
              ${agents.map((agent) => lifeAgentCard(agent, maxEnergy)).join("")}
            </div>
            ${lifeLegend()}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2><span class="status-dot ${selectedMeta.cls}">${selectedMeta.glyph}</span> ${escapeHtml(selected.title)}</h2>
            <span class="badge">gen ${escapeHtml(String(selected.generation))}</span>
          </div>
          <div class="detail-body">${lifeDetail(selected)}</div>
        </section>
      </div>
    </div>
  `;

  attachWorldSwitcher();
  contentEl.querySelectorAll("[data-life-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedLifeId = button.dataset.lifeId;
      renderLifeView();
    });
  });
}

function worldSwitcherSection(engineRoot) {
  const worlds = ["life", "population", "evolution", "adapt", "unified", "soc", "chain", "mode-a"];
  const worldLabel = { life: "Starving MVO", population: "Population (Zipf)", evolution: "Evolution", adapt: "Adapt (SOC)", unified: "Unified (τ≈2?)", soc: "SOC (τ=2 ✓)", chain: "Organic Chain", "mode-a": "Mode A (Bitcoin CSV)" };
  const buttons = worlds
    .map(
      (name) =>
        `<button type="button" class="nav-tab${name === lifeWorldName ? " active" : ""}" data-life-world="${name}">${worldLabel[name]}</button>`
    )
    .join("");
  const rootBadge = engineRoot ? `<span class="badge">engine_root ${escapeHtml(String(engineRoot).slice(0, 22))}…</span>` : "";
  return `
    <section class="panel compact">
      <div class="view-body">
        <div class="life-switcher"><span class="muted">World</span>${buttons}${rootBadge}</div>
      </div>
    </section>`;
}

function attachWorldSwitcher() {
  contentEl.querySelectorAll("[data-life-world]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.lifeWorld !== lifeWorldName) loadLife(button.dataset.lifeWorld);
    });
  });
}

function renderEvolutionView() {
  if (!evolveData) {
    contentEl.innerHTML = `<div class="life-stack">${worldSwitcherSection()}<section class="panel"><div class="view-body"><div class="item">Running evolution… (or <span class="mono">/evolve</span> unavailable)</div></div></section></div>`;
    attachWorldSwitcher();
    return;
  }

  const history = evolveData.history;
  const settled = evolveData.settled;
  const lineage = evolveData.lineage;
  const sweep = evolveData.sweep;

  contentEl.innerHTML = `
    <div class="life-stack">
      ${worldSwitcherSection()}
      <section class="panel">
        <div class="panel-header">
          <h2>Free Evolution — dark propensity mutates under selection</h2>
          <span class="badge">${escapeHtml(String(history.length))} samples</span>
        </div>
        <div class="view-body">
          <div class="metric-grid">
            ${metric("Settled τ", settled.tau)}
            ${metric("P^D* dark", settled.mean_dark, "s-critical")}
            ${metric("Diversity", settled.diversity, "s-closed")}
            ${metric("Alive", settled.alive)}
            ${metric("Born", lineage.total_born)}
            ${metric("Max gen", lineage.max_generation)}
          </div>
          ${seriesRow("τ — Zipf exponent (measured, not fed in)", history.map((r) => r.tau ?? 0), "var(--blue)")}
          ${seriesRow("P^D — mean dark-causality", history.map((r) => r.mean_dark), "var(--amber)", 0, 1)}
          ${seriesRow("Diversity D", history.map((r) => r.diversity), "var(--green)", 0, 1)}
          ${seriesRow("Population", history.map((r) => r.alive), "var(--muted)")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Sweep — hold P^D fixed, measure the emergent structure</h2>
          <span class="badge">phase transition</span>
        </div>
        <div class="view-body">
          ${sweepList(sweep)}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Reading — the trinity, tested honestly</h2></div>
        <div class="view-body">${evolveReading(settled, sweep)}</div>
      </section>
    </div>
  `;
  attachWorldSwitcher();
}

function renderAdaptView() {
  if (!adaptData) {
    contentEl.innerHTML = `<div class="life-stack">${worldSwitcherSection()}<section class="panel"><div class="view-body"><div class="item">Running changing-environment experiment… (or <span class="mono">/adapt</span> unavailable)</div></div></section></div>`;
    attachWorldSwitcher();
    return;
  }

  const study = adaptData.study;
  const history = adaptData.history;
  const peak = adaptData.peak;

  contentEl.innerHTML = `
    <div class="life-stack">
      ${worldSwitcherSection()}
      <section class="panel">
        <div class="panel-header">
          <h2>Does environmental change select dark-causality UP?</h2>
          <span class="badge">SOC test of the trinity</span>
        </div>
        <div class="view-body">
          ${driftStudyList(study, peak)}
          <div class="asset-id">Dark causality = evolvability (offspring mutation rate). Each row = free evolution at a fixed environmental change rate, averaged over ${escapeHtml(String(study[0].seeds))} seeds.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Representative run — population tracks a drifting niche θ(t)</h2>
          <span class="badge">envDrift 0.1</span>
        </div>
        <div class="view-body">
          ${seriesRow("θ(t) — niche optimum (random walk)", history.map((r) => r.theta), "var(--blue)")}
          ${seriesRow("P^D(t) — mean dark-causality / evolvability", history.map((r) => r.mean_dark), "var(--amber)", 0, 1)}
          ${seriesRow("maladaptation(t) — |trait − θ|  (bounded ⇒ tracking)", history.map((r) => r.maladaptation), "var(--green)")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Reading — ❌ → partial ✅, honestly</h2></div>
        <div class="view-body">${adaptReading(study, peak)}</div>
      </section>
    </div>
  `;
  attachWorldSwitcher();
}

function driftStudyList(study, peak) {
  const maxDark = Math.max(...study.map((r) => r.evolved_dark), 0.5);
  return (
    `<div class="list">` +
    study
      .map((row) => {
        const isPeak = row.env_drift === peak.env_drift;
        const overfast = row.extinctions > 0;
        const width = Math.round((row.evolved_dark / maxDark) * 100);
        const color = isPeak ? "var(--amber)" : overfast ? "var(--red)" : "var(--green)";
        const tag = isPeak ? " — peak P^D*" : overfast ? " — too fast (extinctions)" : "";
        return `
          <div class="item">
            <strong class="${isPeak ? "s-critical" : overfast ? "s-broken" : ""}">envDrift ${row.env_drift}${tag}</strong>
            <div class="bar"><span style="width:${width}%;background:${color}"></span></div>
            <div class="mono">P^D*=${row.evolved_dark} · τ=${row.tau} · maladapt=${row.maladaptation} · alive=${row.alive}</div>
          </div>`;
      })
      .join("") +
    `</div>`
  );
}

function adaptReading(study, peak) {
  const staticRow = study.find((r) => r.env_drift === 0) || study[0];
  return `
    <div class="item">
      <div>• <strong>Static environment</strong> ⇒ P^D* ≈ ${staticRow.evolved_dark} — exploitation wins; evolvability only costs.</div>
      <div style="margin-top:6px">• <strong>A moderate change rate (envDrift ≈ ${peak.env_drift}) maximises evolved dark-causality (P^D* ≈ ${peak.evolved_dark})</strong> — change rewards adaptability. <span class="s-closed">✓ the trinity's SOC direction</span>, flipping the static-environment result.</div>
      <div style="margin-top:6px">• Too-fast change ⇒ the population can't track (maladaptation explodes, extinctions begin) and P^D* falls back — an edge-of-chaos in environmental tracking.</div>
      <div class="muted" style="margin-top:8px">❌ Honest caveat: τ stays ~${staticRow.tau} throughout — here the dark-causality ratio and the Zipf exponent are <strong>decoupled</strong>, so the "max diversity ⟺ τ≈2" leg is not reproduced. Coupling exploration to the resource/energy distribution is the open next step.</div>
    </div>`;
}

function renderUnifiedView() {
  if (!unifyData) {
    contentEl.innerHTML = `<div class="life-stack">${worldSwitcherSection()}<section class="panel"><div class="view-body"><div class="item">Running unified experiment… (or <span class="mono">/unify</span> unavailable)</div></div></section></div>`;
    attachWorldSwitcher();
    return;
  }

  contentEl.innerHTML = `
    <div class="life-stack">
      ${worldSwitcherSection()}
      <section class="panel">
        <div class="panel-header">
          <h2>Does dark-causality coupling poise the system at τ≈2?</h2>
          <span class="badge">unified mechanism</span>
        </div>
        <div class="view-body">
          ${unifiedDriftList(unifyData.study)}
          <div class="asset-id">Dark causality drives BOTH evolvability (tracks the drifting niche) AND foraging variance (couples to τ). Each row averaged over ${escapeHtml(String(unifyData.study[0].seeds))} seeds. Bar = time spent in each phase.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>τ distribution — poised at 2, or flickering across it?</h2>
          <span class="badge">representative run</span>
        </div>
        <div class="view-body">
          ${tauHistogramChart(unifyData.histogram)}
          <div class="asset-id">Mass concentrated in the τ&lt;1 and τ≥3 bins (away from the amber τ≈2 bins) ⇒ bistable flickering, not self-organized poise.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Reading — coupling ✓, poise ✗</h2></div>
        <div class="view-body">${unifiedReading(unifyData.study)}</div>
      </section>
    </div>
  `;
  attachWorldSwitcher();
}

function unifiedDriftList(study) {
  return (
    `<div class="list">` +
    study
      .map((r) => {
        const sub = Math.round(r.frac_sub_critical * 100);
        const near = Math.round(r.frac_near_two * 100);
        const sup = Math.round(r.frac_super_critical * 100);
        return `
          <div class="item">
            <strong>envDrift ${r.env_drift} · P^D*=${r.evolved_dark} · τ̃=${r.tau_median}</strong>
            <div class="stacked-bar">
              <span style="width:${sub}%;background:var(--green)" title="diverse τ<1"></span>
              <span style="width:${near}%;background:var(--amber)" title="near τ≈2"></span>
              <span style="width:${sup}%;background:var(--red)" title="concentrated τ≥3"></span>
            </div>
            <div class="mono">diverse ${sub}% · near-2 ${near}% · concentrated ${sup}% · alive ${r.alive}</div>
          </div>`;
      })
      .join("") +
    `</div>`
  );
}

function tauHistogramChart(histogram) {
  const max = Math.max(...histogram.map((h) => h.count), 1);
  return (
    `<div class="list">` +
    histogram
      .map((h) => {
        const width = Math.round((h.count / max) * 100);
        return `
          <div class="coc3-row">
            <span class="mono">τ ${escapeHtml(h.label)}</span>
            <div class="coc3-track"><div class="coc3-fill" style="width:${width}%;background:${h.near_two ? "var(--amber)" : "var(--blue)"}"></div></div>
            <span class="mono">${h.count}</span>
          </div>`;
      })
      .join("") +
    `</div>`
  );
}

function unifiedReading(study) {
  const nearAvg = Math.round((study.reduce((s, r) => s + r.frac_near_two, 0) / study.length) * 100);
  return `
    <div class="item">
      <div><span class="s-closed">✓</span> Dark causality now <strong>couples to τ</strong>: τ medians rise into the critical band (~1.8) instead of staying flat at ~0.8 (as in the Adapt model).</div>
      <div style="margin-top:6px"><span class="s-closed">✓</span> Selection still maintains an <strong>interior P^D*</strong> (~0.3).</div>
      <div style="margin-top:6px"><span class="s-broken">✗</span> But τ is <strong>bistable</strong>: it lives in the diverse (τ&lt;1) and concentrated (τ≥3) phases — only ~${nearAvg}% of the time near 2. The system <strong>flickers across</strong> the edge; it is not <strong>poised</strong> on it.</div>
      <div class="muted" style="margin-top:8px">Conclusion: across all three evolution models, τ≈2 is the phase boundary, not a self-organized attractor. A genuine τ≈2 attractor needs a sandpile-like slow-drive / threshold-release SOC feedback that pure eco-evolution lacks — the precise next mechanism to add.</div>
    </div>`;
}

function renderSocView() {
  if (!socData) {
    contentEl.innerHTML = `<div class="life-stack">${worldSwitcherSection()}<section class="panel"><div class="view-body"><div class="item">Running SOC sandpile… (or <span class="mono">/soc</span> unavailable)</div></div></section></div>`;
    attachWorldSwitcher();
    return;
  }

  const s = socData;
  contentEl.innerHTML = `
    <div class="life-stack">
      ${worldSwitcherSection()}
      <section class="panel">
        <div class="panel-header">
          <h2>Self-organized criticality — does the system POISE at τ≈2?</h2>
          <span class="badge">slow drive + threshold release</span>
        </div>
        <div class="view-body">
          <div class="metric-grid">
            ${metric("τ (avalanche)", s.tau, "s-closed")}
            ${metric("R²", s.tau_r_squared)}
            ${metric("critical density", s.critical_density)}
            ${metric("poise std", s.load_fixed_point_std, "s-closed")}
            ${metric("mean avalanche", s.mean_avalanche)}
            ${metric("max avalanche", s.max_avalanche)}
          </div>
          ${seriesRow("mean load over time — converges to a critical fixed point (POISE, not bistable)", s.load_series, "var(--green)")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Avalanche distribution — power law across all scales</h2>
          <span class="badge">τ ≈ 2</span>
        </div>
        <div class="view-body">
          ${avalancheHistogram(s.histogram)}
          <div class="asset-id">A clean power law over many decades ⇒ the system sits AT criticality — not locked in one phase.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Robustness — self-organized from any initial condition</h2></div>
        <div class="view-body">${socRobustnessList(s.robustness)}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Verdict — ❌ → ✅</h2></div>
        <div class="view-body">${socReading(s)}</div>
      </section>
    </div>
  `;
  attachWorldSwitcher();
}

function avalancheHistogram(histogram) {
  const bins = histogram.filter((h) => h.count > 0);
  const max = Math.max(...bins.map((h) => h.count), 1);
  return (
    `<div class="list">` +
    bins
      .map((h) => {
        const width = Math.round((h.count / max) * 100);
        return `
          <div class="coc3-row">
            <span class="mono">${escapeHtml(h.label)}</span>
            <div class="coc3-track"><div class="coc3-fill" style="width:${width}%;background:var(--blue)"></div></div>
            <span class="mono">${h.count}</span>
          </div>`;
      })
      .join("") +
    `</div>`
  );
}

function socRobustnessList(rows) {
  return (
    `<div class="list">` +
    rows
      .map(
        (r) => `
          <div class="item">
            <strong>initial load ${r.initial_load}</strong>
            <div class="mono">critical density ${r.critical_density} · τ ${r.tau} · poise-std ${r.load_fixed_point_std}</div>
          </div>`
      )
      .join("") +
    `</div>` +
    `<div class="asset-id">The same critical density and τ from every initial condition ⇒ a self-organized attractor, not a tuned point.</div>`
  );
}

function socReading(s) {
  return `
    <div class="item">
      <div><span class="s-closed">✓ POISE</span> — mean load self-organizes to a stable critical fixed point (std ${s.load_fixed_point_std}); the eco-evolution models only flickered across the edge.</div>
      <div style="margin-top:6px"><span class="s-closed">✓ τ ≈ 2</span> — the avalanche rank-size exponent is ${s.tau} (mean-field SOC predicts exactly 2).</div>
      <div style="margin-top:6px"><span class="s-closed">✓ ROBUST</span> — the same critical state emerges from any initial condition (self-organized, not tuned).</div>
      <div class="muted" style="margin-top:8px">Conclusion: ConstraintNet's τ≈2 IS a self-organized critical attractor — but only with a genuine slow-drive / threshold-release feedback. Pure eco-evolution lacks it (bistable flicker); this constraint-tension sandpile supplies it. The ❌ is flipped to ✅, and the precise missing ingredient is identified.</div>
    </div>`;
}

function renderChainView() {
  if (!chainData) {
    contentEl.innerHTML = `<div class="life-stack">${worldSwitcherSection()}<section class="panel"><div class="view-body"><div class="item">Mining the organic chain… (or <span class="mono">/chain</span> unavailable)</div></div></section></div>`;
    attachWorldSwitcher();
    return;
  }

  const head = chainData.head;
  const blocks = chainData.blocks;
  const recent = blocks.slice(-12).reverse();

  contentEl.innerHTML = `
    <div class="life-stack">
      ${worldSwitcherSection()}
      <section class="panel">
        <div class="panel-header">
          <h2>Proof-of-Useful-Work — security budget == life-evolution budget</h2>
          <span class="badge">Mode B</span>
        </div>
        <div class="view-body">
          <div class="metric-grid">
            ${metric("Height", head.height)}
            ${metric("Difficulty", head.difficulty)}
            ${metric("Useful work", `${head.cumulative_work}`)}
            ${metric("Population", head.population)}
            ${metric("Pop fitness", head.population_fitness, "s-closed")}
            ${metric("Chain valid", chainData.validation.valid ? "✓" : "✗", chainData.validation.valid ? "s-closed" : "s-broken")}
          </div>
          ${seriesRow("difficulty — self-tunes toward the target search cost", blocks.map((b) => b.difficulty), "var(--blue)")}
          ${seriesRow("mean closure-fitness — the chain breeds better-closed life", blocks.map((b) => b.pop_fitness), "var(--green)", 0, 1)}
          ${seriesRow("trials per block — the useful work done", blocks.map((b) => b.trials), "var(--amber)")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Recent blocks</h2><span class="badge">block = metabolic tick</span></div>
        <div class="view-body">
          <div class="list">
            ${recent.map((b) => `
              <div class="item">
                <strong>#${b.height} · ${escapeHtml(b.miner)}</strong>
                <div class="mono">difficulty ${b.difficulty} · ${b.trials} trials · genome fitness ${b.fitness} · pop ${b.pop}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Living population — curated by PoUW + metabolic selection</h2></div>
        <div class="view-body">
          <div class="list">
            ${chainData.population.map((a) => `
              <div class="item">
                <strong>${escapeHtml(a.id)}</strong>
                <div class="mono">miner ${escapeHtml(a.miner || "—")} · fitness ${a.fitness} · energy ${a.energy} · forage ${a.forage} · basal ${a.basal}</div>
              </div>
            `).join("") || `<div class="item">no living agents</div>`}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Consensus &amp; integrity</h2></div>
        <div class="view-body">${chainReading()}</div>
      </section>
      ${networkPanels()}
    </div>
  `;
  attachWorldSwitcher();
}

function networkPanels() {
  if (!networkData) return "";
  const phaseTips = (phase) =>
    `<div class="mono">${phase.tips.map((t) => `${escapeHtml(t.id)}@h${t.height}/w${t.work}`).join("  ")}</div>`;
  const p1 = networkData.phase1;
  const p2 = networkData.phase2;
  const p3 = networkData.phase3;
  const a = p2.tips.find((t) => t.id === "n1");
  const b = p2.tips.find((t) => t.id === "n4");
  return `
    <section class="panel">
      <div class="panel-header">
        <h2>Toy P2P network — broadcast · heaviest-chain · fork &amp; reorg</h2>
        <span class="badge">5 nodes</span>
      </div>
      <div class="view-body">
        <div class="item">
          <strong class="s-closed">Phase 1 — honest gossip · converged ${p1.converged ? "✓" : "✗"}</strong>
          ${phaseTips(p1)}
        </div>
        <div class="item">
          <strong class="s-critical">Phase 2 — partitioned · forked ${p2.converged ? "✗ (still converged)" : "✓"}</strong>
          <div class="mono">branch A {n1-n3}: h${a?.height} / work ${a?.work} · branch B {n4-n5}: h${b?.height} / work ${b?.work} (lighter)</div>
          ${phaseTips(p2)}
        </div>
        <div class="item">
          <strong class="s-closed">Phase 3 — healed · converged ${p3.converged ? "✓" : "✗"}</strong>
          ${phaseTips(p3)}
          <div class="asset-id">reorgs: ${p3.reorgs.length ? p3.reorgs.map((r) => `${escapeHtml(r.node)} dropped ${r.orphaned} block(s)`).join("; ") : "none"} — the lighter branch was orphaned and its nodes recomputed the world along the heavier chain.</div>
        </div>
        <div class="muted">Fork-choice = heaviest valid chain. Work is objective (difficulty is consensus-enforced; work = expectedWork(difficulty)), so a node cannot win by faking work.</div>
      </div>
    </section>`;
}

function chainReading() {
  const v = chainData.validation;
  const t = chainData.tamper;
  return `
    <div class="item">
      <div class="mono" style="word-break:break-all">world_root ${escapeHtml(chainData.head.world_root)}</div>
      <div style="margin-top:8px"><span class="${v.valid ? "s-closed" : "s-broken"}">${v.valid ? "✓" : "✗"} chain valid</span> · <span class="${v.world_root_reproduced ? "s-closed" : "s-broken"}">${v.world_root_reproduced ? "✓" : "✗"} world_root independently reproduced</span> · <span class="${t.rejected ? "s-closed" : "s-broken"}">${t.rejected ? "✓" : "✗"} tampered chain rejected (${escapeHtml(t.reason || "")})</span></div>
      <div style="margin-top:8px">• <strong>Proof-of-Useful-Work</strong>: each block requires discovering a high-closure genome — the search secures the chain AND breeds better life (no wasted hashing).</div>
      <div style="margin-top:6px">• <strong>World engine in consensus</strong>: every validator recomputes the living-world state (<span class="mono">world_root</span>), so liveness + energy need no trusted indexer.</div>
      <div class="muted" style="margin-top:8px">Mode B PoC: block = metabolic tick, block reward = energy issuance, difficulty self-tunes. The chain's security budget and its life-evolution budget are one and the same — the "二合一".</div>
    </div>`;
}

function renderModeAView() {
  if (!modeAData) {
    contentEl.innerHTML = `<div class="life-stack">${worldSwitcherSection()}<section class="panel"><div class="view-body"><div class="item">Building the Bitcoin-anchored contract… (or <span class="mono">/mode-a</span> unavailable)</div></div></section></div>`;
    attachWorldSwitcher();
    return;
  }

  const m = modeAData;
  const v = m.validation;
  const s = m.security;
  const shortSeal = (x) => (x ? `${escapeHtml(x.slice(0, 10))}…` : "—");

  contentEl.innerHTML = `
    <div class="life-stack">
      ${worldSwitcherSection()}
      <section class="panel">
        <div class="panel-header">
          <h2>Bitcoin-anchored seal chain</h2>
          <span class="badge">single-use seals</span>
        </div>
        <div class="view-body">
          <div class="list">
            ${m.transitions
              .map(
                (t) => `
              <div class="item">
                <strong>T${t.height} · anchored @ btc #${t.anchored_height}</strong>
                <div class="mono">seal ${shortSeal(t.seal_in)} → ${shortSeal(t.seal_out)} · ${t.events} events · world alive ${t.alive}/${t.population}</div>
                <div class="asset-id">commit ${escapeHtml(t.commitment.slice(7, 29))}…  →  OP_RETURN on Bitcoin</div>
              </div>`
              )
              .join("")}
          </div>
          <div class="asset-id">Each transition spends the prior continuation output (single-use seal) and writes its commitment to an OP_RETURN — one Bitcoin-ordered chain.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Client-side validation</h2>
          <span class="badge ${v.valid ? "s-closed" : "s-broken"}">${v.valid ? "valid ✓" : "invalid ✗"}</span>
        </div>
        <div class="view-body">
          <div class="metric-grid">
            ${metric("Transitions", v.height)}
            ${metric("Anchored @btc", `#${v.anchored_height}`)}
            ${metric("Population", v.population)}
            ${metric("Alive", v.alive, "s-closed")}
          </div>
          <div class="item">
            <div class="mono">engine_root ${escapeHtml(v.engine_root)}</div>
            <div class="mono">state_root&nbsp; ${escapeHtml(v.state_root)}</div>
          </div>
          <div class="muted">A fresh node recomputes the whole world with the SAME engine, trusting only Bitcoin + the off-chain events. No CKB, no new chain, no trusted indexer.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Security = Bitcoin</h2></div>
        <div class="view-body">
          <div class="item">
            <div><span class="${s.tamper_rejected ? "s-closed" : "s-broken"}">${s.tamper_rejected ? "✓" : "✗"}</span> off-chain tamper rejected <span class="mono">(${escapeHtml(s.tamper_reason || "")})</span></div>
            <div style="margin-top:6px"><span class="${s.forged_rejected ? "s-closed" : "s-broken"}">${s.forged_rejected ? "✓" : "✗"}</span> forged history with no Bitcoin anchors rejected <span class="mono">(${escapeHtml(s.forged_reason || "")})</span></div>
            <div style="margin-top:6px"><span class="${s.double_spend_rejected ? "s-closed" : "s-broken"}">${s.double_spend_rejected ? "✓" : "✗"}</span> a single-use seal cannot be double-spent</div>
          </div>
          <div class="muted">To rewrite history you must double-spend a Bitcoin UTXO ⇒ attack Bitcoin itself.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Anchor on real Bitcoin signet</h2>
          <span class="badge">@scure/btc-signer</span>
        </div>
        <div class="view-body">
          <div class="item">
            <div>genesis commitment <span class="mono">${escapeHtml(m.signet.genesis_commitment)}</span></div>
            <div style="margin-top:4px">OP_RETURN scriptPubKey <span class="mono">${escapeHtml(m.signet.op_return)}</span></div>
          </div>
          <div class="asset-id mono">npm run csv:signet:anchor -- newkey → fund at signetfaucet.com → export BRC_SIGNET_WIF=… → npm run csv:signet:anchor -- --send → npm run csv:signet -- verify-seal &lt;seal&gt;</div>
          <div class="muted">This view uses a deterministic mock Bitcoin backend; swap it for the Esplora signet backend (already built) and the exact same client-side validation runs on real Bitcoin.</div>
        </div>
      </section>
    </div>
  `;
  attachWorldSwitcher();
}

function seriesRow(label, values, color, min, max) {
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values, lo + 1e-9);
  const span = hi - lo || 1;
  const bars = values
    .map((v) => {
      const height = Math.max(3, Math.round(((v - lo) / span) * 56));
      return `<div class="life-arc-bar" style="height:${height}px;background:${color}" title="${escapeHtml(String(v))}"></div>`;
    })
    .join("");
  return `<h3>${escapeHtml(label)}</h3><div class="life-arc">${bars}</div>`;
}

function sweepList(sweep) {
  return (
    `<div class="list">` +
    sweep
      .map((row) => {
        const collapsed = row.alive < 40;
        const width = Math.round(Math.min((row.tau ?? 0) / 3.2, 1) * 100);
        return `
          <div class="item">
            <strong class="${collapsed ? "s-broken" : "s-closed"}">P^D ${row.dark.toFixed(1)} — ${collapsed ? "COLLAPSED (winner-take-all)" : "diverse"}</strong>
            <div class="bar"><span style="width:${width}%;background:${collapsed ? "var(--red)" : "var(--blue)"}"></span></div>
            <div class="mono">τ=${row.tau} · diversity=${row.diversity} · alive=${row.alive}</div>
          </div>`;
      })
      .join("") +
    `</div>`
  );
}

function evolveReading(settled, sweep) {
  const collapsed = sweep.filter((r) => r.alive < 40);
  const edge = collapsed.length ? collapsed[0].dark : null;
  return `
    <div class="item">
      <div>• Selection settles dark-causality at an <strong>interior P^D* ≈ ${settled.mean_dark}</strong> — not 0 (pure exploit), not 1 (pure explore).</div>
      ${edge != null ? `<div style="margin-top:6px">• A <strong>phase transition</strong> near P^D ≈ ${edge}: beyond it the population collapses into a winner-take-all condensate (τ spikes, diversity → 0).</div>` : ""}
      <div style="margin-top:6px">• <strong>τ ≈ 2 is the critical edge</strong> between the diverse (τ&lt;1) and collapsed (τ&gt;3) phases — a knife-edge, not a basin.</div>
      <div class="muted" style="margin-top:8px">Honest: τ does not self-organize to 2 in this static environment — selection stays in the diverse sub-critical regime. Reaching the edge as an attractor likely needs a changing environment that rewards adaptability (next experiment).</div>
    </div>`;
}

function zipfPanel(zipf) {
  if (!zipf || !zipf.evaluated) return "";
  const tauCls = zipf.status === "optimal_criticality" ? "s-closed" : zipf.status === "off_criticality" ? "s-broken" : "s-critical";
  const max = Math.max(...zipf.rank_size);
  const bars = zipf.rank_size
    .map((size, index) => {
      const height = Math.max(6, Math.round((Math.log(size) / Math.log(max)) * 72));
      return `<div class="life-arc-bar" style="height:${height}px;background:var(--blue)" title="rank ${index + 1}: ${size}"></div>`;
    })
    .join("");
  return `
    <section class="panel">
      <div class="panel-header">
        <h2>Population Criticality — Zipf (C5)</h2>
        <span class="badge ${tauCls}">τ = ${zipf.tau.toFixed(3)}</span>
      </div>
      <div class="view-body">
        <div class="metric-grid">
          ${metric("τ exponent", zipf.tau.toFixed(3), tauCls)}
          ${metric("target τ", zipf.target_tau)}
          ${metric("R²", zipf.r_squared.toFixed(4))}
          ${metric("Diversity D", zipf.diversity.toFixed(3))}
          ${metric("Population", zipf.n)}
          ${metric("Status", String(zipf.status).replaceAll("_", " "), tauCls)}
        </div>
        <h3>Rank–size distribution <span class="badge">log height</span></h3>
        <div class="life-arc">${bars}</div>
        <h3>C5 closure — centered on τ = 2</h3>
        ${cocBars(zipf.c5)}
        <div class="asset-id">Trinity: constraint closure ⟺ max diversity ⟺ Zipf τ≈2 ⟺ optimal dark-causality</div>
      </div>
    </section>
  `;
}

function lifeAgentCard(agent, maxEnergy) {
  const meta = statusMeta(agent.status);
  const width = Math.round((Math.max(agent.energy, 0) / maxEnergy) * 100);
  return `
    <button type="button" class="life-list-card${agent.id === selectedLifeId ? " active" : ""}" data-life-id="${escapeHtml(agent.id)}">
      <div class="life-card-head">
        <span class="status-dot ${meta.cls}">${meta.glyph}</span>
        <strong>${escapeHtml(agent.title)}</strong>
        <span class="badge">gen ${escapeHtml(String(agent.generation))}</span>
      </div>
      <div class="asset-id">${escapeHtml(agent.id)}</div>
      <div class="bar"><span style="width:${width}%;background:${meta.color}"></span></div>
      <div class="life-card-foot">
        <span class="${meta.cls}">${escapeHtml(meta.label)}</span>
        <span class="mono">E=${escapeHtml(String(agent.energy))}</span>
      </div>
    </button>
  `;
}

function lifeDetail(agent) {
  const meta = statusMeta(agent.status);
  return `
    <div class="metric-grid">
      ${metric("Status", meta.label, meta.cls)}
      ${metric("Energy", agent.energy)}
      ${metric("ΔEnergy", agent.delta_energy)}
      ${metric("Generation", agent.generation)}
      ${metric("Basal / tick", agent.metabolism.basal_cost_per_tick)}
      ${metric("Intake / Spend", `${agent.metabolism.intake_total} / ${agent.metabolism.spend_total}`)}
    </div>

    <section class="section">
      <h3>Life Arc — energy × liveness</h3>
      ${energyArc(agent.arc)}
      ${lifeLegend()}
    </section>

    <section class="section">
      <h3>Constraint Closure CoC³ <span class="badge">${escapeHtml((agent.evaluated_conditions || []).join(" ⊗ "))}</span></h3>
      ${cocBars(agent.coc3)}
      <div class="coc3-sub">
        <div><span class="muted">C1 energy-work</span>${cocBars(agent.c1_energy_work)}</div>
        <div><span class="muted">C2 time-scale</span>${cocBars(agent.c2_timescale)}</div>
        <div><span class="muted">C3 ergodicity</span>${cocBars(agent.c3_ergodicity)}</div>
        <div><span class="muted">C4 topological</span>${cocBars(agent.c4_topological)}</div>
      </div>
      <div class="asset-id">pending: ${escapeHtml((agent.pending_conditions || []).join(", "))}</div>
    </section>

    <section class="section">
      <h3>Genome (M, R, φ) &amp; Membrane</h3>
      <div class="item">
        <div>M &nbsp;<span class="mono">${escapeHtml(agent.genome.M || "—")}</span></div>
        <div>R &nbsp;<span class="mono">${escapeHtml(agent.genome.R || "—")}</span></div>
        <div>φ &nbsp;<span class="mono">${escapeHtml(agent.genome.phi || "—")}</span></div>
        <div style="margin-top:6px">
          <span class="badge ${agent.genome.has_triad ? "s-closed" : "s-broken"}">(M,R) triad ${agent.genome.has_triad ? "✓" : "✗"}</span>
          <span class="badge ${agent.membrane_bound ? "s-closed" : "s-broken"}">membrane ${agent.membrane_bound ? "✓" : "✗"}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h3>Lineage</h3>
      <div class="item">
        <div>parent &nbsp;<span class="mono">${escapeHtml(agent.parent || "∅ genesis")}</span></div>
        <div>children &nbsp;<span class="mono">${escapeHtml((agent.children || []).join(", ") || "none")}</span></div>
        ${agent.recorded_death ? `<div class="s-broken" style="margin-top:6px">☠ ${escapeHtml(agent.recorded_death)}</div>` : ""}
      </div>
    </section>

    <section class="section">
      <h3>Metabolism Ledger</h3>
      <div class="timeline">
        ${(agent.ledger || []).map((entry) => `
          <div class="item">
            <strong>${escapeHtml(entry.op)} · ${escapeHtml(entry.flow)}</strong>
            <div>tick ${escapeHtml(String(entry.tick))} · Δ ${escapeHtml(String(entry.delta))} · balance ${escapeHtml(String(entry.explicit_balance_after))}</div>
            ${entry.note ? `<div class="asset-id">${escapeHtml(entry.note)}</div>` : ""}
          </div>
        `).join("") || `<div class="item">No ledger entries</div>`}
      </div>
    </section>

    ${(agent.mutations && agent.mutations.length) ? `
    <section class="section">
      <h3>Mutations (auditable evolution)</h3>
      <div class="list">
        ${agent.mutations.map((mutation) => `
          <div class="item">
            <strong>${escapeHtml(mutation.operator)}</strong>
            <div>${escapeHtml(mutation.target)}</div>
            <div class="asset-id">${escapeHtml(mutation.note || "")}</div>
          </div>
        `).join("")}
      </div>
    </section>` : ""}
  `;
}

function energyArc(arc) {
  const max = Math.max(1, ...arc.map((point) => point.energy));
  const bars = arc.map((point) => {
    const meta = statusMeta(point.status);
    const height = Math.max(6, Math.round((Math.max(point.energy, 0) / max) * 72));
    return `<div class="life-arc-bar" style="height:${height}px;background:${meta.color}" title="t${point.tick}  E=${point.energy}  ${point.status}"></div>`;
  }).join("");
  return `<div class="life-arc">${bars}</div>`;
}

function cocBars(triple) {
  const row = (label, value, color) => `
    <div class="coc3-row">
      <span>${escapeHtml(label)}</span>
      <div class="coc3-track"><div class="coc3-fill" style="width:${Math.round(value * 100)}%;background:${color}"></div></div>
      <span class="mono">${value.toFixed(3)}</span>
    </div>`;
  return `
    <div class="coc3">
      ${row("pos⁺", triple.pos, "var(--green)")}
      ${row("neg⁻", triple.neg, "var(--red)")}
      ${row("dark^D", triple.dark, "var(--amber)")}
    </div>`;
}

function lifeLegend() {
  return `
    <div class="life-legend">
      <span><i class="status-dot s-closed">●</i> closed</span>
      <span><i class="status-dot s-critical">◐</i> critical</span>
      <span><i class="status-dot s-broken">○</i> broken</span>
    </div>`;
}

function statusMeta(status) {
  if (status === "closed") return { glyph: "●", cls: "s-closed", label: "closed", color: "var(--green)" };
  if (status === "critical_closed") return { glyph: "◐", cls: "s-critical", label: "critical", color: "var(--amber)" };
  return { glyph: "○", cls: "s-broken", label: "broken", color: "var(--red)" };
}

function assetCard(asset) {
  const image = asset.metadata.image_uri || "/media/the-one-sample-artifact.svg";
  const risk = asset.metadata.risk?.level || "unknown";
  return `
    <button type="button" class="asset-card${asset.id === selectedId ? " active" : ""}" data-asset-id="${escapeHtml(asset.id)}">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(asset.subject.title)}">
      <div class="asset-card-body">
        <div>
          <div class="asset-title">${escapeHtml(asset.subject.title)}</div>
          <div class="asset-id">${escapeHtml(asset.id)}</div>
        </div>
        <div>
          <span class="badge">${escapeHtml(asset.kind)}</span>
          <span class="badge risk-${escapeHtml(risk)}">${escapeHtml(risk)}</span>
        </div>
        <div class="mono">${escapeHtml(asset.owner.id)}</div>
      </div>
    </button>
  `;
}

function assetDetail(asset) {
  const trust = asset.trust;
  return `
    <div class="metric-grid">
      ${metric("Proofs", asset.proofs.length)}
      ${metric("Events", asset.history.length)}
      ${metric("Interactions", asset.interactions.length)}
      ${metric("Authenticity", trust.authenticity, "trust-authenticity")}
      ${metric("Provenance", trust.provenance)}
      ${metric("Risk", trust.risk, "trust-risk")}
    </div>

    <section class="section">
      <h3>Owner</h3>
      <div class="item">
        <div>${escapeHtml(asset.owner.type)}</div>
        <div class="mono">${escapeHtml(asset.owner.id)}</div>
      </div>
    </section>

    <section class="section">
      <h3>RWA Metadata</h3>
      <div class="item">
        <div>${escapeHtml(asset.metadata.risk?.summary || "No risk summary")}</div>
        <div class="mono">${escapeHtml(asset.metadata.certificate_uri || asset.metadata.uri)}</div>
      </div>
    </section>

    <section class="section">
      <h3>BUC</h3>
      <div class="item mono">${escapeHtml(asset.buc)}</div>
    </section>

    <section class="section">
      <h3>Proof Chain</h3>
      <div class="list">
        ${asset.proofs.map((proof) => `
          <div class="item">
            <strong>${escapeHtml(proof.type)}</strong>
            <div>${escapeHtml(proof.summary || proof.issuer)}</div>
            <div class="mono">${escapeHtml(proof.hash)}</div>
          </div>
        `).join("") || `<div class="item">No proofs</div>`}
      </div>
    </section>

    <section class="section">
      <h3>History</h3>
      <div class="timeline">
        ${asset.history.map((event) => `
          <div class="item">
            <strong>${escapeHtml(event.op)}</strong>
            <div>${escapeHtml(event.timestamp)}</div>
            <div class="mono">${escapeHtml(event.event_hash)}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function agentDetail(asset) {
  const agent = asset.agent || {};
  const did = agent.did_document || {};
  return `
    <section class="section">
      <h3>DID Document</h3>
      <div class="item">
        <strong>${escapeHtml(did.id || asset.id)}</strong>
        <div class="mono">${escapeHtml((did.authentication || []).join(", "))}</div>
      </div>
    </section>

    <section class="section">
      <h3>Wallet Bindings</h3>
      <div class="list">
        ${(agent.wallets || []).map((wallet) => `
          <div class="item">
            <strong>${escapeHtml(wallet.purpose)}</strong>
            <div>${escapeHtml(wallet.address)}</div>
            <div class="mono">${escapeHtml(wallet.proof_hash)}</div>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="section">
      <h3>Keys</h3>
      <div class="list">
        ${(agent.keys || []).map((key) => `
          <div class="item">
            <strong>${escapeHtml(key.status || "active")}</strong>
            <div class="mono">${escapeHtml(key.id)}</div>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="section">
      <h3>Permissions</h3>
      <div class="list">
        ${(agent.permissions || []).map((permission) => `
          <div class="item">
            <strong>${escapeHtml(permission.scope)}</strong>
            <div>${escapeHtml(permission.granted_by)}</div>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="section">
      <h3>Behavior Scope</h3>
      <div class="item">
        <div>${escapeHtml((agent.behavior_scope?.bounds || []).join(", "))}</div>
        <div class="mono">max_daily_writes=${escapeHtml(String(agent.behavior_scope?.max_daily_writes || 0))}</div>
      </div>
    </section>

    <section class="section">
      <h3>Interaction Privacy</h3>
      <div class="item">
        <strong>${escapeHtml(agent.interaction_privacy?.default_level || "private_hash")}</strong>
        <div>${escapeHtml(agent.interaction_privacy?.retention || "")}</div>
      </div>
    </section>
  `;
}

function getSelectedAsset() {
  return assets.find((item) => item.id === selectedId) || assets[0];
}

function metric(label, value, className = "") {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${className}">${escapeHtml(String(value))}</strong>
    </div>
  `;
}

async function fetchJson(path) {
  const response = await fetch(`${apiUrl}${path}`);
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

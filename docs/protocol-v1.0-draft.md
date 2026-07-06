# BRC-LIFE v1.0 Draft (DMLP)

Status: alpha draft. Layered on top of [protocol-v0.1-draft.md](./protocol-v0.1-draft.md).

Protocol id: `brc-life` (the indexer also accepts `brc-dmp` / `0.1` events unchanged).

Version: `1.0`

> Full theory + project rationale: `../../数字物质生命协议DMLP与人工生命项目说明书_2026-06-03.md`.
> This file documents only the concrete on-chain surface that v1.0 adds.

## What v1.0 adds

v0.1 modelled digital-matter **assets** (DMOs). v1.0 turns a DMO into a candidate
**living object** (LDMO): an autopoietic agent whose existence is maintained by
constraint closure over a bit-chain substrate, and whose "alive / critical / dead"
verdict is **computed by a World Engine**, never declared by an event.

## New asset kinds

- `autopoietic_agent` — a living digital-matter object (genome + membrane + metabolism).
- `constraint_edge` — one edge of a ConstraintNet (constraint → flow / constraint → constraint).
- `niche` — an environment patch agents forage from and reshape (niche construction).
- `species_genome` — a shared genotype template instantiated by many agents.

## New operations (lifecycle)

| op | meaning | enforced precondition |
|----|---------|-----------------------|
| `bind_membrane` | bind a UTXO/cell as the agent's self/non-self boundary | autopoietic_agent |
| `metabolize` | record an energy intake/spend ledger entry | non-negative amount; intake may carry a fee/work `proof_hash` |
| `sense` | record a perception proof (FEP perception) | channel + summary |
| `act` | perform an energy-costed external action (FEP action) | positive `energy_cost`; action kind + summary |
| `form_constraint` | declare/update a `constraint_edge` | relation ∈ {constrains_flow, constrains_constraint, produced_by} |
| `spawn` | produce a child agent (replicate genome, optional mutation) | child dmo_id + buc + positive `energy_endowment` |
| `mutate` | introduce a whitelisted, logged genome variation | operator ∈ {param_perturb, module_add, module_remove, recombine} |
| `apoptose` | mark agent death | reason; usually `triggered_by: world_engine` |

## Life fields on `create` (autopoietic_agent)

An `autopoietic_agent` create MUST include `genome` and `metabolism`.

```jsonc
{
  "genome": {                  // L1+L4: the (M,R) triad — R is re-produced by the system itself
    "M": "ref://genome/M/...", // Metabolism: environment energy -> internal work
    "R": "ref://genome/R/...", // Repair/replication of consumed components
    "phi": "ref://genome/phi/...", // organization map by which R itself is produced (closure)
    "inscription": "btc:<block>:sat:<n>",
    "hash": "sha256:...",
    "lineage": { "parent": null, "generation": 0 }
  },
  "membrane": {                // L3: operational closure boundary (optional at create; can bind_membrane later)
    "binding": "rgbpp:cell:<id>:outpoint-0",
    "boundary_hash": "sha256:...",
    "permeability": { "energy_in": true, "signal_in": true, "matter_out": "controlled" }
  },
  "metabolism": { "energy": 100, "basal_cost_per_tick": 15 }, // L2: energy budget
  "cognition": { "free_energy": 4.0, "sensors": [...], "actuators": [...], "beliefs_hash": "sha256:..." }
}
```

Optional envelope fields (any op): `tick` (metabolic clock = block height), `energy_cost`,
`causal_tag` ∈ {pos, neg, dark} (ConstraintNet three-valued causality).

## The World Engine (liveness)

`services/world-engine` computes, for each autopoietic agent at a given tick, a
three-valued constraint-closure vector and a verdict:

```
energy(t) = energy_genesis + Σ(signed ledger deltas ≤ t) − basal_cost_per_tick × (t − genesis_tick)
ΔE        = energy(t) − energy(t − window)

C1 (energy-work closure):  μ⁺ = σ((ΔE−ε)/κ),  μ⁻ = σ((−ΔE−ε)/κ),  μ^D = 1−μ⁺−μ⁻   (ConstraintNet v1.3 §3.2)
C4 (topological closure):  from the (M,R,φ) triad + bound membrane + produced_by cycle
CoC³ = C1 ⊗ C4             (three-valued conjunction, product form, v1.3 §3.3)

status = closed           — robust reserves, closure not collapsing
       | critical_closed  — closure breaking but reserves remain (edge of chaos)
       | broken           — energy ≤ 0 / closure broken / apoptosed (= dead)
```

C2 (time-scale separation), C3 (ergodicity) and C5 (Zipf) are declared but not yet
evaluated (`pending_conditions`) — later milestones.

Output is deterministic: same indexed state + same params ⇒ same `engine_root`
(the closure analogue of the indexer `state_root`). Multiple independent indexers
computing the same `engine_root` is the v1.0 form of consensus (bisimulation).

## Run

```bash
npm test                 # 12 tests: v0.1 backward-compat + brc-life world engine
npm run validate         # validates fixtures/valid + fixtures/life + rejects fixtures/invalid
npm run life             # prints the life arc of every agent in fixtures/life
```

`npm run life` shows `cell-0001` born → forage (closed) → starve (critical) → die (broken),
`cell-0002` spawning `cell-0003` (a visible critical dip at the spawn tick), and the
gen-1 daughter `cell-0003` establishing itself and staying closed.

## v1.0 non-goals (unchanged from v0.1, plus)

- No claim of phenomenal consciousness / strong emergence.
- No on-chain arbitrary code execution; genome refs are off-chain rules in v1.0.
- World Engine runs indexer-side (off-chain deterministic) in v1.0; consensus-level
  enforcement is the v2.0 organic-PoW-chain research path.

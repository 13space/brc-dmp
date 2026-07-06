# BRC-DMP / BRC-LIFE

Bitcoin-rooted digital matter protocol workspace. This repository combines **BRC-DMP v0.1** (asset, RWA, Agent identity) with **BRC-LIFE v1.0 / DMLP** (deterministic artificial-life World Engine).

## What Runs Today

1. Define Digital Matter Objects (DMO) and validate protocol events.
2. Build deterministic indexed state from local fixtures.
3. Compute living-agent state via the BRC-LIFE World Engine (computed, not declared).
4. Expose assets, proofs, trust, interactions, and state roots through a local API.
5. Run organic-chain, PoUW, SOC/Zipf, and Bitcoin/Signet adapter experiments offline.

**89 tests pass** with no network dependency.

## Protocol Surface

Protocol id: `brc-life` (indexer also accepts legacy `brc-dmp` / `0.1` events).

Version: `1.0` — see `docs/protocol-v1.0-draft.md`. v0.1 draft: `docs/protocol-v0.1-draft.md`.

Asset kinds:

- `digital_matter`, `ordinal_art`, `rwa_art`, `sft_fraction`, `did_badge`, `dao_position`
- `agent_identity`, `interaction_proof`
- `autopoietic_agent` — living digital-matter object (genome + membrane + metabolism)
- `constraint_edge`, `niche`, `species_genome`

Operations:

- Asset: `create`, `transfer`, `update_metadata`, `attest_trust`, `fractionalize`, `anchor_state`
- Agent: `record_interaction`, `bind_wallet`, `rotate_key`, `set_agent_policy`
- Lifecycle: `bind_membrane`, `metabolize`, `sense`, `act`, `form_constraint`, `spawn`, `mutate`, `apoptose`

The **World Engine** (`services/world-engine`) computes a three-valued constraint-closure vector (CoC³) per agent and a verdict — `closed` / `critical_closed` / `broken` — from metabolism, membrane binding, and ConstraintNet events.

## Quick Start

Requires Node **>= 24**.

```bash
npm install
npm test
npm run validate
npm run index   # build DMO state from fixtures/valid
npm run life    # print autopoietic agent life arcs from fixtures/life
npm run api     # start API + Plutus MVP frontend
```

API: `http://127.0.0.1:8787`

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Full test suite (89 tests) |
| `npm run validate` | Validate valid/life/population fixtures; reject invalid ones |
| `npm run index` | Build v0.1/v1.0 compatible DMO state |
| `npm run life` | Run World Engine on `fixtures/life` |
| `npm run life:pop` | Run World Engine on 20 population fixtures |
| `npm run api` | Start REST API and Plutus MVP frontend |
| `npm run evolve` | Evolution experiment CLI |
| `npm run adapt` | Adaptation experiment CLI |
| `npm run unify` | Zipf/unify experiment CLI |
| `npm run soc` | Self-organized criticality experiment CLI |
| `npm run chain` | Organic chain experiment CLI |
| `npm run network` | Network partition / reorg experiment CLI |
| `npm run csv` | CSV / OP_RETURN adapter CLI |
| `npm run csv:signet` | Signet adapter CLI |
| `npm run chain:scan` | Scan committed `fixtures/chain/tx-*.json` into indexed state |
| `npm run chain:fixtures` | Regenerate chain tx fixtures from protocol events |
| `npm run chain:ingest:fixtures` | Persist fixture scan into `.tmp/chain-ingest/state.json` |
| `npm run chain:ingest` | Catch up Esplora blocks once (Signet by default) |
| `npm run chain:daemon` | Poll Esplora and ingest new blocks continuously |
| `npm run chain:ingest:status` | Print persisted ingest/indexer status |
| `npm run chain:scan:block` | Scan a live Esplora block (requires network) |

## Layout

```text
apps/web/                  Plutus MVP frontend (served by services/api)
docs/                      Architecture, vision, v0.1/v1.0 protocol drafts, handoff
fixtures/valid/            v0.1 assets, RWA, Agent, proof, governance samples
fixtures/life/             BRC-LIFE life-event samples
fixtures/population/       20 population samples for Zipf / criticality
fixtures/invalid/          Negative samples for rejection rules
fixtures/templates/        RWA onboarding templates
packages/schema/           Protocol constants, validator, canonical hash, JSON Schema
services/indexer/          DMO state builder
services/api/              Local REST API and static file server
services/world-engine/     Life state, evolution, adaptation, SOC, Zipf experiments
services/organic-chain/    Organic chain, PoUW, network reorg experiments
services/csv-adapter/      CSV / Bitcoin / OP_RETURN / signet adapter
scripts/                   Population generation, paper/figure data export
tests/                     Full test suite
```

## API Endpoints

With `npm run api` running:

**Asset / Agent layer**

- `GET /health`, `/assets`, `/agents`, `/interactions`, `/events`, `/state-root`
- `GET /assets/:id`, `/assets/:id/proofs`, `/assets/:id/trust`, `/assets/:id/interactions`
- `GET /assets/:id/agent`, `/assets/:id/did`
- `GET /dao/summary`, `/media/:file`

**BRC-LIFE World Engine**

- `GET /life` — full world payload (`fixtures/life` by default)
- `GET /life/:id` — single autopoietic agent with computed life arc
- `GET /life/engine-root` — `engine_root`, `state_root`, summary
- `GET /life?world=population` — 20-agent Zipf / criticality world
- `GET /evolve`, `/adapt`, `/unify`, `/soc`, `/chain`, `/network`, `/mode-a` — research experiment endpoints
- `GET /chain/index` — chain adapter demo (inscription + OP_RETURN hash → indexer)
- `GET /chain/ingest/status` — persisted Esplora ingest cursor + roots
- `GET /chain/ingest/state` — full indexed state from persisted ingest
- `GET /assets/:id/agent/verify` — verify optional wallet/key `signature_proof` records

Agent wallet signatures (optional on `bind_wallet` / `rotate_key`):

- `signature_proof.scheme`: `schnorr-bip340` | `ecdsa-legacy` | `bip322-simple`
- `bip322-simple` uses a base64 BIP-322 simple signature (SegWit/Taproot compatible); other schemes store hex signatures
- Canonical messages: `services/agent-wallet/messages.js`
- Verification: `services/agent-wallet/verify.js`

Chain event adapter:

- Inscription transport: `application/vnd.brc-dmp.event+json` ord envelope
- OP_RETURN transport: `BRC1` envelope (full event or 32-byte event hash + off-chain store)
- Scanner/indexer: `services/csv-adapter/src/chain-scanner.js`, `chain-indexer.js`

Frontend views: Assets, Agents, **Life** (world switcher + Zipf/SOC/chain experiments), Proofs, DAO.

## Fixtures at a Glance

- `fixtures/valid` — 12 events (RWA, Agent DID wallet, interactions, governance)
- `fixtures/life` — 16 life events (3 autopoietic agents with spawn/mutation/apoptosis arcs)
- `fixtures/population` — 20 population create events
- `fixtures/invalid` — 6 negative samples correctly rejected by the validator

## Development Notes

- No network dependency is required for tests or validation.
- Fixtures are sorted by filename before indexing for deterministic state reconstruction.
- Runtime validation uses `packages/schema/src/validate.js`; JSON Schema files serve as documentation and a future compatibility layer.
- RWA and Agent fixtures are semi-real samples, not legal or custody products.
- World Engine is a deterministic research prototype — it does not claim phenomenal consciousness or strong emergence.
- See `docs/HANDOFF_2026-07-06.md` for the latest project handoff and next-step priorities.

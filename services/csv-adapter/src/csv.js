// BRC-LIFE — Mode A: client-side validation (CSV) of a Bitcoin-anchored world.
// ---------------------------------------------------------------------------
// RGB-style. State (brc-life events → DMO/LDMO world) lives OFF-CHAIN. Bitcoin
// stores only a commitment per state transition, bound to a single-use seal.
// Anyone can VALIDATE the whole history from scratch with nothing but Bitcoin
// and the off-chain data — recomputing the world with the SAME deterministic
// engine you already built. No separate chain, no trusted indexer; security is
// exactly Bitcoin's proof-of-work (you cannot fork the seal chain without
// double-spending a UTXO).
import { hashObject } from "../../../packages/schema/src/canonicalize.js";
import { buildState } from "../../indexer/src/state.js";
import { runWorldEngine } from "../../world-engine/src/engine.js";

const ZERO = "sha256:" + "0".repeat(64);

// The commitment anchored in each seal spend. It binds the prior commitment
// (hash-linking the history), this transition's events, and — crucially — the
// recomputed world state roots. Note seal continuity is structural (the next
// seal is the spend's output 0), so it need not be inside the commitment.
function transitionCommitment({ height, prev, eventsRoot, stateRoot, engineRoot }) {
  return hashObject({ height, prev, events_root: eventsRoot, state_root: stateRoot, engine_root: engineRoot });
}

// Producer side: advance the world by a batch of events and anchor it to Bitcoin.
export function buildContract(backend, batches) {
  let seal = backend.genesisUtxo();
  let prev = ZERO;
  let cumulative = [];
  const transitions = [];

  for (let height = 0; height < batches.length; height += 1) {
    cumulative = cumulative.concat(batches[height]);
    const state = buildState(cumulative); // indexer validates + applies (throws on bad events)
    const world = runWorldEngine(state);
    const eventsRoot = hashObject(batches[height]);
    const commitment = transitionCommitment({
      height,
      prev,
      eventsRoot,
      stateRoot: state.state_root,
      engineRoot: world.engine_root
    });
    const spend = backend.spend(seal, commitment); // single-use seal; output 0 = next seal

    transitions.push({
      height,
      seal_in: seal,
      seal_out: spend.next_seal,
      spend_txid: spend.spend_txid,
      anchored_height: spend.height,
      events: batches[height],
      events_root: eventsRoot,
      state_root: state.state_root,
      engine_root: world.engine_root,
      population: world.population,
      alive: world.alive,
      commitment,
      prev
    });
    prev = commitment;
    seal = spend.next_seal;
  }

  return { genesis_seal: transitions[0]?.seal_in ?? null, tip_seal: seal, transitions };
}

// Verifier side: CLIENT-SIDE VALIDATION from scratch. Trusts ONLY `backend`
// (Bitcoin) and the off-chain events; recomputes everything else. Async so it
// works against a live Esplora backend as well as the in-memory mock.
export async function validateContract(backend, contract) {
  let seal = contract.genesis_seal;
  let prev = ZERO;
  let cumulative = [];

  for (const t of contract.transitions) {
    // 1. Seal chain: this transition must spend the seal we currently expect.
    if (t.seal_in !== seal) return { valid: false, reason: "seal_chain_broken", height: t.height };

    // 2. Bitcoin anchor: that seal must actually be spent (single-use seal closed).
    const spend = await backend.getSpend(seal);
    if (!spend || !spend.confirmed) return { valid: false, reason: "seal_not_spent_on_bitcoin", height: t.height };
    if (spend.next_seal !== t.seal_out) return { valid: false, reason: "bad_continuation_seal", height: t.height };

    // 3. Recompute the world from the off-chain events (do NOT trust the claimed roots).
    cumulative = cumulative.concat(t.events);
    let state;
    let world;
    try {
      state = buildState(cumulative);
      world = runWorldEngine(state);
    } catch (error) {
      return { valid: false, reason: `invalid_state_transition: ${error.message}`, height: t.height };
    }

    // 4. The Bitcoin-anchored commitment must equal the one we recompute.
    const expected = transitionCommitment({
      height: t.height,
      prev,
      eventsRoot: hashObject(t.events),
      stateRoot: state.state_root,
      engineRoot: world.engine_root
    });
    if (spend.commitment !== expected) return { valid: false, reason: "commitment_mismatch", height: t.height };

    prev = expected;
    seal = spend.next_seal;
  }

  const state = buildState(cumulative);
  const world = runWorldEngine(state);
  const lastSeal = contract.transitions.at(-1)?.seal_in;
  const lastSpend = lastSeal ? await backend.getSpend(lastSeal) : null;
  return {
    valid: true,
    height: contract.transitions.length,
    tip_seal: seal,
    anchored_height: lastSpend?.height ?? null,
    state_root: state.state_root,
    engine_root: world.engine_root,
    world
  };
}

// Compute the commitment to anchor for a single genesis transition (the whole
// event set as one transition). This is exactly what validateContract expects
// for transition 0, so a seal whose OP_RETURN carries this commitment validates.
export function planGenesis(events) {
  const state = buildState(events);
  const world = runWorldEngine(state);
  const commitment = transitionCommitment({
    height: 0,
    prev: ZERO,
    eventsRoot: hashObject(events),
    stateRoot: state.state_root,
    engineRoot: world.engine_root
  });
  return {
    height: 0,
    prev: ZERO,
    events_root: hashObject(events),
    state_root: state.state_root,
    engine_root: world.engine_root,
    population: world.population,
    alive: world.alive,
    commitment
  };
}

// Split a flat, ordered event list into N transition batches (any prefix is a
// valid cumulative state, so any split works).
export function batchEvents(events, batchCount) {
  const size = Math.ceil(events.length / batchCount);
  const batches = [];
  for (let i = 0; i < events.length; i += size) batches.push(events.slice(i, i + size));
  return batches;
}

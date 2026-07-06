import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { hashObject } from "../../../packages/schema/src/canonicalize.js";
import { TRUST_DIMENSIONS, PROTOCOL, VERSION } from "../../../packages/schema/src/constants.js";
import { assertValidEvent } from "../../../packages/schema/src/validate.js";

export async function loadEventsFromDirectory(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();

  const events = [];
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const event = JSON.parse(await readFile(fullPath, "utf8"));
    assertValidEvent(event);
    events.push(event);
  }
  return events;
}

export async function buildStateFromDirectory(directory) {
  const events = await loadEventsFromDirectory(directory);
  return buildState(events);
}

export function buildState(events) {
  const state = {
    protocol: PROTOCOL,
    version: VERSION,
    assets: new Map(),
    events: []
  };

  for (const event of events) {
    applyEvent(state, assertValidEvent(event));
  }

  const snapshot = toSnapshot(state);
  return {
    ...snapshot,
    state_root: hashObject(snapshot)
  };
}

export function toSnapshot(state) {
  const assets = Array.from(state.assets.values()).sort((a, b) => a.id.localeCompare(b.id));
  const events = state.events.slice().sort((a, b) => a.sequence - b.sequence);
  return {
    protocol: state.protocol,
    version: state.version,
    assets,
    events
  };
}

export function applyEvent(state, event) {
  const eventRef = {
    sequence: state.events.length,
    event_id: event.event_id,
    dmo_id: event.dmo_id,
    op: event.op,
    timestamp: event.timestamp,
    event_hash: hashObject(event)
  };

  switch (event.op) {
    case "create":
      applyCreate(state, event, eventRef);
      break;
    case "transfer":
      applyTransfer(state, event, eventRef);
      break;
    case "update_metadata":
      applyUpdateMetadata(state, event, eventRef);
      break;
    case "attest_trust":
      applyAttestTrust(state, event, eventRef);
      break;
    case "fractionalize":
      applyFractionalize(state, event, eventRef);
      break;
    case "anchor_state":
      applyAnchorState(state, event, eventRef);
      break;
    case "record_interaction":
      applyRecordInteraction(state, event, eventRef);
      break;
    case "bind_wallet":
      applyBindWallet(state, event, eventRef);
      break;
    case "rotate_key":
      applyRotateKey(state, event, eventRef);
      break;
    case "set_agent_policy":
      applySetAgentPolicy(state, event, eventRef);
      break;
    case "bind_membrane":
      applyBindMembrane(state, event, eventRef);
      break;
    case "metabolize":
      applyMetabolize(state, event, eventRef);
      break;
    case "sense":
      applySense(state, event, eventRef);
      break;
    case "act":
      applyAct(state, event, eventRef);
      break;
    case "form_constraint":
      applyFormConstraint(state, event, eventRef);
      break;
    case "spawn":
      applySpawn(state, event, eventRef);
      break;
    case "mutate":
      applyMutate(state, event, eventRef);
      break;
    case "apoptose":
      applyApoptose(state, event, eventRef);
      break;
    default:
      throw new Error(`Unsupported event op: ${event.op}`);
  }

  state.events.push(eventRef);
}

function applyCreate(state, event, eventRef) {
  if (state.assets.has(event.dmo_id)) {
    throw new Error(`DMO already exists: ${event.dmo_id}`);
  }

  const dmo = {
    id: event.dmo_id,
    // Preserve the event's own protocol generation so a brc-dmp/0.1 object stays
    // labelled 0.1 inside a brc-life/1.0 world (mixed-generation worlds are valid).
    p: event.p || PROTOCOL,
    v: event.v || VERSION,
    buc: event.buc,
    kind: event.kind,
    source: event.source,
    subject: event.subject,
    owner: event.owner,
    metadata: event.metadata,
    metadata_history: [versionedMetadata(event.metadata, eventRef)],
    proofs: event.proofs ? event.proofs.slice() : [],
    trust: normalizeTrust(event.trust || {}),
    fractions: [],
    anchors: [],
    interactions: [],
    agent: normalizeAgent(event.agent || null),
    history: [historyEntry(eventRef)]
  };

  // brc-life v1.0: attach living sub-state only for objects that carry it,
  // so non-life DMOs (rwa_art, etc.) keep their original shape.
  if (event.kind === "autopoietic_agent" || event.genome || event.membrane || event.metabolism || event.cognition) {
    attachLifeState(dmo, {
      genome: event.genome || null,
      membrane: event.membrane || null,
      metabolism: event.metabolism || null,
      cognition: event.cognition || null,
      event,
      eventRef
    });
  }

  state.assets.set(event.dmo_id, dmo);
}

function applyTransfer(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  dmo.owner = event.to_owner;
  dmo.history.push(historyEntry(eventRef));
}

function applyUpdateMetadata(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  dmo.metadata = event.metadata;
  dmo.metadata_history.push(versionedMetadata(event.metadata, eventRef, event.reason));
  dmo.history.push(historyEntry(eventRef));
}

function applyAttestTrust(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  dmo.proofs.push(event.attestation);
  if (event.trust_delta) {
    dmo.trust = applyTrustDelta(dmo.trust, event.trust_delta);
  }
  dmo.history.push(historyEntry(eventRef));
}

function applyFractionalize(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  dmo.fractions.push({
    ...event.fraction,
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applyAnchorState(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  dmo.anchors.push({
    ...event.anchor,
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applyRecordInteraction(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  dmo.interactions.push({
    ...event.interaction,
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.proofs.push({
    type: "interaction_proof",
    issuer: event.actor.id,
    hash: event.interaction.proof_hash,
    uri: event.interaction.proof_uri,
    issued_at: event.timestamp,
    summary: event.interaction.summary
  });
  dmo.history.push(historyEntry(eventRef));
}

function applyBindWallet(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  const agent = requireAgent(dmo);
  upsertById(agent.wallets, {
    status: "active",
    bound_at: event.timestamp,
    ...event.wallet_binding
  });
  agent.wallet_history.push({
    ...event.wallet_binding,
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applyRotateKey(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  const agent = requireAgent(dmo);
  const { revoked_key_id: revokedKeyId, new_key: newKey, reason } = event.key_rotation;

  if (revokedKeyId) {
    for (const key of agent.keys) {
      if (key.id === revokedKeyId) {
        key.status = "rotated";
        key.rotated_at = event.timestamp;
      }
    }
    if (agent.did_document?.verificationMethod) {
      for (const method of agent.did_document.verificationMethod) {
        if (method.id === revokedKeyId) {
          method.status = "rotated";
          method.rotated_at = event.timestamp;
        }
      }
    }
  }

  const activeKey = {
    status: "active",
    created_at: event.timestamp,
    ...newKey
  };
  upsertById(agent.keys, activeKey);
  if (agent.did_document) {
    upsertById(agent.did_document.verificationMethod, activeKey);
    agent.did_document.authentication = [activeKey.id];
    agent.did_document.assertionMethod = [activeKey.id];
  }
  agent.key_history.push({
    revoked_key_id: revokedKeyId || null,
    new_key_id: activeKey.id,
    reason,
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applySetAgentPolicy(state, event, eventRef) {
  const dmo = requireDmo(state, event.dmo_id);
  const agent = requireAgent(dmo);
  const policy = event.agent_policy;

  if (policy.permissions) agent.permissions = policy.permissions;
  if (policy.behavior_scope) agent.behavior_scope = policy.behavior_scope;
  if (policy.interaction_privacy) agent.interaction_privacy = policy.interaction_privacy;
  agent.policy_history.push({
    ...policy,
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

// ---------------------------------------------------------------------------
// brc-life v1.0 lifecycle handlers
// ---------------------------------------------------------------------------

function applyBindMembrane(state, event, eventRef) {
  const dmo = requireLivingAgent(state, event.dmo_id);
  dmo.membrane = event.membrane;
  dmo.history.push(historyEntry(eventRef));
}

function applyMetabolize(state, event, eventRef) {
  const dmo = requireLivingAgent(state, event.dmo_id);
  const { flow, amount, note } = event.energy;
  recordEnergy(dmo, { tick: event.tick, op: "metabolize", flow, delta: energySign(flow) * amount, note, eventRef });
  dmo.history.push(historyEntry(eventRef));
}

function applySense(state, event, eventRef) {
  const dmo = requireLivingAgent(state, event.dmo_id);
  dmo.observations.push({
    ...event.observation,
    causal_tag: event.causal_tag || null,
    tick: tickOf(event),
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applyAct(state, event, eventRef) {
  const dmo = requireLivingAgent(state, event.dmo_id);
  recordEnergy(dmo, { tick: event.tick, op: "act", flow: "spend", delta: -event.energy_cost, note: event.action.kind, eventRef });
  dmo.actions.push({
    ...event.action,
    energy_cost: event.energy_cost,
    causal_tag: event.causal_tag || null,
    tick: tickOf(event),
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applyFormConstraint(state, event, eventRef) {
  const dmo = requireLivingAgent(state, event.dmo_id);
  upsertById(dmo.constraints, {
    id: event.constraint.constraint_id,
    ...event.constraint,
    tick: tickOf(event),
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applySpawn(state, event, eventRef) {
  const parent = requireLivingAgent(state, event.dmo_id);
  const child = event.child;
  if (state.assets.has(child.dmo_id)) {
    throw new Error(`child DMO already exists: ${child.dmo_id}`);
  }

  // Reproduction has a metabolic cost: the parent transfers an energy endowment.
  recordEnergy(parent, {
    tick: event.tick,
    op: "spawn",
    flow: "transfer_out",
    delta: -child.energy_endowment,
    note: `spawn ${child.dmo_id}`,
    eventRef
  });
  parent.children.push(child.dmo_id);

  const generation = (parent.lineage?.generation ?? 0) + 1;
  const lineage = { parent: parent.id, generation };
  const genome = { ...cloneGenome(child.genome || parent.genome), lineage };

  const childDmo = {
    id: child.dmo_id,
    p: event.p || PROTOCOL,
    v: event.v || VERSION,
    buc: child.buc,
    kind: "autopoietic_agent",
    source: event.source,
    subject: {
      title: child.title || `${parent.subject.title} · gen${generation}`,
      creator: parent.subject.creator,
      category: "autopoietic_agent",
      description: `Spawned from ${parent.id}`
    },
    owner: child.owner || parent.owner,
    metadata: parent.metadata,
    metadata_history: [versionedMetadata(parent.metadata, eventRef, `spawned from ${parent.id}`)],
    proofs: [],
    trust: normalizeTrust({}),
    fractions: [],
    anchors: [],
    interactions: [],
    agent: normalizeAgent(null),
    history: [historyEntry(eventRef)]
  };
  attachLifeState(childDmo, {
    genome,
    membrane: null,
    metabolism: { energy: child.energy_endowment, basal_cost_per_tick: parent.metabolism.basal_cost_per_tick },
    cognition: parent.cognition || null,
    event,
    eventRef
  });
  if (child.mutation) {
    childDmo.genome_mutations.push({ ...child.mutation, tick: tickOf(event), event_id: event.event_id, timestamp: event.timestamp });
  }

  state.assets.set(child.dmo_id, childDmo);
  parent.history.push(historyEntry(eventRef));
}

function applyMutate(state, event, eventRef) {
  const dmo = requireLivingAgent(state, event.dmo_id);
  dmo.genome_mutations.push({
    ...event.mutation,
    tick: tickOf(event),
    event_id: event.event_id,
    timestamp: event.timestamp
  });
  dmo.history.push(historyEntry(eventRef));
}

function applyApoptose(state, event, eventRef) {
  const dmo = requireLivingAgent(state, event.dmo_id);
  dmo.life_status = "dead";
  dmo.death = {
    ...event.death,
    tick: tickOf(event),
    event_id: event.event_id,
    timestamp: event.timestamp
  };
  dmo.history.push(historyEntry(eventRef));
}

// --- life-state helpers ---

function attachLifeState(dmo, { genome, membrane, metabolism, cognition, event, eventRef }) {
  dmo.genome = genome;
  dmo.membrane = membrane;
  dmo.metabolism = normalizeMetabolism(metabolism, event);
  dmo.cognition = cognition;
  dmo.lineage = genome?.lineage ? { parent: genome.lineage.parent ?? null, generation: genome.lineage.generation ?? 0 } : { parent: null, generation: 0 };
  dmo.constraints = [];
  dmo.observations = [];
  dmo.actions = [];
  dmo.children = [];
  dmo.genome_mutations = [];
  dmo.life_status = "active";
  void eventRef;
}

function normalizeMetabolism(metabolism, event) {
  if (!metabolism) return null;
  const genesisTick = tickOf(event);
  return {
    energy_genesis: metabolism.energy,
    basal_cost_per_tick: metabolism.basal_cost_per_tick,
    genesis_tick: genesisTick,
    intake_total: 0,
    spend_total: 0,
    last_tick: genesisTick,
    ledger: []
  };
}

function recordEnergy(dmo, { tick, op, flow, delta, note, eventRef }) {
  const m = dmo.metabolism;
  if (!m) throw new Error(`DMO has no metabolism: ${dmo.id}`);
  if (delta >= 0) {
    m.intake_total += delta;
  } else {
    m.spend_total += -delta;
  }
  const effectiveTick = Number.isInteger(tick) ? tick : m.last_tick;
  // explicit_balance excludes the engine's basal drain; the World Engine owns true energy(tick).
  const explicitBalance = m.energy_genesis + m.intake_total - m.spend_total;
  m.ledger.push({
    tick: effectiveTick,
    op,
    flow,
    delta,
    note: note ?? null,
    explicit_balance_after: explicitBalance,
    event_id: eventRef.event_id,
    timestamp: eventRef.timestamp
  });
  m.last_tick = effectiveTick;
}

function energySign(flow) {
  return ["spend", "basal", "transfer_out"].includes(flow) ? -1 : 1;
}

function cloneGenome(genome) {
  if (!genome) return { M: "inherited", R: "inherited", phi: "inherited" };
  return {
    M: genome.M,
    R: genome.R,
    phi: genome.phi,
    inscription: genome.inscription,
    hash: genome.hash
  };
}

function tickOf(event) {
  return Number.isInteger(event.tick) ? event.tick : 0;
}

function requireLivingAgent(state, dmoId) {
  const dmo = requireDmo(state, dmoId);
  if (dmo.kind !== "autopoietic_agent") {
    throw new Error(`DMO is not an autopoietic agent: ${dmoId}`);
  }
  if (!dmo.metabolism) {
    throw new Error(`autopoietic agent has no metabolism: ${dmoId}`);
  }
  return dmo;
}

function requireDmo(state, dmoId) {
  const dmo = state.assets.get(dmoId);
  if (!dmo) throw new Error(`Unknown DMO: ${dmoId}`);
  return dmo;
}

function requireAgent(dmo) {
  if (dmo.kind !== "agent_identity") {
    throw new Error(`DMO is not an agent identity: ${dmo.id}`);
  }
  if (!dmo.agent) dmo.agent = normalizeAgent(null);
  return dmo.agent;
}

function normalizeAgent(agent) {
  if (!agent) {
    return {
      did_document: null,
      wallets: [],
      keys: [],
      permissions: [],
      behavior_scope: {},
      interaction_privacy: { default_level: "private_hash", redaction_allowed: true },
      wallet_history: [],
      key_history: [],
      policy_history: []
    };
  }
  return {
    ...agent,
    did_document: agent.did_document || null,
    wallets: agent.wallets ? agent.wallets.slice() : [],
    keys: agent.keys ? agent.keys.slice() : [],
    permissions: agent.permissions ? agent.permissions.slice() : [],
    behavior_scope: agent.behavior_scope || {},
    interaction_privacy: agent.interaction_privacy || { default_level: "private_hash", redaction_allowed: true },
    wallet_history: agent.wallet_history ? agent.wallet_history.slice() : [],
    key_history: agent.key_history ? agent.key_history.slice() : [],
    policy_history: agent.policy_history ? agent.policy_history.slice() : []
  };
}

function upsertById(items, nextItem) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    items.push(nextItem);
  } else {
    items[index] = {
      ...items[index],
      ...nextItem
    };
  }
}

function normalizeTrust(input) {
  const trust = {};
  for (const dimension of TRUST_DIMENSIONS) {
    trust[dimension] = clampTrust(input[dimension] || 0);
  }
  return trust;
}

function applyTrustDelta(current, delta) {
  const next = { ...current };
  for (const dimension of TRUST_DIMENSIONS) {
    next[dimension] = clampTrust((next[dimension] || 0) + (delta[dimension] || 0));
  }
  return next;
}

function clampTrust(value) {
  return Math.max(0, Math.min(100, Number(value)));
}

function versionedMetadata(metadata, eventRef, reason = undefined) {
  return {
    ...metadata,
    event_id: eventRef.event_id,
    timestamp: eventRef.timestamp,
    reason
  };
}

function historyEntry(eventRef) {
  return {
    event_id: eventRef.event_id,
    op: eventRef.op,
    timestamp: eventRef.timestamp,
    event_hash: eventRef.event_hash
  };
}

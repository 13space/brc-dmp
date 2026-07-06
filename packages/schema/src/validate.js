import {
  AGENT_BEHAVIOR_BOUNDS,
  AGENT_PERMISSION_SCOPES,
  ASSET_KINDS,
  CAUSAL_TAGS,
  CONSTRAINT_RELATIONS,
  ENERGY_FLOWS,
  INTERACTION_CHANNELS,
  MUTATION_OPERATORS,
  OPERATIONS,
  PARTY_TYPES,
  PRIVACY_LEVELS,
  SIGNATURE_SCHEMES,
  SUPPORTED_PROTOCOLS,
  SUPPORTED_VERSIONS,
  TRUST_DIMENSIONS
} from "./constants.js";

const HEX_64 = /^[a-f0-9]{64}$/i;
const HASH_REF = /^sha256:[a-f0-9]{64}$/;
const DMO_ID = /^dmo:[a-z0-9][a-z0-9:_-]{2,127}$/;
const EVENT_ID = /^evt:[a-z0-9][a-z0-9:_-]{2,127}$/;
const INTERACTION_ID = /^ix:[a-z0-9][a-z0-9:_-]{2,127}$/;
const BUC = /^btc:[0-9]+:[a-f0-9]{64}:[0-9]+(:[0-9]+)?$/i;

export function validateEvent(event) {
  const issues = [];

  if (!isPlainObject(event)) {
    return { valid: false, issues: ["event must be an object"] };
  }

  requireFields(event, ["p", "v", "op", "event_id", "dmo_id", "buc", "source", "actor", "timestamp"], issues);

  if (!SUPPORTED_PROTOCOLS.includes(event.p)) issues.push(`p must be one of ${SUPPORTED_PROTOCOLS.join(", ")}`);
  if (!SUPPORTED_VERSIONS.includes(event.v)) issues.push(`v must be one of ${SUPPORTED_VERSIONS.join(", ")}`);
  if (!OPERATIONS.includes(event.op)) issues.push(`op is not supported: ${event.op}`);
  if (typeof event.event_id !== "string" || !EVENT_ID.test(event.event_id)) issues.push("event_id must match evt:<id>");
  if (typeof event.dmo_id !== "string" || !DMO_ID.test(event.dmo_id)) issues.push("dmo_id must match dmo:<id>");
  if (typeof event.buc !== "string" || !BUC.test(event.buc)) issues.push("buc must match btc:<block>:<txid>:<vout>[:sat]");
  if (Number.isNaN(Date.parse(event.timestamp))) issues.push("timestamp must be an ISO date-time");

  // Optional life-cycle envelope fields (brc-life v1.0).
  if (event.tick !== undefined && (!Number.isInteger(event.tick) || event.tick < 0)) issues.push("tick must be a non-negative integer");
  if (event.energy_cost !== undefined && (typeof event.energy_cost !== "number" || event.energy_cost < 0)) issues.push("energy_cost must be a non-negative number");
  if (event.causal_tag !== undefined && !CAUSAL_TAGS.includes(event.causal_tag)) issues.push(`causal_tag must be one of ${CAUSAL_TAGS.join(", ")}`);

  validateSource(event.source, "source", issues);
  validateParty(event.actor, "actor", issues);

  switch (event.op) {
    case "create":
      validateCreate(event, issues);
      break;
    case "transfer":
      validateTransfer(event, issues);
      break;
    case "update_metadata":
      validateUpdateMetadata(event, issues);
      break;
    case "attest_trust":
      validateAttestTrust(event, issues);
      break;
    case "fractionalize":
      validateFractionalize(event, issues);
      break;
    case "anchor_state":
      validateAnchorState(event, issues);
      break;
    case "record_interaction":
      validateRecordInteraction(event, issues);
      break;
    case "bind_wallet":
      validateBindWallet(event, issues);
      break;
    case "rotate_key":
      validateRotateKey(event, issues);
      break;
    case "set_agent_policy":
      validateSetAgentPolicy(event, issues);
      break;
    case "bind_membrane":
      validateBindMembrane(event, issues);
      break;
    case "metabolize":
      validateMetabolize(event, issues);
      break;
    case "sense":
      validateSense(event, issues);
      break;
    case "act":
      validateAct(event, issues);
      break;
    case "form_constraint":
      validateFormConstraint(event, issues);
      break;
    case "spawn":
      validateSpawn(event, issues);
      break;
    case "mutate":
      validateMutate(event, issues);
      break;
    case "apoptose":
      validateApoptose(event, issues);
      break;
    default:
      break;
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidEvent(event) {
  const result = validateEvent(event);
  if (!result.valid) {
    const id = event && typeof event === "object" ? event.event_id || "<unknown>" : "<non-object>";
    throw new Error(`Invalid BRC-DMP event ${id}: ${result.issues.join("; ")}`);
  }
  return event;
}

function validateCreate(event, issues) {
  requireFields(event, ["kind", "subject", "owner", "metadata"], issues);
  if (!ASSET_KINDS.includes(event.kind)) issues.push(`kind is not supported: ${event.kind}`);
  validateSubject(event.subject, "subject", issues);
  validateParty(event.owner, "owner", issues);
  validateMetadata(event.metadata, "metadata", issues);

  if (event.proofs !== undefined) validateProofs(event.proofs, "proofs", issues);
  if (event.trust !== undefined) validateTrustVector(event.trust, "trust", issues, { delta: false });

  if (event.kind === "agent_identity" && event.agent !== undefined) {
    validateAgentProfile(event.agent, "agent", issues);
  }

  // brc-life v1.0: a living object (autopoietic_agent) carries optional life fields.
  if (event.agent !== undefined && event.kind === "autopoietic_agent") {
    validateAgentProfile(event.agent, "agent", issues);
  }
  if (event.genome !== undefined) validateGenome(event.genome, "genome", issues);
  if (event.membrane !== undefined) validateMembrane(event.membrane, "membrane", issues);
  if (event.metabolism !== undefined) validateMetabolismInit(event.metabolism, "metabolism", issues);
  if (event.cognition !== undefined) validateCognition(event.cognition, "cognition", issues);

  // An autopoietic_agent must declare a genome (the (M,R) triad) and a metabolism
  // (an energy budget) to be a candidate for life.
  if (event.kind === "autopoietic_agent") {
    if (event.genome === undefined) issues.push("autopoietic_agent create must include a genome");
    if (event.metabolism === undefined) issues.push("autopoietic_agent create must include metabolism");
  }
}

function validateTransfer(event, issues) {
  requireFields(event, ["to_owner"], issues);
  validateParty(event.to_owner, "to_owner", issues);
}

function validateUpdateMetadata(event, issues) {
  requireFields(event, ["metadata"], issues);
  validateMetadata(event.metadata, "metadata", issues);
}

function validateAttestTrust(event, issues) {
  requireFields(event, ["attestation"], issues);
  validateProof(event.attestation, "attestation", issues);
  if (event.trust_delta !== undefined) validateTrustVector(event.trust_delta, "trust_delta", issues, { delta: true });
}

function validateFractionalize(event, issues) {
  requireFields(event, ["fraction"], issues);
  const fraction = event.fraction;
  if (!isPlainObject(fraction)) {
    issues.push("fraction must be an object");
    return;
  }
  requireFields(fraction, ["fraction_id", "total_supply", "unit", "protocol_layer"], issues, "fraction");
  if (typeof fraction.fraction_id !== "string" || fraction.fraction_id.length < 3) issues.push("fraction.fraction_id must be a string");
  if (!Number.isInteger(fraction.total_supply) || fraction.total_supply < 1) issues.push("fraction.total_supply must be a positive integer");
  if (typeof fraction.unit !== "string" || fraction.unit.length < 1) issues.push("fraction.unit must be a string");
  if (!["indexed_statement", "runes", "rgbpp", "ckb"].includes(fraction.protocol_layer)) {
    issues.push("fraction.protocol_layer is not supported");
  }
  if (fraction.rights !== undefined && !Array.isArray(fraction.rights)) issues.push("fraction.rights must be an array");
}

function validateAnchorState(event, issues) {
  requireFields(event, ["anchor"], issues);
  const anchor = event.anchor;
  if (!isPlainObject(anchor)) {
    issues.push("anchor must be an object");
    return;
  }
  requireFields(anchor, ["layer", "state_root"], issues, "anchor");
  if (!["indexer", "rgbpp", "ckb", "ipfs", "arweave"].includes(anchor.layer)) issues.push("anchor.layer is not supported");
  if (!isHashRef(anchor.state_root)) issues.push("anchor.state_root must be a sha256 hash ref");
  if (anchor.height !== undefined && (!Number.isInteger(anchor.height) || anchor.height < 0)) issues.push("anchor.height must be a non-negative integer");
}

function validateRecordInteraction(event, issues) {
  requireFields(event, ["interaction"], issues);
  validateInteraction(event.interaction, "interaction", issues);
}

function validateBindWallet(event, issues) {
  requireFields(event, ["wallet_binding"], issues);
  validateWalletBinding(event.wallet_binding, "wallet_binding", issues);
  if (event.signature_proof !== undefined) {
    validateSignatureProof(event.signature_proof, "signature_proof", issues);
  }
  if (event.wallet_binding.signature_proof !== undefined) {
    validateSignatureProof(event.wallet_binding.signature_proof, "wallet_binding.signature_proof", issues);
  }
}

function validateRotateKey(event, issues) {
  requireFields(event, ["key_rotation"], issues);
  const rotation = event.key_rotation;
  if (!isPlainObject(rotation)) {
    issues.push("key_rotation must be an object");
    return;
  }
  requireFields(rotation, ["new_key", "reason"], issues, "key_rotation");
  if (rotation.revoked_key_id !== undefined && typeof rotation.revoked_key_id !== "string") {
    issues.push("key_rotation.revoked_key_id must be a string");
  }
  validateVerificationMethod(rotation.new_key, "key_rotation.new_key", issues);
  if (typeof rotation.reason !== "string" || rotation.reason.length < 1) issues.push("key_rotation.reason must be a string");
  if (rotation.proof_hash !== undefined && !isHashRef(rotation.proof_hash)) issues.push("key_rotation.proof_hash must be a sha256 hash ref");
  if (rotation.signature_proof !== undefined) {
    validateSignatureProof(rotation.signature_proof, "key_rotation.signature_proof", issues);
  }
}

function validateSetAgentPolicy(event, issues) {
  requireFields(event, ["agent_policy"], issues);
  validateAgentPolicy(event.agent_policy, "agent_policy", issues);
}

// ---------------------------------------------------------------------------
// brc-life v1.0 lifecycle operations
// ---------------------------------------------------------------------------

function validateBindMembrane(event, issues) {
  requireFields(event, ["membrane"], issues);
  validateMembrane(event.membrane, "membrane", issues);
}

function validateMetabolize(event, issues) {
  requireFields(event, ["energy"], issues);
  const energy = event.energy;
  if (!isPlainObject(energy)) {
    issues.push("energy must be an object");
    return;
  }
  requireFields(energy, ["flow", "amount"], issues, "energy");
  if (!ENERGY_FLOWS.includes(energy.flow)) issues.push(`energy.flow is not supported: ${energy.flow}`);
  if (typeof energy.amount !== "number" || energy.amount < 0) issues.push("energy.amount must be a non-negative number");
  // Intake must be backed by a fee/work proof so energy cannot be conjured.
  if (energy.flow === "intake" && energy.proof_hash !== undefined && !isHashRef(energy.proof_hash)) {
    issues.push("energy.proof_hash must be a sha256 hash ref");
  }
  if (energy.note !== undefined && typeof energy.note !== "string") issues.push("energy.note must be a string");
}

function validateSense(event, issues) {
  requireFields(event, ["observation"], issues);
  const observation = event.observation;
  if (!isPlainObject(observation)) {
    issues.push("observation must be an object");
    return;
  }
  requireFields(observation, ["channel", "summary"], issues, "observation");
  if (!INTERACTION_CHANNELS.includes(observation.channel)) issues.push("observation.channel is not supported");
  if (typeof observation.summary !== "string" || observation.summary.length < 1) issues.push("observation.summary must be a string");
  if (observation.state_hash !== undefined && !isHashRef(observation.state_hash)) issues.push("observation.state_hash must be a sha256 hash ref");
  if (observation.niche !== undefined && (typeof observation.niche !== "string" || !DMO_ID.test(observation.niche))) {
    issues.push("observation.niche must be a dmo:<id>");
  }
}

function validateAct(event, issues) {
  requireFields(event, ["action", "energy_cost"], issues);
  if (typeof event.energy_cost !== "number" || event.energy_cost <= 0) issues.push("act.energy_cost must be a positive number");
  const action = event.action;
  if (!isPlainObject(action)) {
    issues.push("action must be an object");
    return;
  }
  requireFields(action, ["kind", "summary"], issues, "action");
  if (typeof action.kind !== "string" || action.kind.length < 1) issues.push("action.kind must be a string");
  if (typeof action.summary !== "string" || action.summary.length < 1) issues.push("action.summary must be a string");
  if (action.target !== undefined && (typeof action.target !== "string" || action.target.length < 3)) issues.push("action.target must be a string");
  if (action.proof_hash !== undefined && !isHashRef(action.proof_hash)) issues.push("action.proof_hash must be a sha256 hash ref");
}

function validateFormConstraint(event, issues) {
  requireFields(event, ["constraint"], issues);
  const constraint = event.constraint;
  if (!isPlainObject(constraint)) {
    issues.push("constraint must be an object");
    return;
  }
  requireFields(constraint, ["constraint_id", "relation", "from", "to"], issues, "constraint");
  if (typeof constraint.constraint_id !== "string" || constraint.constraint_id.length < 3) issues.push("constraint.constraint_id must be a string");
  if (!CONSTRAINT_RELATIONS.includes(constraint.relation)) issues.push(`constraint.relation is not supported: ${constraint.relation}`);
  if (typeof constraint.from !== "string" || constraint.from.length < 1) issues.push("constraint.from must be a string");
  if (typeof constraint.to !== "string" || constraint.to.length < 1) issues.push("constraint.to must be a string");
}

function validateSpawn(event, issues) {
  requireFields(event, ["child"], issues);
  const child = event.child;
  if (!isPlainObject(child)) {
    issues.push("child must be an object");
    return;
  }
  requireFields(child, ["dmo_id", "buc", "energy_endowment"], issues, "child");
  if (typeof child.dmo_id !== "string" || !DMO_ID.test(child.dmo_id)) issues.push("child.dmo_id must match dmo:<id>");
  if (typeof child.buc !== "string" || !BUC.test(child.buc)) issues.push("child.buc must match btc:<block>:<txid>:<vout>[:sat]");
  if (typeof child.energy_endowment !== "number" || child.energy_endowment <= 0) issues.push("child.energy_endowment must be a positive number");
  if (child.genome !== undefined) validateGenome(child.genome, "child.genome", issues);
  if (child.mutation !== undefined) validateMutationSpec(child.mutation, "child.mutation", issues);
}

function validateMutate(event, issues) {
  requireFields(event, ["mutation"], issues);
  validateMutationSpec(event.mutation, "mutation", issues);
}

function validateApoptose(event, issues) {
  requireFields(event, ["death"], issues);
  const death = event.death;
  if (!isPlainObject(death)) {
    issues.push("death must be an object");
    return;
  }
  requireFields(death, ["reason"], issues, "death");
  if (typeof death.reason !== "string" || death.reason.length < 1) issues.push("death.reason must be a string");
  if (death.triggered_by !== undefined && !["world_engine", "owner", "governance"].includes(death.triggered_by)) {
    issues.push("death.triggered_by is not supported");
  }
}

// ---------------------------------------------------------------------------
// brc-life v1.0 life-field validators (shared by create / bind_membrane / spawn)
// ---------------------------------------------------------------------------

function validateGenome(genome, path, issues) {
  if (!isPlainObject(genome)) {
    issues.push(`${path} must be an object`);
    return;
  }
  // The (M,R) triad: Metabolism, Repair/replication, and the organization map phi
  // by which R itself is re-produced by the system (organizational closure).
  requireFields(genome, ["M", "R", "phi"], issues, path);
  for (const key of ["M", "R", "phi"]) {
    if (genome[key] !== undefined && (typeof genome[key] !== "string" || genome[key].length < 1)) {
      issues.push(`${path}.${key} must be a non-empty string (a rule reference)`);
    }
  }
  if (genome.inscription !== undefined && typeof genome.inscription !== "string") issues.push(`${path}.inscription must be a string`);
  if (genome.hash !== undefined && !isHashRef(genome.hash)) issues.push(`${path}.hash must be a sha256 hash ref`);
  if (genome.lineage !== undefined) validateLineage(genome.lineage, `${path}.lineage`, issues);
}

function validateLineage(lineage, path, issues) {
  if (!isPlainObject(lineage)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (lineage.parent !== undefined && lineage.parent !== null && (typeof lineage.parent !== "string" || !DMO_ID.test(lineage.parent))) {
    issues.push(`${path}.parent must be a dmo:<id> or null`);
  }
  if (lineage.generation !== undefined && (!Number.isInteger(lineage.generation) || lineage.generation < 0)) {
    issues.push(`${path}.generation must be a non-negative integer`);
  }
  if (lineage.mutation_log_hash !== undefined && !isHashRef(lineage.mutation_log_hash)) {
    issues.push(`${path}.mutation_log_hash must be a sha256 hash ref`);
  }
}

function validateMembrane(membrane, path, issues) {
  if (!isPlainObject(membrane)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(membrane, ["binding", "boundary_hash"], issues, path);
  if (typeof membrane.binding !== "string" || membrane.binding.length < 3) issues.push(`${path}.binding must be a string (utxo/cell ref)`);
  if (!isHashRef(membrane.boundary_hash)) issues.push(`${path}.boundary_hash must be a sha256 hash ref`);
  if (membrane.permeability !== undefined && !isPlainObject(membrane.permeability)) issues.push(`${path}.permeability must be an object`);
}

function validateMetabolismInit(metabolism, path, issues) {
  if (!isPlainObject(metabolism)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(metabolism, ["energy", "basal_cost_per_tick"], issues, path);
  if (typeof metabolism.energy !== "number" || metabolism.energy < 0) issues.push(`${path}.energy must be a non-negative number`);
  if (typeof metabolism.basal_cost_per_tick !== "number" || metabolism.basal_cost_per_tick < 0) issues.push(`${path}.basal_cost_per_tick must be a non-negative number`);
}

function validateCognition(cognition, path, issues) {
  if (!isPlainObject(cognition)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (cognition.beliefs_hash !== undefined && !isHashRef(cognition.beliefs_hash)) issues.push(`${path}.beliefs_hash must be a sha256 hash ref`);
  if (cognition.free_energy !== undefined && typeof cognition.free_energy !== "number") issues.push(`${path}.free_energy must be a number`);
  if (cognition.sensors !== undefined && !Array.isArray(cognition.sensors)) issues.push(`${path}.sensors must be an array`);
  if (cognition.actuators !== undefined && !Array.isArray(cognition.actuators)) issues.push(`${path}.actuators must be an array`);
}

function validateMutationSpec(mutation, path, issues) {
  if (!isPlainObject(mutation)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(mutation, ["operator", "target"], issues, path);
  if (!MUTATION_OPERATORS.includes(mutation.operator)) issues.push(`${path}.operator is not supported: ${mutation.operator}`);
  if (typeof mutation.target !== "string" || mutation.target.length < 1) issues.push(`${path}.target must be a string`);
  if (mutation.note !== undefined && typeof mutation.note !== "string") issues.push(`${path}.note must be a string`);
}

function validateSource(source, path, issues) {
  if (!isPlainObject(source)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(source, ["chain", "block", "txid", "vout"], issues, path);
  if (!["bitcoin", "ckb", "rgbpp", "fixture"].includes(source.chain)) issues.push(`${path}.chain is not supported`);
  if (!Number.isInteger(source.block) || source.block < 0) issues.push(`${path}.block must be a non-negative integer`);
  if (typeof source.txid !== "string" || !HEX_64.test(source.txid)) issues.push(`${path}.txid must be 64 hex chars`);
  if (!Number.isInteger(source.vout) || source.vout < 0) issues.push(`${path}.vout must be a non-negative integer`);
}

function validateParty(party, path, issues) {
  if (!isPlainObject(party)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(party, ["type", "id"], issues, path);
  if (!PARTY_TYPES.includes(party.type)) issues.push(`${path}.type is not supported`);
  if (typeof party.id !== "string" || party.id.length < 3) issues.push(`${path}.id must be at least 3 chars`);
}

function validateSubject(subject, path, issues) {
  if (!isPlainObject(subject)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(subject, ["title", "category"], issues, path);
  if (typeof subject.title !== "string" || subject.title.length < 1) issues.push(`${path}.title must be a string`);
  if (typeof subject.category !== "string" || subject.category.length < 1) issues.push(`${path}.category must be a string`);
}

function validateMetadata(metadata, path, issues) {
  if (!isPlainObject(metadata)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(metadata, ["uri", "hash"], issues, path);
  if (typeof metadata.uri !== "string" || metadata.uri.length < 1) issues.push(`${path}.uri must be a string`);
  if (!isHashRef(metadata.hash)) issues.push(`${path}.hash must be a sha256 hash ref`);
}

function validateProofs(proofs, path, issues) {
  if (!Array.isArray(proofs)) {
    issues.push(`${path} must be an array`);
    return;
  }
  proofs.forEach((proof, index) => validateProof(proof, `${path}[${index}]`, issues));
}

function validateProof(proof, path, issues) {
  if (!isPlainObject(proof)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(proof, ["type", "issuer", "hash"], issues, path);
  if (typeof proof.type !== "string" || proof.type.length < 1) issues.push(`${path}.type must be a string`);
  if (typeof proof.issuer !== "string" || proof.issuer.length < 3) issues.push(`${path}.issuer must be a string`);
  if (!isHashRef(proof.hash)) issues.push(`${path}.hash must be a sha256 hash ref`);
}

function validateInteraction(interaction, path, issues) {
  if (!isPlainObject(interaction)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(interaction, ["interaction_id", "channel", "participants", "summary", "occurred_at", "proof_hash"], issues, path);
  if (typeof interaction.interaction_id !== "string" || !INTERACTION_ID.test(interaction.interaction_id)) {
    issues.push(`${path}.interaction_id must match ix:<id>`);
  }
  if (!INTERACTION_CHANNELS.includes(interaction.channel)) issues.push(`${path}.channel is not supported`);
  if (!Array.isArray(interaction.participants) || interaction.participants.length < 2) {
    issues.push(`${path}.participants must have at least two parties`);
  } else {
    interaction.participants.forEach((party, index) => validateParty(party, `${path}.participants[${index}]`, issues));
  }
  if (typeof interaction.summary !== "string" || interaction.summary.length < 1) issues.push(`${path}.summary must be a string`);
  if (Number.isNaN(Date.parse(interaction.occurred_at))) issues.push(`${path}.occurred_at must be an ISO date-time`);
  if (interaction.privacy !== undefined) validatePrivacy(interaction.privacy, `${path}.privacy`, issues);
  for (const key of ["input_hash", "output_hash", "transcript_hash", "tool_trace_hash", "proof_hash"]) {
    if (interaction[key] !== undefined && !isHashRef(interaction[key])) issues.push(`${path}.${key} must be a sha256 hash ref`);
  }
  if (interaction.related_assets !== undefined && !Array.isArray(interaction.related_assets)) {
    issues.push(`${path}.related_assets must be an array`);
  }
}

function validateTrustVector(vector, path, issues, options) {
  if (!isPlainObject(vector)) {
    issues.push(`${path} must be an object`);
    return;
  }
  const min = options.delta ? -100 : 0;
  for (const [dimension, value] of Object.entries(vector)) {
    if (!TRUST_DIMENSIONS.includes(dimension)) {
      issues.push(`${path}.${dimension} is not a trust dimension`);
      continue;
    }
    if (typeof value !== "number" || value < min || value > 100) {
      issues.push(`${path}.${dimension} must be a number between ${min} and 100`);
    }
  }
}

function validateAgentProfile(agent, path, issues) {
  if (!isPlainObject(agent)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (agent.wallets !== undefined && !Array.isArray(agent.wallets)) issues.push(`${path}.wallets must be an array`);
  if (Array.isArray(agent.wallets)) {
    agent.wallets.forEach((wallet, index) => validateWalletBinding(wallet, `${path}.wallets[${index}]`, issues));
  }
  if (agent.did_document !== undefined) validateDidDocument(agent.did_document, `${path}.did_document`, issues);
  if (agent.keys !== undefined) {
    if (!Array.isArray(agent.keys)) {
      issues.push(`${path}.keys must be an array`);
    } else {
      agent.keys.forEach((key, index) => validateVerificationMethod(key, `${path}.keys[${index}]`, issues));
    }
  }
  if (agent.permissions !== undefined) validatePermissions(agent.permissions, `${path}.permissions`, issues);
  if (agent.behavior_scope !== undefined) validateBehaviorScope(agent.behavior_scope, `${path}.behavior_scope`, issues);
  if (agent.interaction_privacy !== undefined) validatePrivacyPolicy(agent.interaction_privacy, `${path}.interaction_privacy`, issues);
}

function validateDidDocument(document, path, issues) {
  if (!isPlainObject(document)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(document, ["id", "verificationMethod", "authentication", "assertionMethod"], issues, path);
  if (typeof document.id !== "string" || !document.id.startsWith("did:")) issues.push(`${path}.id must be a DID`);
  if (!Array.isArray(document.verificationMethod)) {
    issues.push(`${path}.verificationMethod must be an array`);
  } else {
    document.verificationMethod.forEach((method, index) => validateVerificationMethod(method, `${path}.verificationMethod[${index}]`, issues));
  }
  if (!Array.isArray(document.authentication)) issues.push(`${path}.authentication must be an array`);
  if (!Array.isArray(document.assertionMethod)) issues.push(`${path}.assertionMethod must be an array`);
  if (document.service !== undefined && !Array.isArray(document.service)) issues.push(`${path}.service must be an array`);
}

function validateVerificationMethod(method, path, issues) {
  if (!isPlainObject(method)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(method, ["id", "type", "controller"], issues, path);
  if (typeof method.id !== "string" || method.id.length < 3) issues.push(`${path}.id must be a string`);
  if (typeof method.type !== "string" || method.type.length < 3) issues.push(`${path}.type must be a string`);
  if (typeof method.controller !== "string" || method.controller.length < 3) issues.push(`${path}.controller must be a string`);
  if (
    method.publicKeyMultibase === undefined &&
    method.publicKeyHex === undefined &&
    method.blockchainAccountId === undefined
  ) {
    issues.push(`${path} must include publicKeyMultibase, publicKeyHex, or blockchainAccountId`);
  }
  if (method.status !== undefined && !["active", "revoked", "rotated"].includes(method.status)) {
    issues.push(`${path}.status is not supported`);
  }
}

function validateWalletBinding(binding, path, issues) {
  if (!isPlainObject(binding)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(binding, ["type", "id", "address", "purpose", "proof_hash"], issues, path);
  validateParty(binding, path, issues);
  if (typeof binding.address !== "string" || binding.address.length < 8) issues.push(`${path}.address must be a string`);
  if (!["control", "treasury", "fees", "attestation", "recovery"].includes(binding.purpose)) {
    issues.push(`${path}.purpose is not supported`);
  }
  if (!isHashRef(binding.proof_hash)) issues.push(`${path}.proof_hash must be a sha256 hash ref`);
  if (binding.bound_at !== undefined && Number.isNaN(Date.parse(binding.bound_at))) issues.push(`${path}.bound_at must be an ISO date-time`);
  if (binding.status !== undefined && !["active", "revoked", "rotated"].includes(binding.status)) {
    issues.push(`${path}.status is not supported`);
  }
  if (binding.signature_proof !== undefined) {
    validateSignatureProof(binding.signature_proof, `${path}.signature_proof`, issues);
  }
}

function validateSignatureProof(proof, path, issues) {
  if (!isPlainObject(proof)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(proof, ["scheme", "signature", "public_key"], issues, path);
  if (!SIGNATURE_SCHEMES.includes(proof.scheme)) issues.push(`${path}.scheme is not supported`);
  if (proof.scheme === "bip322-simple") {
    if (typeof proof.signature !== "string" || proof.signature.length < 8) {
      issues.push(`${path}.signature must be a BIP-322 base64 string`);
    }
  } else if (typeof proof.signature !== "string" || proof.signature.length < 16) {
    issues.push(`${path}.signature must be hex`);
  }
  if (typeof proof.public_key !== "string" || proof.public_key.length < 64) issues.push(`${path}.public_key must be hex`);
  if (proof.message !== undefined && typeof proof.message !== "string") issues.push(`${path}.message must be a string`);
}

function validateAgentPolicy(policy, path, issues) {
  if (!isPlainObject(policy)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (policy.permissions !== undefined) validatePermissions(policy.permissions, `${path}.permissions`, issues);
  if (policy.behavior_scope !== undefined) validateBehaviorScope(policy.behavior_scope, `${path}.behavior_scope`, issues);
  if (policy.interaction_privacy !== undefined) validatePrivacyPolicy(policy.interaction_privacy, `${path}.interaction_privacy`, issues);
}

function validatePermissions(permissions, path, issues) {
  if (!Array.isArray(permissions)) {
    issues.push(`${path} must be an array`);
    return;
  }
  permissions.forEach((permission, index) => {
    if (!isPlainObject(permission)) {
      issues.push(`${path}[${index}] must be an object`);
      return;
    }
    requireFields(permission, ["scope", "granted_by", "proof_hash"], issues, `${path}[${index}]`);
    if (!AGENT_PERMISSION_SCOPES.includes(permission.scope)) issues.push(`${path}[${index}].scope is not supported`);
    if (typeof permission.granted_by !== "string" || permission.granted_by.length < 3) issues.push(`${path}[${index}].granted_by must be a string`);
    if (!isHashRef(permission.proof_hash)) issues.push(`${path}[${index}].proof_hash must be a sha256 hash ref`);
  });
}

function validateBehaviorScope(scope, path, issues) {
  if (!isPlainObject(scope)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (scope.allowed_actions !== undefined) {
    if (!Array.isArray(scope.allowed_actions)) {
      issues.push(`${path}.allowed_actions must be an array`);
    } else {
      for (const action of scope.allowed_actions) {
        if (!AGENT_PERMISSION_SCOPES.includes(action)) issues.push(`${path}.allowed_actions includes unsupported action: ${action}`);
      }
    }
  }
  if (scope.bounds !== undefined) {
    if (!Array.isArray(scope.bounds)) {
      issues.push(`${path}.bounds must be an array`);
    } else {
      for (const bound of scope.bounds) {
        if (!AGENT_BEHAVIOR_BOUNDS.includes(bound)) issues.push(`${path}.bounds includes unsupported bound: ${bound}`);
      }
    }
  }
  if (scope.max_daily_writes !== undefined && (!Number.isInteger(scope.max_daily_writes) || scope.max_daily_writes < 0)) {
    issues.push(`${path}.max_daily_writes must be a non-negative integer`);
  }
}

function validatePrivacyPolicy(policy, path, issues) {
  if (!isPlainObject(policy)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (policy.default_level !== undefined && !PRIVACY_LEVELS.includes(policy.default_level)) {
    issues.push(`${path}.default_level is not supported`);
  }
  if (policy.retention !== undefined && typeof policy.retention !== "string") issues.push(`${path}.retention must be a string`);
  if (policy.redaction_allowed !== undefined && typeof policy.redaction_allowed !== "boolean") {
    issues.push(`${path}.redaction_allowed must be a boolean`);
  }
}

function validatePrivacy(privacy, path, issues) {
  if (!isPlainObject(privacy)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireFields(privacy, ["level"], issues, path);
  if (!PRIVACY_LEVELS.includes(privacy.level)) issues.push(`${path}.level is not supported`);
  if (privacy.disclosure !== undefined && typeof privacy.disclosure !== "string") issues.push(`${path}.disclosure must be a string`);
  if (privacy.redaction_hash !== undefined && !isHashRef(privacy.redaction_hash)) {
    issues.push(`${path}.redaction_hash must be a sha256 hash ref`);
  }
}

function requireFields(object, fields, issues, path = "") {
  for (const field of fields) {
    if (object[field] === undefined) {
      issues.push(`${path ? `${path}.` : ""}${field} is required`);
    }
  }
}

function isHashRef(value) {
  return typeof value === "string" && HASH_REF.test(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

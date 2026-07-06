// Current/default protocol id and version emitted for new objects.
// brc-dmp v0.1 = the digital-matter asset protocol.
// brc-life v1.0 = the autopoietic ("life") upgrade (DMLP) layered on top.
export const PROTOCOL = "brc-life";
export const VERSION = "1.0";

// The indexer/validator accepts events from either generation so v0.1
// fixtures keep working unchanged inside a brc-life world.
export const SUPPORTED_PROTOCOLS = Object.freeze(["brc-dmp", "brc-life"]);
export const SUPPORTED_VERSIONS = Object.freeze(["0.1", "1.0"]);

export const ASSET_KINDS = Object.freeze([
  // --- brc-dmp v0.1 kinds (unchanged) ---
  "digital_matter",
  "ordinal_art",
  "rwa_art",
  "sft_fraction",
  "did_badge",
  "dao_position",
  "agent_identity",
  "interaction_proof",
  // --- brc-life v1.0 life kinds ---
  "autopoietic_agent", // a living digital-matter object (LDMO): genome + membrane + metabolism
  "constraint_edge", // one edge of a ConstraintNet (constraint -> flow / constraint -> constraint)
  "niche", // an environment patch agents forage energy from and reshape (niche construction)
  "species_genome" // a shared genotype template instantiated by many agents
]);

export const OPERATIONS = Object.freeze([
  // --- brc-dmp v0.1 operations (unchanged) ---
  "create",
  "transfer",
  "update_metadata",
  "attest_trust",
  "fractionalize",
  "anchor_state",
  "record_interaction",
  "bind_wallet",
  "rotate_key",
  "set_agent_policy",
  // --- brc-life v1.0 lifecycle operations ---
  "bind_membrane", // bind a UTXO/cell as the agent's self/non-self boundary (operational closure)
  "metabolize", // record an energy intake/spend ledger entry (energy-work closure, C1)
  "sense", // record a perception proof (FEP perception / do-observation)
  "act", // perform an energy-costed external action (FEP action), bounded by behavior_scope
  "form_constraint", // declare/update a constraint_edge in the agent's ConstraintNet
  "spawn", // produce a child agent (replicate genome, optional mutation) — von Neumann self-replication
  "mutate", // introduce a controlled genome variation (logged, auditable)
  "apoptose" // mark agent death (closure broken or energy exhausted)
]);

// Liveness verdict produced by the World Engine from CoC³.
export const CLOSURE_STATUS = Object.freeze(["closed", "critical_closed", "broken"]);

// Three-valued causal tag carried by interactions (ConstraintNet v1.3).
export const CAUSAL_TAGS = Object.freeze(["pos", "neg", "dark"]);

export const SIGNATURE_SCHEMES = Object.freeze(["schnorr-bip340", "ecdsa-legacy"]);

// Allowed metabolism ledger entry kinds.
export const ENERGY_FLOWS = Object.freeze(["intake", "spend", "basal", "transfer_in", "transfer_out", "reclaim"]);

// Whitelisted mutation operators (every mutation is logged for auditable evolution).
export const MUTATION_OPERATORS = Object.freeze(["param_perturb", "module_add", "module_remove", "recombine"]);

// Relation types for a constraint_edge in the ConstraintNet graph.
export const CONSTRAINT_RELATIONS = Object.freeze(["constrains_flow", "constrains_constraint", "produced_by"]);

export const TRUST_DIMENSIONS = Object.freeze([
  "authenticity",
  "provenance",
  "market",
  "curation",
  "community",
  "risk"
]);

export const PARTY_TYPES = Object.freeze([
  "bitcoin_address",
  "did",
  "agent_wallet",
  "ai_agent",
  "institution",
  "contract",
  "human"
]);

export const INTERACTION_CHANNELS = Object.freeze([
  "wallet",
  "agent",
  "dao",
  "market",
  "api",
  "physical"
]);

export const PRIVACY_LEVELS = Object.freeze([
  "public",
  "selective",
  "private_hash",
  "zk_commitment"
]);

export const AGENT_PERMISSION_SCOPES = Object.freeze([
  "read_public_state",
  "index_fixture_events",
  "index_bitcoin_events",
  "record_interaction_proofs",
  "propose_dao_actions",
  "submit_attestations",
  "request_wallet_signature",
  "manage_own_keys"
]);

export const AGENT_BEHAVIOR_BOUNDS = Object.freeze([
  "no_custody_without_multisig",
  "no_private_data_disclosure",
  "human_approval_required_for_transfer",
  "public_reasoning_summary_required",
  "rate_limited_writes",
  "fixture_only"
]);

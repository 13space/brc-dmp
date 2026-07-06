# BRC-DMP v0.1 Draft

Status: alpha draft.

Protocol id: `brc-dmp`

Version: `0.1`

## Object Model

A Digital Matter Object (DMO) is the indexed state produced by a sequence of BRC-DMP events.

Minimum DMO fields:

- `id`: stable protocol id, for example `dmo:the-one-rwa-001`.
- `buc`: Bitcoin Universe Coordinate, for example `btc:840000:<txid>:0:450`.
- `kind`: asset kind.
- `source`: Bitcoin-rooted origin metadata.
- `subject`: human-readable subject metadata.
- `owner`: current owner or controller.
- `metadata`: current metadata URI and hash.
- `proofs`: attestations, certificates, curation records, and interaction proofs.
- `trust`: multi-dimensional trust vector.
- `history`: ordered event references.

## Asset Kinds

v0.1 supports:

- `digital_matter`
- `ordinal_art`
- `rwa_art`
- `sft_fraction`
- `did_badge`
- `dao_position`
- `agent_identity`
- `interaction_proof`

`agent_identity` is the minimal AI Agent ID wallet carrier. It can bind wallet addresses, public keys, model/runtime descriptors, and controller attestations.

`interaction_proof` is a standalone proof object when an interaction should become its own DMO. Most interaction records can also be attached to an existing DMO through `record_interaction`.

## Operations

### create

Creates a DMO.

Required fields:

- common event fields
- `kind`
- `subject`
- `owner`
- `metadata`

### transfer

Moves ownership or control to `to_owner`.

### update_metadata

Updates metadata URI and hash while retaining previous versions in history.

### attest_trust

Appends an attestation and optional trust vector delta.

Trust dimensions:

- `authenticity`
- `provenance`
- `market`
- `curation`
- `community`
- `risk`

### fractionalize

Declares a fractionalization plan. In v0.1 this is an indexed statement. Execution belongs to a later RGB++ / CKB adapter.

### anchor_state

Anchors an external state root back into BRC-DMP history.

### record_interaction

Records a proof of interaction without exposing private content.

An interaction proof may include:

- participants
- channel
- summary
- input/output/transcript/tool-trace hashes
- proof URI and proof hash
- related DMO ids

This operation is the first bridge from asset registry to AI Agent memory, wallet accountability, and later artificial-life interaction history.

Interaction privacy levels:

- `public`: summary and proof references are public.
- `selective`: public commitment with disclosure to selected parties.
- `private_hash`: only commitments are indexed.
- `zk_commitment`: future zero-knowledge proof carrier.

### bind_wallet

Binds a wallet or account to an `agent_identity` DMO.

Required wallet binding fields:

- `type`
- `id`
- `address`
- `purpose`
- `proof_hash`

Allowed purposes: `control`, `treasury`, `fees`, `attestation`, `recovery`.

### rotate_key

Rotates an Agent verification method. The old key can be marked `rotated`; the new verification method becomes active for DID authentication or assertions.

### set_agent_policy

Updates Agent permissions, behavior scope, and interaction privacy policy.

The policy surface is explicit:

- permissions say what the Agent may do.
- behavior scope says what it must not do or when human approval is needed.
- privacy policy says how interaction records are disclosed.

## Agent Identity Wallet Model

An `agent_identity` DMO carries:

- DID Document.
- wallet bindings.
- verification methods and key history.
- permission claims.
- behavior scope.
- interaction privacy policy.

Minimum Agent DID fields:

```json
{
  "id": "did:brc-dmp:plutus-indexer-agent-001",
  "verificationMethod": [
    {
      "id": "did:brc-dmp:plutus-indexer-agent-001#key-1",
      "type": "Multikey",
      "controller": "did:brc-dmp:plutus-indexer-agent-001",
      "publicKeyMultibase": "z..."
    }
  ],
  "authentication": ["did:brc-dmp:plutus-indexer-agent-001#key-1"],
  "assertionMethod": ["did:brc-dmp:plutus-indexer-agent-001#key-1"]
}
```

v0.1 Agent behavior bounds:

- `no_custody_without_multisig`
- `no_private_data_disclosure`
- `human_approval_required_for_transfer`
- `public_reasoning_summary_required`
- `rate_limited_writes`
- `fixture_only`

## Hashing Rule

All protocol object hashes use canonical JSON:

1. Recursively sort object keys by Unicode code point.
2. Keep array order unchanged.
3. Serialize primitive values with JSON encoding.
4. SHA-256 the canonical string.
5. Encode as `sha256:<64 lowercase hex>`.

## v0.1 Non-Goals

- No arbitrary JS execution on Bitcoin L1.
- No live trading or custody system.
- No mainnet inscription writer.
- No claim that interaction records alone produce artificial life.
- No hard dependency on NAT, TAP, or any single external indexer.

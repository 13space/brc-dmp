import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { NETWORK } from "@scure/btc-signer";
import { Address } from "@scure/btc-signer/payment.js";
import { hash160 } from "@scure/btc-signer/utils.js";
import { hashObject } from "../../packages/schema/src/canonicalize.js";
import { messageForAgentEvent } from "./messages.js";
import { bitcoinMessageHash, SIGNATURE_SCHEMES } from "./sign.js";
import { verifyBip322Simple } from "./bip322.js";

export { SIGNATURE_SCHEMES };

function hexToBytes(hex) {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function messageBytes(message) {
  return new TextEncoder().encode(message);
}

function hashMatchesProof(proofHash, payload) {
  return proofHash === hashObject(payload);
}

export function verifySignatureProof(proof, { message, address, network = NETWORK } = {}) {
  if (!proof || typeof proof !== "object") {
    return { verified: false, reason: "missing_signature_proof" };
  }
  if (!SIGNATURE_SCHEMES.includes(proof.scheme)) {
    return { verified: false, reason: "unsupported_scheme" };
  }
  if (!proof.signature || !proof.public_key) {
    return { verified: false, reason: "missing_signature_or_public_key" };
  }
  const signedMessage = proof.message || message;
  if (!signedMessage) return { verified: false, reason: "missing_message" };

  if (proof.scheme === "bip322-simple") {
    if (!address) return { verified: false, reason: "missing_address", scheme: proof.scheme };
    return verifyBip322Simple(signedMessage, address, proof.signature, proof.public_key);
  }

  const signature = hexToBytes(proof.signature);
  const publicKey = hexToBytes(proof.public_key);

  if (proof.scheme === "schnorr-bip340") {
    const digest = sha256(messageBytes(signedMessage));
    const xOnly = publicKey.length === 33 ? publicKey.slice(1) : publicKey;
    const verified = schnorr.verify(signature, digest, xOnly);
    return verified
      ? { verified: true, scheme: proof.scheme }
      : { verified: false, reason: "schnorr_verification_failed", scheme: proof.scheme };
  }

  const digest = bitcoinMessageHash(signedMessage);
  const verified = secp256k1.verify(signature, digest, publicKey);
  if (!verified) {
    return { verified: false, reason: "ecdsa_verification_failed", scheme: proof.scheme };
  }

  if (address) {
    const decoded = Address(network).decode(address);
    if (decoded.type !== "wpkh") {
      return { verified: false, reason: "address_type_not_supported_for_ecdsa_legacy", scheme: proof.scheme };
    }
    const hash = hash160(publicKey);
    const matches = hash.every((byte, index) => byte === decoded.hash[index]);
    if (!matches) return { verified: false, reason: "public_key_does_not_match_address", scheme: proof.scheme };
  }

  return { verified: true, scheme: proof.scheme };
}

export function verifyAgentEvent(event) {
  const message = messageForAgentEvent(event);
  if (!message) return { verified: false, reason: "unsupported_agent_event" };

  const proof =
    event.signature_proof ||
    event.wallet_binding?.signature_proof ||
    event.key_rotation?.signature_proof;

  const address = event.wallet_binding?.address;
  const result = verifySignatureProof(proof, { message, address });
  if (!result.verified) return result;

  if (event.op === "bind_wallet") {
    const { signature_proof: _sig, proof_hash, ...bindingBody } = event.wallet_binding;
    if (!hashMatchesProof(proof_hash, bindingBody)) {
      return { verified: false, reason: "proof_hash_mismatch" };
    }
  }

  if (event.op === "rotate_key") {
    const rotation = event.key_rotation;
    if (rotation.proof_hash && !hashMatchesProof(rotation.proof_hash, rotation.new_key)) {
      return { verified: false, reason: "proof_hash_mismatch" };
    }
  }

  return { verified: true, scheme: result.scheme, event_id: event.event_id, op: event.op };
}

export function verifyAgentState(asset) {
  if (!asset || asset.kind !== "agent_identity") {
    return { verified: false, reason: "not_agent_identity" };
  }

  const checks = [];

  for (const entry of asset.agent?.wallet_history || []) {
    if (!entry.signature_proof) {
      checks.push({ event_id: entry.event_id, op: "bind_wallet", verified: false, reason: "no_signature_proof" });
      continue;
    }
    const event = {
      op: "bind_wallet",
      dmo_id: asset.id,
      event_id: entry.event_id,
      wallet_binding: entry
    };
    checks.push(verifyAgentEvent({ ...event, signature_proof: entry.signature_proof, wallet_binding: entry }));
  }

  for (const entry of asset.agent?.key_history || []) {
    if (!entry.signature_proof) {
      checks.push({ event_id: entry.event_id, op: "rotate_key", verified: false, reason: "no_signature_proof" });
      continue;
    }
    const event = {
      op: "rotate_key",
      dmo_id: asset.id,
      event_id: entry.event_id,
      key_rotation: {
        revoked_key_id: entry.revoked_key_id,
        reason: entry.reason,
        new_key: asset.agent.keys.find((key) => key.id === entry.new_key_id),
        proof_hash: entry.proof_hash,
        signature_proof: entry.signature_proof
      }
    };
    checks.push(verifyAgentEvent(event));
  }

  const verifiedCount = checks.filter((item) => item.verified).length;
  const signedCount = checks.filter((item) => item.reason !== "no_signature_proof").length;
  return {
    agent_id: asset.id,
    checks,
    verified_count: verifiedCount,
    signed_count: signedCount,
    all_signed_verified: signedCount > 0 && verifiedCount === signedCount
  };
}

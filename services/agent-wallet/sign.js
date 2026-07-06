import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { pubECDSA } from "@scure/btc-signer/utils.js";

export const SIGNATURE_SCHEMES = Object.freeze(["schnorr-bip340", "ecdsa-legacy"]);

function messageBytes(message) {
  return new TextEncoder().encode(message);
}

function bitcoinMessageHash(message) {
  const body = messageBytes(message);
  const prefix = new TextEncoder().encode(`\x18Bitcoin Signed Message:\n${body.length}`);
  const payload = new Uint8Array(prefix.length + body.length);
  payload.set(prefix, 0);
  payload.set(body, prefix.length);
  return sha256(sha256(payload));
}

export function signSchnorrBip340(message, privateKey) {
  const digest = sha256(messageBytes(message));
  const signature = schnorr.sign(digest, privateKey);
  const compressed = pubECDSA(privateKey);
  return {
    scheme: "schnorr-bip340",
    message,
    signature: bytesToHex(signature),
    public_key: bytesToHex(compressed.length === 33 ? compressed.slice(1) : compressed)
  };
}

export function signEcdsaLegacy(message, privateKey) {
  const digest = bitcoinMessageHash(message);
  const signature = secp256k1.sign(digest, privateKey);
  return {
    scheme: "ecdsa-legacy",
    message,
    signature: bytesToHex(signature),
    public_key: bytesToHex(pubECDSA(privateKey))
  };
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export { bitcoinMessageHash };

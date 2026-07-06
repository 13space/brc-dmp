import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Signer, Verifier, Address } = require("bip322-js");
const { ECPairFactory } = require("ecpair");
const ecc = require("@bitcoinerlab/secp256k1");

const ECPair = ECPairFactory(ecc);

function hexToBytes(hex) {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function networkForAddress(address) {
  const network = Address.getNetworkFromAddess(address);
  if (network?.bech32 === "tb") return "testnet";
  if (network?.bech32 === "bcrt") return "regtest";
  return "mainnet";
}

function normalizePrivateKey(privateKey) {
  if (typeof privateKey === "string") return hexToBytes(privateKey);
  if (privateKey instanceof Uint8Array) return privateKey;
  throw new Error("private key must be hex or bytes");
}

function privateKeyHexToWif(privateKey, address) {
  const keyBytes = normalizePrivateKey(privateKey);
  const bitcoin = require("bitcoinjs-lib");
  const networkName = networkForAddress(address);
  const network =
    networkName === "testnet"
      ? bitcoin.networks.testnet
      : networkName === "regtest"
        ? bitcoin.networks.regtest
        : bitcoin.networks.bitcoin;
  return ECPair.fromPrivateKey(Buffer.from(keyBytes), { network, compressed: true }).toWIF();
}

export function signBip322Simple(message, privateKey, address) {
  const wif = privateKeyHexToWif(privateKey, address);
  const signature = Signer.sign(wif, address, message);
  const publicKey = ECPair.fromWIF(wif).publicKey;
  return {
    scheme: "bip322-simple",
    message,
    signature,
    public_key: bytesToHex(publicKey)
  };
}

export function verifyBip322Simple(message, address, signatureBase64, publicKeyHex) {
  if (!address) return { verified: false, reason: "missing_address" };
  if (!signatureBase64) return { verified: false, reason: "missing_signature" };

  if (publicKeyHex) {
    const matches = Signer.checkPubKeyCorrespondToAddress(Buffer.from(hexToBytes(publicKeyHex)), address);
    if (!matches) return { verified: false, reason: "public_key_does_not_match_address" };
  }

  const verified = Verifier.verifySignature(address, message, signatureBase64, true);
  return verified
    ? { verified: true, scheme: "bip322-simple" }
    : { verified: false, reason: "bip322_verification_failed", scheme: "bip322-simple" };
}

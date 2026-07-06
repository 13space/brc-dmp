import { hashObject, sha256Hex } from "../../../packages/schema/src/canonicalize.js";

export const EVENT_MAGIC = "BRC1";
export const CONTENT_TYPE = "application/vnd.brc-dmp.event+json";
export const PAYLOAD_EVENT = 0x01;
export const PAYLOAD_EVENT_HASH = 0x02;

// Encode a protocol event for inscription storage or compact OP_RETURN use.
export function encodeEventPayload(event) {
  const json = JSON.stringify(event);
  return {
    content_type: CONTENT_TYPE,
    content: json,
    event_hash: hashObject(event),
    envelope_hex: bytesToHex(buildEnvelope(PAYLOAD_EVENT, new TextEncoder().encode(json)))
  };
}

// Decode an on-chain payload. Returns { kind: "event", event } or { kind: "hash", hash }.
export function decodeChainPayload(dataHex) {
  if (!dataHex) return null;
  const bytes = hexToBytes(dataHex);
  const envelope = parseEnvelope(bytes);
  if (!envelope) return null;

  if (envelope.type === PAYLOAD_EVENT) {
    const event = JSON.parse(new TextDecoder().decode(envelope.body));
    return { kind: "event", event, event_hash: hashObject(event) };
  }

  if (envelope.type === PAYLOAD_EVENT_HASH && envelope.body.length === 32) {
    return { kind: "hash", hash: `sha256:${bytesToHex(envelope.body)}` };
  }

  return null;
}

export function encodeEventHashPayload(event) {
  const hashHex = hashObject(event).slice(7);
  return {
    event_hash: hashObject(event),
    envelope_hex: bytesToHex(buildEnvelope(PAYLOAD_EVENT_HASH, hexToBytes(hashHex)))
  };
}

function buildEnvelope(type, body) {
  const magic = new TextEncoder().encode(EVENT_MAGIC);
  const header = new Uint8Array([magic[0], magic[1], magic[2], magic[3], 0x01, type]);
  const len = new Uint8Array([body.length & 0xff, (body.length >> 8) & 0xff]);
  const out = new Uint8Array(header.length + len.length + body.length);
  out.set(header, 0);
  out.set(len, header.length);
  out.set(body, header.length + len.length);
  return out;
}

function parseEnvelope(bytes) {
  const magic = new TextEncoder().encode(EVENT_MAGIC);
  if (bytes.length < 8) return null;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) return null;
  }
  if (bytes[4] !== 0x01) return null;
  const type = bytes[5];
  const bodyLen = bytes[6] + (bytes[7] << 8);
  const body = bytes.slice(8, 8 + bodyLen);
  if (body.length !== bodyLen) return null;
  return { type, body };
}

function hexToBytes(hex) {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export { sha256Hex };

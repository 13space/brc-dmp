import { CONTENT_TYPE, decodeChainPayload } from "./event-codec.js";

const ORD = new TextEncoder().encode("ord");
// Build a minimal ord-style inscription witness item for tests and offline scans.
export function encodeInscriptionWitness(contentType, content) {
  const typeBytes = new TextEncoder().encode(contentType);
  const bodyBytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const chunks = [
    Uint8Array.of(0x00), // OP_FALSE
    Uint8Array.of(0x63), // OP_IF
    pushBytes(ORD),
    Uint8Array.of(0x51), // OP_1
    pushBytes(typeBytes),
    Uint8Array.of(0x00), // OP_0
    pushBytes(bodyBytes),
    Uint8Array.of(0x68) // OP_ENDIF
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const script = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    script.set(chunk, offset);
    offset += chunk.length;
  }
  return bytesToHex(script);
}

export function parseInscriptionWitness(witnessHexItems) {
  if (!Array.isArray(witnessHexItems)) return null;
  for (const item of witnessHexItems) {
    const parsed = parseInscriptionScript(item);
    if (parsed) return parsed;
  }
  return null;
}

export function parseInscriptionScript(scriptHex) {
  if (!scriptHex) return null;
  const bytes = hexToBytes(scriptHex);

  for (let i = 0; i < bytes.length - 8; i += 1) {
    if (bytes[i] !== 0x00 || bytes[i + 1] !== 0x63) continue; // OP_FALSE OP_IF
    let cursor = i + 2;
    const markerRead = readPush(bytes, cursor);
    if (!markerRead || new TextDecoder().decode(markerRead.data) !== "ord") continue;
    cursor = markerRead.next;
    if (bytes[cursor] !== 0x51) continue; // OP_1 content-type tag
    cursor += 1;
    const typeRead = readPush(bytes, cursor);
    if (!typeRead) continue;
    cursor = typeRead.next;
    if (bytes[cursor] !== 0x00) continue; // OP_0 content body tag
    cursor += 1;
    const bodyRead = readPush(bytes, cursor);
    if (!bodyRead) continue;

    return {
      contentType: new TextDecoder().decode(typeRead.data),
      content: new TextDecoder().decode(bodyRead.data)
    };
  }

  return null;
}

export function decodeInscriptionEvent(witnessHexItems) {
  const inscription = parseInscriptionWitness(witnessHexItems);
  if (!inscription) return null;
  if (inscription.contentType !== CONTENT_TYPE) return null;
  const event = JSON.parse(inscription.content);
  return { kind: "event", event, content_type: inscription.contentType };
}

function readPush(bytes, start) {
  if (start >= bytes.length) return null;
  const opcode = bytes[start];
  let len;
  let next;
  if (opcode >= 0x01 && opcode <= 0x4b) {
    len = opcode;
    next = start + 1;
  } else if (opcode === 0x4c) {
    len = bytes[start + 1];
    next = start + 2;
  } else if (opcode === 0x4d) {
    len = bytes[start + 1] + (bytes[start + 2] << 8);
    next = start + 3;
  } else {
    return null;
  }
  const data = bytes.slice(next, next + len);
  if (data.length !== len) return null;
  return { data, next: next + len };
}

function pushBytes(data) {
  if (data.length <= 0x4b) {
    const out = new Uint8Array(data.length + 1);
    out[0] = data.length;
    out.set(data, 1);
    return out;
  }
  if (data.length <= 0xff) {
    const out = new Uint8Array(data.length + 2);
    out[0] = 0x4c;
    out[1] = data.length;
    out.set(data, 2);
    return out;
  }
  const out = new Uint8Array(data.length + 3);
  out[0] = 0x4d;
  out[1] = data.length & 0xff;
  out[2] = (data.length >> 8) & 0xff;
  out.set(data, 3);
  return out;
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

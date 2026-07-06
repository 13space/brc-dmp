// BRC-LIFE — Mode A: REAL Bitcoin backend (Esplora) for client-side validation.
// ---------------------------------------------------------------------------
// Same tiny interface as the mock (getSpend / isUnspent / tipHeight), but backed
// by a live Esplora API (Blockstream signet by default; mempool.space works too).
// Zero dependencies — uses Node's global fetch. `fetchImpl` is injectable so
// tests can run offline against captured real JSON (no network in the test suite).
//
// Seal model on real Bitcoin: a seal is a UTXO "txid:vout". A seal is "closed"
// by a Bitcoin transaction that spends it; by protocol convention that tx's
// output 0 is the continuation (next seal) and one OP_RETURN output carries the
// 32-byte commitment. So getSpend(seal) = follow the UTXO's spending tx.
const DEFAULT_BASE = "https://blockstream.info/signet/api";

export function createEsploraBitcoin(options = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs || 8000;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  async function get(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`esplora ${response.status} for ${path}`);
      const body = await response.text();
      try {
        return JSON.parse(body);
      } catch {
        return body.trim();
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    kind: "esplora",
    baseUrl,

    async tipHeight() {
      return Number(await get("/blocks/tip/height"));
    },

    async isUnspent(seal) {
      const [txid, vout] = splitSeal(seal);
      const outspend = await get(`/tx/${txid}/outspend/${vout}`);
      return !outspend.spent;
    },

    // Follow a seal (UTXO) to its spending transaction and read the commitment.
    async getSpend(seal) {
      const [txid, vout] = splitSeal(seal);
      const outspend = await get(`/tx/${txid}/outspend/${vout}`);
      if (!outspend.spent) return null;
      const spendTxid = outspend.txid;
      const tx = await get(`/tx/${spendTxid}`);
      const opReturn = (tx.vout || []).find((v) => v.scriptpubkey_type === "op_return");
      const data = opReturn ? parseOpReturn(opReturn.scriptpubkey) : null;
      return {
        spend_txid: spendTxid,
        next_seal: `${spendTxid}:0`, // continuation output (protocol convention)
        commitment: encodeCommitment(data),
        height: tx.status?.block_height ?? null,
        confirmed: Boolean(tx.status?.confirmed)
      };
    }
  };
}

function splitSeal(seal) {
  const idx = seal.lastIndexOf(":");
  return [seal.slice(0, idx), Number(seal.slice(idx + 1))];
}

// A 32-byte OP_RETURN push is our commitment; anything else is tagged `raw:` so
// it can never accidentally match a recomputed sha256 commitment.
function encodeCommitment(dataHex) {
  if (!dataHex) return null;
  return dataHex.length === 64 ? `sha256:${dataHex}` : `raw:${dataHex}`;
}

// Parse the pushed data out of an OP_RETURN scriptPubKey hex.
export function parseOpReturn(scriptHex) {
  if (!scriptHex || scriptHex.slice(0, 2).toLowerCase() !== "6a") return null;
  let i = 2;
  const op = parseInt(scriptHex.slice(i, i + 2), 16);
  i += 2;
  let len;
  if (op >= 0x01 && op <= 0x4b) {
    len = op;
  } else if (op === 0x4c) {
    len = parseInt(scriptHex.slice(i, i + 2), 16);
    i += 2;
  } else if (op === 0x4d) {
    len = parseInt(scriptHex.slice(i + 2, i + 4) + scriptHex.slice(i, i + 2), 16); // little-endian u16
    i += 4;
  } else {
    return null;
  }
  return scriptHex.slice(i, i + len * 2);
}

// Build the OP_RETURN scriptPubKey hex for a 32-byte commitment (for anchoring).
export function commitmentToOpReturnScript(commitment) {
  const hex = commitment.startsWith("sha256:") ? commitment.slice(7) : commitment;
  if (hex.length !== 64) throw new Error("commitment must be 32 bytes (64 hex)");
  return `6a20${hex}`; // OP_RETURN OP_PUSHBYTES_32 <32 bytes>
}

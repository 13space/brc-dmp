// BRC-LIFE — Mode A: a swappable Bitcoin backend for client-side validation.
// ---------------------------------------------------------------------------
// This is the ONLY thing the CSV adapter trusts — it stands in for Bitcoin
// itself. A real deployment replaces this mock with ord / Esplora /
// mempool.space: a "seal" is a real UTXO (txid:vout), spending it is a real
// Bitcoin transaction, and the commitment is carried in an OP_RETURN (or a
// Taproot tweak). The interface is intentionally tiny so the swap is mechanical:
//
//   genesisUtxo()            -> seal id            (allocate the first seal)
//   spend(seal, commitment)  -> { spend_txid, next_seal, commitment, height }
//   getSpend(seal)           -> spend record | null
//   isUnspent(seal)          -> boolean
//
// Single-use is enforced exactly as Bitcoin enforces it: a seal can be spent
// once. Spending it produces a continuation output (output 0) that becomes the
// next seal — so state transitions form one Bitcoin-ordered chain that cannot
// be forked without double-spending a UTXO (i.e. without attacking Bitcoin).
import { sha256Hex } from "../../../packages/schema/src/canonicalize.js";

export function createMockBitcoin() {
  let confirmedHeight = 0;
  let counter = 0;
  const unspent = new Set(); // seal ids that can still be spent
  const spends = new Map(); // seal id -> spend record

  function allocate(tag) {
    const txid = sha256Hex(`utxo:${tag}:${counter++}`);
    const seal = `${txid}:0`;
    unspent.add(seal);
    return seal;
  }

  return {
    kind: "mock-bitcoin",
    genesisUtxo() {
      return allocate("genesis");
    },
    // Spend a seal, anchoring `commitment`; the spend's output 0 is the next seal.
    spend(seal, commitment) {
      if (!unspent.has(seal)) {
        throw new Error(`single-use-seal violation: ${seal} is already spent or unknown`);
      }
      unspent.delete(seal);
      confirmedHeight += 1;
      const spendTxid = sha256Hex(`spend:${seal}:${confirmedHeight}`);
      const nextSeal = `${spendTxid}:0`;
      unspent.add(nextSeal); // continuation output
      const record = { spend_txid: spendTxid, next_seal: nextSeal, commitment, height: confirmedHeight, confirmed: true };
      spends.set(seal, record);
      return record;
    },
    getSpend(seal) {
      return spends.get(seal) || null;
    },
    isUnspent(seal) {
      return unspent.has(seal);
    },
    tipHeight() {
      return confirmedHeight;
    }
  };
}

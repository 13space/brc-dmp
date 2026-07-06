// BRC-LIFE — Mode A: Bitcoin client-side validation (CSV) demo.
//   node services/csv-adapter/src/cli.js
//
// Builds a Bitcoin-anchored alife "contract" from the life fixtures, then proves
// the security properties: a fresh validator recomputes the whole world from
// nothing but Bitcoin + off-chain data; two validators agree (no trusted
// indexer); tampering off-chain data is rejected; a forged history with no
// Bitcoin anchors is rejected; a seal cannot be double-spent.
import { loadEventsFromDirectory } from "../../indexer/src/state.js";
import { batchEvents, buildContract, createMockBitcoin, validateContract } from "./index.js";

const events = await loadEventsFromDirectory("fixtures/life");
const batches = batchEvents(events, 4);
const backend = createMockBitcoin();
const contract = buildContract(backend, batches);

console.log("\nBRC-LIFE — Mode A: Bitcoin Client-Side Validation (RGB-style)");
console.log("=".repeat(72));
console.log("State lives off-chain; Bitcoin holds only commitments via single-use seals.\n");

console.log("CONTRACT (each transition = a single-use-seal spend on Bitcoin):");
for (const t of contract.transitions) {
  console.log(
    `  T${t.height}  btc#${t.anchored_height} tx ${t.spend_txid.slice(0, 12)}…  commit ${t.commitment.slice(7, 19)}…  world: alive ${t.alive}/${t.population}`
  );
}
console.log(`  tip seal ${contract.tip_seal.slice(0, 16)}…`);

console.log("\n① CLIENT-SIDE VALIDATION (fresh node; trusts only Bitcoin + off-chain events):");
const v = await validateContract(backend, contract);
console.log(`   valid=${v.valid}  height=${v.height}  anchored@btc#${v.anchored_height}`);
console.log(`   recomputed world: population ${v.world.population}, alive ${v.world.alive}  ·  engine_root ${v.engine_root.slice(7, 19)}…`);

console.log("\n② NO TRUSTED INDEXER — two independent validators agree:");
const a = await validateContract(backend, contract);
const b = await validateContract(backend, contract);
console.log(`   agree on state_root + engine_root: ${a.state_root === b.state_root && a.engine_root === b.engine_root}`);

console.log("\n③ OFF-CHAIN TAMPER is rejected (any byte change breaks the Bitcoin commitment):");
const tampered = structuredClone(contract);
tampered.transitions[1].events[0].timestamp = "2099-01-01T00:00:00.000Z"; // tamper one field
const vt = await validateContract(backend, tampered);
console.log(`   tampered contract valid=${vt.valid}  reason=${vt.reason} @ T${vt.height}`);

console.log("\n④ FORGED HISTORY with no Bitcoin anchors is rejected (security = Bitcoin):");
const freshChain = createMockBitcoin(); // a validator pointed at a Bitcoin with none of these spends
const vf = await validateContract(freshChain, contract);
console.log(`   forged contract valid=${vf.valid}  reason=${vf.reason} @ T${vf.height}`);

console.log("\n⑤ DOUBLE-SPEND of a seal is impossible (single-use seal = Bitcoin's job):");
let doubleSpendRejected = false;
try {
  backend.spend(contract.genesis_seal, "sha256:" + "1".repeat(64));
} catch (error) {
  doubleSpendRejected = true;
  console.log(`   rejected: ${error.message}`);
}
if (!doubleSpendRejected) console.log("   (unexpected) double-spend succeeded");

console.log("\nREADING:");
console.log("  • The world is recomputed by the SAME deterministic engine you already built —");
console.log("    Bitcoin only orders the single-use seals and stores the commitments.");
console.log("  • To rewrite history you must double-spend a Bitcoin UTXO ⇒ attack Bitcoin itself.");
console.log("  • No CKB, no new chain, no trusted indexer. Security = Bitcoin's proof-of-work.");
console.log("  • Swap the mock backend for ord/Esplora and this runs on real Bitcoin unchanged.");
console.log("");

// BRC-LIFE — Mode A on REAL Bitcoin signet (read/verify side is live).
//   node services/csv-adapter/src/signet-cli.js <command> [args]
//
// Commands:
//   tip                          show signet tip height (egress check)
//   inspect <txid>               read a live tx: confirmation + decoded OP_RETURN commitment
//   getspend <txid:vout>         follow a seal (UTXO) to its spend + commitment + next seal
//   plan [eventsDir]             compute the genesis commitment + the exact signet broadcast recipe
//   verify-seal <txid:vout> [eventsDir]
//                                read an anchored seal's commitment from signet and check it
//                                equals the commitment recomputed from the off-chain world
//
// The read/verify side runs on real Bitcoin. Broadcasting the anchor is the one
// step you do (your keys, your signet faucet coins) — `plan` prints exactly what
// to send; I never hold keys or broadcast for you.
import { loadEventsFromDirectory } from "../../indexer/src/state.js";
import { commitmentToOpReturnScript, createEsploraBitcoin, parseOpReturn, planGenesis } from "./index.js";

const ESPLORA = process.env.BRC_ESPLORA || "https://blockstream.info/signet/api";
const cmd = process.argv[2];
const arg = process.argv[3];
const backend = createEsploraBitcoin({ baseUrl: ESPLORA });

async function getJson(path) {
  const res = await fetch(`${ESPLORA}${path}`);
  if (!res.ok) throw new Error(`esplora ${res.status} ${path}`);
  return res.json();
}

try {
  if (cmd === "tip") {
    console.log(`signet tip height: ${await backend.tipHeight()}  (${ESPLORA})`);
  } else if (cmd === "inspect") {
    const tx = await getJson(`/tx/${arg}`);
    const op = (tx.vout || []).find((v) => v.scriptpubkey_type === "op_return");
    const data = op ? parseOpReturn(op.scriptpubkey) : null;
    console.log(`tx ${arg}`);
    console.log(`  confirmed: ${tx.status?.confirmed}  height: ${tx.status?.block_height ?? "(mempool)"}`);
    console.log(`  outputs: ${tx.vout.length}  OP_RETURN: ${op ? "yes" : "no"}`);
    if (data) console.log(`  commitment: ${data.length === 64 ? "sha256:" + data : "raw:" + data}`);
  } else if (cmd === "getspend") {
    const spend = await backend.getSpend(arg);
    if (!spend) console.log(`seal ${arg} is UNSPENT (seal still open)`);
    else console.log(`seal ${arg} spent by ${spend.spend_txid}\n  height ${spend.height} confirmed ${spend.confirmed}\n  commitment ${spend.commitment}\n  next seal ${spend.next_seal}`);
  } else if (cmd === "plan") {
    const events = await loadEventsFromDirectory(arg || "fixtures/life");
    const plan = planGenesis(events);
    const script = commitmentToOpReturnScript(plan.commitment);
    console.log("Genesis transition (off-chain world recomputed by the engine):");
    console.log(`  events: ${events.length}  ·  population ${plan.population}  alive ${plan.alive}`);
    console.log(`  state_root  ${plan.state_root}`);
    console.log(`  engine_root ${plan.engine_root}`);
    console.log(`  commitment  ${plan.commitment}\n`);
    console.log("To anchor on signet, broadcast ONE tx that:");
    console.log("  • spends any funded signet UTXO you control (that UTXO = your genesis seal),");
    console.log("  • has output 0 = a P2WPKH/P2TR to your own address (the continuation / next seal),");
    console.log(`  • has an OP_RETURN output with scriptPubKey:  ${script}\n`);
    console.log("bitcoin-cli (signet) recipe:");
    console.log(`  RAW=$(bitcoin-cli -signet createrawtransaction \\`);
    console.log(`    '[{"txid":"<SEAL_TXID>","vout":<SEAL_VOUT>}]' \\`);
    console.log(`    '[{"<YOUR_ADDR>":0.00009},{"data":"${plan.commitment.replace("sha256:", "")}"}]')`);
    console.log(`  bitcoin-cli -signet signrawtransactionwithwallet $RAW   # -> hex`);
    console.log(`  bitcoin-cli -signet sendrawtransaction <hex>            # -> <ANCHOR_TXID>`);
    console.log("  (Sparrow: add an OP_RETURN output with the data above. Get coins from a signet faucet.)\n");
    console.log("Then:  npm run csv:signet -- verify-seal <SEAL_TXID>:<SEAL_VOUT>");
  } else if (cmd === "verify-seal") {
    const events = await loadEventsFromDirectory(process.argv[4] || "fixtures/life");
    const expected = planGenesis(events).commitment;
    const spend = await backend.getSpend(arg);
    if (!spend) {
      console.log(`seal ${arg} is not yet spent on signet — anchor it first (see: plan).`);
    } else {
      const match = spend.commitment === expected;
      console.log(`anchored seal ${arg}`);
      console.log(`  spend tx ${spend.spend_txid} @ height ${spend.height}`);
      console.log(`  on-chain commitment : ${spend.commitment}`);
      console.log(`  recomputed off-chain: ${expected}`);
      console.log(`  ${match ? "✓ MATCH — the off-chain world is anchored on real Bitcoin signet" : "✗ mismatch — this seal does not anchor this world"}`);
    }
  } else {
    console.log("commands: tip | inspect <txid> | getspend <txid:vout> | plan [eventsDir] | verify-seal <txid:vout> [eventsDir]");
  }
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}

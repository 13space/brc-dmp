// BRC-LIFE — Mode A: one-click signet anchor (optional, uses @scure/btc-signer).
// ===========================================================================
// SIGNET ONLY. Coins are valueless test coins. NEVER set a mainnet key here.
// Your WIF is read from the BRC_SIGNET_WIF environment variable only — never a
// CLI argument, never logged. This is the only part of Mode A that needs a key;
// the read/verify side stays keyless and zero-dependency.
//
//   node services/csv-adapter/src/signet-anchor.js newkey      # make a signet key + address
//   BRC_SIGNET_WIF=... node .../signet-anchor.js               # DRY RUN (build + preview, no broadcast)
//   BRC_SIGNET_WIF=... node .../signet-anchor.js --send        # build + sign + BROADCAST one tx
//
// It spends one funded UTXO of your address (that UTXO becomes the anchored
// seal), writes the genesis commitment into an OP_RETURN, and sends the
// continuation to your own address (output 0 = the next seal). Then verify with:
//   npm run csv:signet -- verify-seal <SEAL_TXID>:<SEAL_VOUT>
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as btc from "@scure/btc-signer";
import { pubECDSA } from "@scure/btc-signer/utils.js";
import { hex } from "@scure/base";
import { loadEventsFromDirectory } from "../../indexer/src/state.js";
import { planGenesis } from "./csv.js";

const ESPLORA = (process.env.BRC_ESPLORA || "https://blockstream.info/signet/api").replace(/\/$/, "");
const DUST = 294n; // P2WPKH dust limit

// ---- pure, offline-testable transaction builder -------------------------------
// priv: 32-byte private key; utxo: { txid, vout, value(sats) }; commitment: "sha256:<hex>"
export function buildAnchorTx({ priv, utxo, commitment, feerate = 2 }) {
  const commitmentHex = commitment.startsWith("sha256:") ? commitment.slice(7) : commitment;
  if (commitmentHex.length !== 64) throw new Error("commitment must be 32 bytes (64 hex)");
  const pub = pubECDSA(priv);
  const spend = btc.p2wpkh(pub, btc.TEST_NETWORK);
  const value = BigInt(utxo.value);
  const opReturn = btc.Script.encode(["RETURN", hex.decode(commitmentHex)]);

  const make = (fee) => {
    const tx = new btc.Transaction({ allowUnknownOutputs: true });
    tx.addInput({ txid: utxo.txid, index: utxo.vout, witnessUtxo: { script: spend.script, amount: value } });
    tx.addOutputAddress(spend.address, value - fee, btc.TEST_NETWORK); // output 0 = continuation (next seal)
    tx.addOutput({ script: opReturn, amount: 0n }); // output 1 = OP_RETURN(commitment)
    tx.sign(priv);
    tx.finalize();
    return tx;
  };

  // The tx shape is fixed (1 P2WPKH in, 1 P2WPKH out, 1 OP_RETURN-32 out), so its
  // vsize is ~153; estimate the fee from a small overestimate (no value-dependent
  // draft build, which would crash for tiny UTXOs before the dust guard).
  const ESTIMATED_VSIZE = 160;
  const fee = BigInt(Math.ceil(ESTIMATED_VSIZE * feerate));
  if (value - fee < DUST) {
    throw new Error(`UTXO too small: value ${value} sats, fee ${fee} sats — fund the address with more signet coins`);
  }
  const tx = make(fee);
  return {
    address: spend.address,
    seal: `${utxo.txid}:${utxo.vout}`,
    next_seal: `${tx.id}:0`,
    anchor_txid: tx.id,
    hex: tx.hex,
    vsize: tx.vsize,
    fee: Number(fee),
    op_return_script: hex.encode(opReturn)
  };
}

// ---- network helpers ----------------------------------------------------------
async function get(path) {
  const res = await fetch(`${ESPLORA}${path}`);
  if (!res.ok) throw new Error(`esplora ${res.status} ${path}`);
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    return body.trim();
  }
}

async function broadcast(rawHex) {
  const res = await fetch(`${ESPLORA}/tx`, { method: "POST", body: rawHex });
  const body = await res.text();
  if (!res.ok) throw new Error(`broadcast failed (${res.status}): ${body}`);
  return body.trim();
}

async function pickFeerate() {
  try {
    const est = await get("/fee-estimates");
    return Math.max(1.1, Number(est["3"] ?? est["6"] ?? est["2"] ?? 1.5));
  } catch {
    return 1.5;
  }
}

// ---- main ---------------------------------------------------------------------
async function main() {
  const mode = process.argv[2];

  if (mode === "newkey") {
    const priv = randomBytes(32);
    const wif = btc.WIF(btc.TEST_NETWORK).encode(priv);
    const address = btc.p2wpkh(pubECDSA(priv), btc.TEST_NETWORK).address;
    console.log("Fresh SIGNET key (test coins only — never reuse on mainnet):");
    console.log(`  address : ${address}`);
    console.log(`  WIF     : ${wif}`);
    console.log("\nNext:");
    console.log(`  1) fund the address from a signet faucet (e.g. https://signetfaucet.com)`);
    console.log(`  2) export BRC_SIGNET_WIF='${wif}'`);
    console.log(`  3) npm run csv:signet:anchor            # dry run preview`);
    console.log(`  4) npm run csv:signet:anchor -- --send  # broadcast`);
    return;
  }

  const wif = process.env.BRC_SIGNET_WIF;
  if (!wif) {
    console.error("error: set BRC_SIGNET_WIF (a signet/testnet WIF). Run `... newkey` to make one. SIGNET ONLY.");
    process.exitCode = 1;
    return;
  }

  let priv;
  try {
    priv = btc.WIF(btc.TEST_NETWORK).decode(wif);
  } catch {
    console.error("error: BRC_SIGNET_WIF is not a valid signet/testnet WIF (a mainnet key would be rejected here — good).");
    process.exitCode = 1;
    return;
  }
  const address = btc.p2wpkh(pubECDSA(priv), btc.TEST_NETWORK).address;

  const utxos = await get(`/address/${address}/utxo`);
  const confirmed = utxos.filter((u) => u.status?.confirmed).sort((a, b) => b.value - a.value);
  if (confirmed.length === 0) {
    console.log(`address ${address} has no confirmed signet UTXOs.`);
    console.log("Fund it from a signet faucet (e.g. https://signetfaucet.com), then retry.");
    return;
  }
  const utxo = confirmed[0];

  const events = await loadEventsFromDirectory(process.env.BRC_EVENTS_DIR || "fixtures/life");
  const plan = planGenesis(events);
  const feerate = await pickFeerate();
  const built = buildAnchorTx({ priv, utxo, commitment: plan.commitment, feerate });

  const send = process.argv.includes("--send");
  console.log(`Mode A anchor (${send ? "BROADCAST" : "DRY RUN"}) — signet`);
  console.log(`  address      ${address}`);
  console.log(`  seal (input) ${built.seal}  (${utxo.value} sats)`);
  console.log(`  commitment   ${plan.commitment}   (world: pop ${plan.population}, alive ${plan.alive})`);
  console.log(`  OP_RETURN    ${built.op_return_script}`);
  console.log(`  fee          ${built.fee} sats @ ~${feerate} sat/vB  (vsize ${built.vsize})`);
  console.log(`  anchor txid  ${built.anchor_txid}`);
  console.log(`  next seal    ${built.next_seal}`);

  if (!send) {
    console.log("\nDRY RUN — nothing broadcast. Re-run with `-- --send` to broadcast.");
    return;
  }
  const txid = await broadcast(built.hex);
  console.log(`\n✓ broadcast. anchor txid: ${txid}`);
  console.log(`verify once confirmed:  npm run csv:signet -- verify-seal ${built.seal}`);
}

// Only run the network CLI when executed directly — importing this module (e.g.
// from tests) must not trigger main().
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  });
}

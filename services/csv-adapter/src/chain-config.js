import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

export const SIGNET_ESPLORA = "https://blockstream.info/signet/api";
export const MAINNET_ESPLORA = "https://blockstream.info/api";

export function resolveChainConfig(env = process.env) {
  const network = env.BRC_CHAIN_NETWORK || "signet";
  const baseUrl = (env.BRC_ESPLORA || (network === "signet" ? SIGNET_ESPLORA : MAINNET_ESPLORA)).replace(/\/$/, "");
  const statePath =
    env.BRC_CHAIN_STATE_PATH || path.join(projectRoot, ".tmp/chain-ingest", network, "state.json");
  const offchainDir =
    env.BRC_CHAIN_OFFCHAIN_DIR || path.join(projectRoot, "fixtures/chain/offchain");
  const pollMs = Number(env.BRC_CHAIN_POLL_MS || 30_000);

  return {
    projectRoot,
    network,
    baseUrl,
    statePath,
    offchainDir,
    pollMs
  };
}

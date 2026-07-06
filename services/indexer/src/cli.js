import { buildStateFromDirectory } from "./state.js";

const fixtureDir = process.argv[2] || "fixtures/valid";
const state = await buildStateFromDirectory(fixtureDir);

console.log(JSON.stringify({
  protocol: state.protocol,
  version: state.version,
  asset_count: state.assets.length,
  event_count: state.events.length,
  state_root: state.state_root,
  assets: state.assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    title: asset.subject.title,
    owner: asset.owner.id,
    proofs: asset.proofs.length,
    interactions: asset.interactions.length
  }))
}, null, 2));

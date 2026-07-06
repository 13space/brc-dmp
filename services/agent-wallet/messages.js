import { sha256Hex } from "../../packages/schema/src/canonicalize.js";

export function bindWalletMessage(event) {
  const binding = event.wallet_binding;
  return [
    "BRC-DMP bind_wallet v1",
    event.dmo_id,
    event.event_id,
    binding.address,
    binding.purpose,
    sha256Hex(binding)
  ].join("\n");
}

export function rotateKeyMessage(event) {
  const rotation = event.key_rotation;
  return [
    "BRC-DMP rotate_key v1",
    event.dmo_id,
    event.event_id,
    rotation.revoked_key_id || "",
    rotation.new_key.id,
    sha256Hex(rotation.new_key)
  ].join("\n");
}

export function messageForAgentEvent(event) {
  if (event.op === "bind_wallet") return bindWalletMessage(event);
  if (event.op === "rotate_key") return rotateKeyMessage(event);
  return null;
}

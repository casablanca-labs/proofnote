// Loaded before an offline example runner. It blocks the standard Node.js
// network entry points without adding a package or relying on host firewall
// configuration. The conformance harness drives this guard to fail on every
// run, so an untested "offline" label cannot pass.

import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

function denied() {
  const error = new Error("PROOFNOTE_OFFLINE_NETWORK_DENIED");
  error.code = "PROOFNOTE_OFFLINE_NETWORK_DENIED";
  throw error;
}

for (const [target, names] of [
  [net, ["connect", "createConnection"]],
  [tls, ["connect"]],
  [http, ["get", "request"]],
  [https, ["get", "request"]],
  [dgram, ["createSocket"]],
  [dns, ["lookup", "resolve", "resolve4", "resolve6"]],
]) {
  for (const name of names) target[name] = denied;
}

globalThis.fetch = async () => denied();
if ("WebSocket" in globalThis) globalThis.WebSocket = class OfflineWebSocket {
  constructor() {
    denied();
  }
};

process.env.PROOFNOTE_OFFLINE_GUARD = "active";

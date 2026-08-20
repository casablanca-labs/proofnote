import {
  chainIoTransactionIdFromRawTransactionV0,
  normalizeChainIoRawTransactionHexV0,
  normalizeChainIoTxidV0,
  parseChainIoCanonicalTransactionV0,
  type ChainNetworkV0,
} from "./index.js";

export const CHAIN_IO_WALLET_CONSENSUS_NODE_V0_MODE =
  "wallet-consensus-node-v0" as const;
export const CHAIN_IO_WALLET_CONSENSUS_NODE_V0_VERSION = 0 as const;

export type ChainIoWalletConsensusNodeTransportConfigurationV0 =
  | Readonly<{
    kind: "co-located-trusted-node";
    endpoint: string;
    rpcAuthorization?: string;
  }>
  | Readonly<{
    kind: "authenticated-integrity-protected-rpc";
    endpoint: string;
    rpcAuthorization: string;
  }>;

export type ChainIoWalletConsensusNodeConfigurationV0 = Readonly<{
  mode: typeof CHAIN_IO_WALLET_CONSENSUS_NODE_V0_MODE;
  network: ChainNetworkV0;
  nodeId: string;
  transport: ChainIoWalletConsensusNodeTransportConfigurationV0;
  requestTimeoutMs?: number;
}>;

export type ChainIoWalletConsensusNodeV0 = Readonly<{
  version: typeof CHAIN_IO_WALLET_CONSENSUS_NODE_V0_VERSION;
  kind: "chain-io-wallet-consensus-node-v0";
  mode: typeof CHAIN_IO_WALLET_CONSENSUS_NODE_V0_MODE;
  network: ChainNetworkV0;
  transport: ChainIoWalletConsensusNodeTransportConfigurationV0["kind"];
  selectedBy: "wallet-configuration";
  consensusTrustAnchor: "explicitly-configured-validating-node";
  /**
   * Authenticate one outpoint's current state under a process-local tip from
   * this exact configured node. Keeping this operation on the already-exported
   * handle avoids widening the staged chain-io barrel with a new re-export.
   */
  authenticateCurrentSourceOutput: (
    outpoint: Readonly<{ txid: string; vout: number }>,
    tip: ChainIoWalletConsensusNodeTipV0,
  ) => Promise<ChainIoWalletConsensusNodeCurrentSourceOutputStateV0>;
}>;

export type ChainIoWalletConsensusNodeTipV0 = Readonly<{
  blockHash: string;
  height: number;
}>;

export type ChainIoWalletConsensusNodeIncludedTransactionV0 = Readonly<{
  exactRawTransaction: string;
  locallyDerivedTxid: string;
  blockHash: string;
  blockHeight: number;
  confirmations: number;
  consensusFact: "canonical-inclusion-under-configured-validating-node";
}>;

export type ChainIoWalletConsensusNodeHistoricalSourceOutputV0 = Readonly<{
  exactParentRawTransaction: string;
  locallyDerivedParentTxid: string;
  outputIndex: number;
  exactCanonicalTransactionOutput: string;
  valueSats: string;
  lockingBytecode: string;
  tokenState: "none" | "present";
  parentBlockHash: string;
  parentBlockHeight: number;
  parentConfirmations: number;
}>;

type ChainIoWalletConsensusNodeCurrentSourceOutputStateBaseV0 = Readonly<{
  txid: string;
  outputIndex: number;
  tip: ChainIoWalletConsensusNodeTipV0;
  mempoolEffects: "excluded";
}>;

export type ChainIoWalletConsensusNodeCurrentSourceOutputStateV0 =
  ChainIoWalletConsensusNodeCurrentSourceOutputStateBaseV0 & Readonly<
    | {
      state: "unspent";
      confirmations: number;
      stateMeaning: "confirmed-canonical-utxo-state";
    }
    | {
      /** `gettxout: null` alone cannot distinguish a spent output from one that never existed. */
      state: "absent-or-spent";
      stateMeaning: "not-in-confirmed-canonical-utxo-set-at-tip";
    }
  >;

export type ChainIoWalletConsensusNodeCurrentBackingStateRecordV0 = Readonly<
  | { outputIndex: number; status: "unspent" }
  | {
    outputIndex: number;
    status: "spent";
    exactSpendingTxid?: string;
    exactInputIndex?: number;
  }
>;

export type ChainIoWalletConsensusNodeCurrentBackingSetStateV0 = Readonly<{
  settlementTxid: string;
  tip: ChainIoWalletConsensusNodeTipV0;
  outputIndexes: readonly [0, 1, 2, 3, 4];
  records: readonly [
    ChainIoWalletConsensusNodeCurrentBackingStateRecordV0,
    ChainIoWalletConsensusNodeCurrentBackingStateRecordV0,
    ChainIoWalletConsensusNodeCurrentBackingStateRecordV0,
    ChainIoWalletConsensusNodeCurrentBackingStateRecordV0,
    ChainIoWalletConsensusNodeCurrentBackingStateRecordV0,
  ];
  stateMeaning: "confirmed-canonical-utxo-state";
  mempoolEffects: "excluded";
  spenderIdentity: "optional-and-not-supplied-by-this-mechanism";
}>;

type ChainIoWalletConsensusNodeConsensusRejectionDiagnosticBaseV0 = Readonly<{
  version: 0;
  kind: "chain-io-wallet-consensus-node-consensus-rejection-diagnostic-v0";
  network: ChainNetworkV0;
  locallyDerivedTxid: string;
  evidenceMeaning: "diagnostic-only";
  authenticatedChainCapability: "not-minted";
  protocolAuthority: "none";
}>;

export type ChainIoWalletConsensusNodeConsensusRejectionDiagnosticV0 =
  ChainIoWalletConsensusNodeConsensusRejectionDiagnosticBaseV0 & Readonly<
    | {
      outcome: "configured-node-reported-consensus-rejection";
      publicReasonCode: "mandatory-script-verification-failed";
    }
    | { outcome: "configured-node-did-not-report-consensus-rejection" }
  >;

export type ChainIoWalletConsensusNodeFailureCodeV0 =
  | "wallet-consensus-node-configuration-invalid"
  | "wallet-consensus-node-handle-invalid"
  | "wallet-consensus-node-transport-failed"
  | "wallet-consensus-node-rpc-rejected"
  | "wallet-consensus-node-response-malformed"
  | "wallet-consensus-node-network-mismatch"
  | "wallet-consensus-node-tip-not-canonical"
  | "wallet-consensus-node-transaction-bytes-mismatch"
  | "wallet-consensus-node-inclusion-not-established"
  | "wallet-consensus-node-source-output-not-established"
  | "wallet-consensus-node-current-state-not-established";

export class ChainIoWalletConsensusNodeErrorV0 extends Error {
  public constructor(
    public readonly failureCode: ChainIoWalletConsensusNodeFailureCodeV0,
    message: string,
  ) {
    super(message);
    this.name = "ChainIoWalletConsensusNodeErrorV0";
  }
}

type PrivateNodeConfigurationV0 = Readonly<{
  endpoint: string;
  network: ChainNetworkV0;
  nodeId: string;
  requestTimeoutMs: number;
  rpcAuthorization?: string;
}>;

type JsonRpcResponseV0 = Readonly<{
  id?: unknown;
  result?: unknown;
  error?: unknown;
}>;

const DEFAULT_REQUEST_TIMEOUT_MS_V0 = 8_000;
const JSON_RPC_REQUEST_ID_V0 = "bch-cloak-wallet-consensus-node-v0";
const configuredNodesV0 = new WeakMap<object, PrivateNodeConfigurationV0>();
const authenticatedTipsV0 = new WeakMap<
  object,
  Readonly<{ node: ChainIoWalletConsensusNodeV0; blockHash: string; height: number }>
>();

function fail(
  failureCode: ChainIoWalletConsensusNodeFailureCodeV0,
  message: string,
): never {
  throw new ChainIoWalletConsensusNodeErrorV0(failureCode, message);
}

function asRecord(name: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("wallet-consensus-node-response-malformed", `${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertPlainRecord(name: string, value: unknown): Record<string, unknown> {
  const record = asRecord(name, value);
  const prototype = Object.getPrototypeOf(record) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return fail("wallet-consensus-node-configuration-invalid", `${name} must be a plain object`);
  }
  return record;
}

function assertExactKeys(
  name: string,
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(
        "wallet-consensus-node-configuration-invalid",
        `${name} contains unsupported field ${key}`,
      );
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) {
      fail(
        "wallet-consensus-node-configuration-invalid",
        `${name} is missing required field ${key}`,
      );
    }
  }
}

function nonEmptyString(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail("wallet-consensus-node-configuration-invalid", `${name} must be a non-empty string`);
  }
  return value.trim();
}

function safeNonNegativeInteger(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return fail("wallet-consensus-node-response-malformed", `${name} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeNetwork(value: unknown): ChainNetworkV0 {
  if (value !== "chipnet" && value !== "mainnet" && value !== "regtest") {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node network must be chipnet, mainnet, or regtest",
    );
  }
  return value;
}

function normalizeAuthorization(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node RPC authorization must be a non-empty string",
    );
  }
  const authorization = value;
  if (authorization.length > 4_096 || /[\r\n]/u.test(authorization)) {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node RPC authorization is malformed",
    );
  }
  return authorization;
}

function normalizeEndpoint(
  kind: ChainIoWalletConsensusNodeTransportConfigurationV0["kind"],
  value: unknown,
): string {
  const raw = nonEmptyString("wallet consensus node endpoint", value);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node endpoint must be an absolute URL",
    );
  }
  if (
    parsed.username.length > 0 || parsed.password.length > 0 ||
    parsed.search.length > 0 || parsed.hash.length > 0
  ) {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node endpoint must not embed credentials, query data, or a fragment",
    );
  }
  const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"]);
  if (kind === "co-located-trusted-node") {
    if (!loopbackHosts.has(parsed.hostname) || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      return fail(
        "wallet-consensus-node-configuration-invalid",
        "co-located trusted node transport requires an explicit loopback HTTP(S) endpoint",
      );
    }
  } else if (parsed.protocol !== "https:") {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "remote wallet consensus node RPC must use authenticated, integrity-protected HTTPS",
    );
  }
  return parsed.toString();
}

function expectedRpcChain(network: ChainNetworkV0): string {
  if (network === "mainnet") return "main";
  if (network === "chipnet") return "chip";
  return network;
}

function requireConfiguredNode(
  node: ChainIoWalletConsensusNodeV0,
): PrivateNodeConfigurationV0 {
  const configuration = typeof node === "object" && node !== null
    ? configuredNodesV0.get(node)
    : undefined;
  if (configuration === undefined) {
    return fail(
      "wallet-consensus-node-handle-invalid",
      "wallet consensus node handle lacks process-local configured provenance",
    );
  }
  return configuration;
}

function requireAuthenticatedTip(
  node: ChainIoWalletConsensusNodeV0,
  tip: ChainIoWalletConsensusNodeTipV0,
): Readonly<{ blockHash: string; height: number }> {
  const provenance = typeof tip === "object" && tip !== null
    ? authenticatedTipsV0.get(tip)
    : undefined;
  if (provenance === undefined || provenance.node !== node) {
    return fail(
      "wallet-consensus-node-handle-invalid",
      "wallet consensus node operation requires a process-local tip from the same configured node",
    );
  }
  return provenance;
}

function normalizeNodeTxid(name: string, value: unknown): string {
  try {
    return normalizeChainIoTxidV0(name, value);
  } catch {
    return fail("wallet-consensus-node-response-malformed", `${name} must be an exact display-order txid`);
  }
}

function normalizeNodeRawTransaction(name: string, value: unknown): string {
  try {
    return normalizeChainIoRawTransactionHexV0(name, value);
  } catch {
    return fail("wallet-consensus-node-response-malformed", `${name} must contain exact raw transaction bytes`);
  }
}

function compactSizeHex(value: number): string {
  if (value < 0xfd) return value.toString(16).padStart(2, "0");
  if (value <= 0xffff) {
    const bytes = Buffer.allocUnsafe(2);
    bytes.writeUInt16LE(value);
    return `fd${bytes.toString("hex")}`;
  }
  if (value <= 0xffffffff) {
    const bytes = Buffer.allocUnsafe(4);
    bytes.writeUInt32LE(value);
    return `fe${bytes.toString("hex")}`;
  }
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return `ff${bytes.toString("hex")}`;
}

function exactCanonicalTransactionOutput(
  valueSats: string,
  lockingBytecode: string,
): string {
  const value = BigInt(valueSats);
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    return fail(
      "wallet-consensus-node-source-output-not-established",
      "historical source output value is outside the canonical uint64 range",
    );
  }
  const valueBytes = Buffer.allocUnsafe(8);
  valueBytes.writeBigUInt64LE(value);
  return `${valueBytes.toString("hex")}${compactSizeHex(lockingBytecode.length / 2)}${lockingBytecode}`;
}

async function rpcCall(
  node: ChainIoWalletConsensusNodeV0,
  method: string,
  params: readonly unknown[],
): Promise<unknown> {
  const configuration = requireConfiguredNode(node);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(configuration.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(configuration.rpcAuthorization === undefined
          ? {}
          : { authorization: configuration.rpcAuthorization }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: JSON_RPC_REQUEST_ID_V0,
        method,
        params,
      }),
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    return fail(
      "wallet-consensus-node-transport-failed",
      "configured wallet consensus node transport failed",
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    return fail(
      "wallet-consensus-node-transport-failed",
      `configured wallet consensus node returned HTTP ${String(response.status)}`,
    );
  }
  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch {
    return fail(
      "wallet-consensus-node-response-malformed",
      "configured wallet consensus node returned malformed JSON",
    );
  }
  const envelope = asRecord("wallet consensus node JSON-RPC response", decoded) as JsonRpcResponseV0;
  if (envelope.id !== JSON_RPC_REQUEST_ID_V0) {
    return fail(
      "wallet-consensus-node-response-malformed",
      "configured wallet consensus node returned a mismatched JSON-RPC response ID",
    );
  }
  if (envelope.error !== undefined && envelope.error !== null) {
    return fail(
      "wallet-consensus-node-rpc-rejected",
      `configured wallet consensus node rejected RPC method ${method}`,
    );
  }
  if (!Object.hasOwn(envelope, "result")) {
    return fail(
      "wallet-consensus-node-response-malformed",
      `configured wallet consensus node omitted the ${method} result`,
    );
  }
  return envelope.result;
}

export function configureChainIoWalletConsensusNodeV0(
  value: ChainIoWalletConsensusNodeConfigurationV0,
): ChainIoWalletConsensusNodeV0 {
  const record = assertPlainRecord("ChainIoWalletConsensusNodeConfigurationV0", value);
  assertExactKeys(
    "ChainIoWalletConsensusNodeConfigurationV0",
    record,
    ["mode", "network", "nodeId", "transport"],
    ["requestTimeoutMs"],
  );
  if (record.mode !== CHAIN_IO_WALLET_CONSENSUS_NODE_V0_MODE) {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node mode must be wallet-consensus-node-v0",
    );
  }
  const network = normalizeNetwork(record.network);
  const nodeId = nonEmptyString("wallet consensus node ID", record.nodeId);
  const transport = assertPlainRecord(
    "ChainIoWalletConsensusNodeTransportConfigurationV0",
    record.transport,
  );
  const transportKind = transport.kind;
  if (
    transportKind !== "co-located-trusted-node" &&
    transportKind !== "authenticated-integrity-protected-rpc"
  ) {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node transport kind is unsupported",
    );
  }
  assertExactKeys(
    "ChainIoWalletConsensusNodeTransportConfigurationV0",
    transport,
    ["kind", "endpoint"],
    ["rpcAuthorization"],
  );
  const endpoint = normalizeEndpoint(transportKind, transport.endpoint);
  const rpcAuthorization = transport.rpcAuthorization === undefined
    ? undefined
    : normalizeAuthorization(transport.rpcAuthorization);
  if (
    transportKind === "authenticated-integrity-protected-rpc" &&
    rpcAuthorization === undefined
  ) {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "remote wallet consensus node RPC requires explicit authentication",
    );
  }
  const requestTimeoutMs = record.requestTimeoutMs === undefined
    ? DEFAULT_REQUEST_TIMEOUT_MS_V0
    : safeNonNegativeInteger("wallet consensus node request timeout", record.requestTimeoutMs);
  if (requestTimeoutMs === 0) {
    return fail(
      "wallet-consensus-node-configuration-invalid",
      "wallet consensus node request timeout must be positive",
    );
  }
  const handle: ChainIoWalletConsensusNodeV0 = Object.freeze({
    version: CHAIN_IO_WALLET_CONSENSUS_NODE_V0_VERSION,
    kind: "chain-io-wallet-consensus-node-v0",
    mode: CHAIN_IO_WALLET_CONSENSUS_NODE_V0_MODE,
    network,
    transport: transportKind,
    selectedBy: "wallet-configuration",
    consensusTrustAnchor: "explicitly-configured-validating-node",
    authenticateCurrentSourceOutput(
      this: ChainIoWalletConsensusNodeV0,
      outpoint: Readonly<{ txid: string; vout: number }>,
      tip: ChainIoWalletConsensusNodeTipV0,
    ) {
      return authenticateCurrentSourceOutputV0(this, outpoint, tip);
    },
  });
  configuredNodesV0.set(handle, Object.freeze({
    endpoint,
    network,
    nodeId,
    requestTimeoutMs,
    ...(rpcAuthorization === undefined ? {} : { rpcAuthorization }),
  }));
  return handle;
}

export function isChainIoWalletConsensusNodeV0(
  value: unknown,
): value is ChainIoWalletConsensusNodeV0 {
  return typeof value === "object" && value !== null &&
    configuredNodesV0.has(value) && Object.isFrozen(value) &&
    (value as ChainIoWalletConsensusNodeV0).mode === CHAIN_IO_WALLET_CONSENSUS_NODE_V0_MODE &&
    (value as ChainIoWalletConsensusNodeV0).selectedBy === "wallet-configuration";
}

export async function readChainIoWalletConsensusNodeTipV0(
  node: ChainIoWalletConsensusNodeV0,
): Promise<ChainIoWalletConsensusNodeTipV0> {
  const configuration = requireConfiguredNode(node);
  const result = asRecord(
    "wallet consensus node getblockchaininfo result",
    await rpcCall(node, "getblockchaininfo", []),
  );
  if (result.chain !== expectedRpcChain(configuration.network)) {
    return fail(
      "wallet-consensus-node-network-mismatch",
      "configured wallet consensus node reported the wrong BCH network",
    );
  }
  const height = safeNonNegativeInteger("wallet consensus node tip height", result.blocks);
  const blockHash = normalizeChainIoTxidV0(
    "wallet consensus node tip block hash",
    result.bestblockhash,
  );
  const hashAtHeight = normalizeChainIoTxidV0(
    "wallet consensus node canonical tip block hash",
    await rpcCall(node, "getblockhash", [height]),
  );
  if (hashAtHeight !== blockHash) {
    return fail(
      "wallet-consensus-node-tip-not-canonical",
      "configured wallet consensus node tip hash does not match its canonical height",
    );
  }
  const tip: ChainIoWalletConsensusNodeTipV0 = Object.freeze({ blockHash, height });
  authenticatedTipsV0.set(tip, Object.freeze({ node, blockHash, height }));
  return tip;
}

async function authenticateCanonicalTransaction(
  node: ChainIoWalletConsensusNodeV0,
  requestedTxid: string,
  expectedRawTransaction: string | undefined,
  tip: ChainIoWalletConsensusNodeTipV0,
): Promise<ChainIoWalletConsensusNodeIncludedTransactionV0> {
  const boundTip = requireAuthenticatedTip(node, tip);
  const result = asRecord(
    "wallet consensus node getrawtransaction result",
    await rpcCall(node, "getrawtransaction", [requestedTxid, true]),
  );
  if (!Object.hasOwn(result, "hex") || !Object.hasOwn(result, "txid")) {
    return fail(
      "wallet-consensus-node-inclusion-not-established",
      "included-transaction authentication requires independently fetched raw bytes and a transaction identifier",
    );
  }
  const exactRawTransaction = normalizeNodeRawTransaction(
    "wallet consensus node canonical raw transaction",
    result.hex,
  );
  const locallyDerivedTxid = chainIoTransactionIdFromRawTransactionV0(exactRawTransaction);
  const reportedTxid = normalizeNodeTxid(
    "wallet consensus node canonical transaction ID",
    result.txid,
  );
  if (locallyDerivedTxid !== requestedTxid || reportedTxid !== requestedTxid) {
    return fail(
      "wallet-consensus-node-transaction-bytes-mismatch",
      "configured wallet consensus node raw transaction bytes do not locally derive the requested txid",
    );
  }
  if (expectedRawTransaction !== undefined && exactRawTransaction !== expectedRawTransaction) {
    return fail(
      "wallet-consensus-node-transaction-bytes-mismatch",
      "configured wallet consensus node raw transaction bytes differ from the exact candidate bytes",
    );
  }
  if (!Object.hasOwn(result, "blockhash")) {
    return fail(
      "wallet-consensus-node-inclusion-not-established",
      "raw or mempool-only transaction retrieval does not establish canonical inclusion",
    );
  }
  const blockHash = normalizeNodeTxid(
    "wallet consensus node transaction block hash",
    result.blockhash,
  );
  const header = asRecord(
    "wallet consensus node getblockheader result",
    await rpcCall(node, "getblockheader", [blockHash, true]),
  );
  const headerHash = normalizeNodeTxid(
    "wallet consensus node block header hash",
    header.hash,
  );
  const blockHeight = safeNonNegativeInteger(
    "wallet consensus node transaction block height",
    header.height,
  );
  if (headerHash !== blockHash || blockHeight > boundTip.height) {
    return fail(
      "wallet-consensus-node-inclusion-not-established",
      "transaction block is not an ancestor of the selected canonical tip",
    );
  }
  const canonicalHash = normalizeNodeTxid(
    "wallet consensus node canonical transaction block hash",
    await rpcCall(node, "getblockhash", [blockHeight]),
  );
  if (canonicalHash !== blockHash) {
    return fail(
      "wallet-consensus-node-inclusion-not-established",
      "transaction block is not canonical at its reported height",
    );
  }
  const confirmations = boundTip.height - blockHeight + 1;
  return Object.freeze({
    exactRawTransaction,
    locallyDerivedTxid,
    blockHash,
    blockHeight,
    confirmations,
    consensusFact: "canonical-inclusion-under-configured-validating-node",
  });
}

export async function authenticateChainIoWalletConsensusNodeIncludedTransactionV0(
  node: ChainIoWalletConsensusNodeV0,
  exactRawTransaction: string,
  tip: ChainIoWalletConsensusNodeTipV0,
): Promise<ChainIoWalletConsensusNodeIncludedTransactionV0> {
  requireConfiguredNode(node);
  requireAuthenticatedTip(node, tip);
  const normalizedRawTransaction = normalizeNodeRawTransaction(
    "exact candidate raw transaction",
    exactRawTransaction,
  );
  const locallyDerivedTxid = chainIoTransactionIdFromRawTransactionV0(normalizedRawTransaction);
  return authenticateCanonicalTransaction(
    node,
    locallyDerivedTxid,
    normalizedRawTransaction,
    tip,
  );
}

export async function authenticateChainIoWalletConsensusNodeHistoricalSourceOutputV0(
  node: ChainIoWalletConsensusNodeV0,
  outpoint: Readonly<{ txid: string; vout: number }>,
  tip: ChainIoWalletConsensusNodeTipV0,
): Promise<ChainIoWalletConsensusNodeHistoricalSourceOutputV0> {
  requireConfiguredNode(node);
  requireAuthenticatedTip(node, tip);
  const txid = normalizeNodeTxid("historical source outpoint txid", outpoint.txid);
  if (!Number.isSafeInteger(outpoint.vout) || outpoint.vout < 0) {
    return fail(
      "wallet-consensus-node-source-output-not-established",
      "historical source output index must be a non-negative safe integer",
    );
  }
  const parent = await authenticateCanonicalTransaction(node, txid, undefined, tip);
  let parsed: ReturnType<typeof parseChainIoCanonicalTransactionV0>;
  try {
    parsed = parseChainIoCanonicalTransactionV0(parent.exactRawTransaction);
  } catch {
    return fail(
      "wallet-consensus-node-source-output-not-established",
      "historical source parent bytes are not one canonical BCH transaction",
    );
  }
  const output = parsed.outputs[outpoint.vout];
  if (output === undefined) {
    return fail(
      "wallet-consensus-node-source-output-not-established",
      "historical source output is absent from its canonically included parent",
    );
  }
  return Object.freeze({
    exactParentRawTransaction: parent.exactRawTransaction,
    locallyDerivedParentTxid: parent.locallyDerivedTxid,
    outputIndex: outpoint.vout,
    exactCanonicalTransactionOutput: exactCanonicalTransactionOutput(
      output.valueSats,
      output.lockingBytecode,
    ),
    valueSats: output.valueSats,
    lockingBytecode: output.lockingBytecode,
    tokenState: output.tokenState,
    parentBlockHash: parent.blockHash,
    parentBlockHeight: parent.blockHeight,
    parentConfirmations: parent.confirmations,
  });
}

async function authenticateCurrentSourceOutputV0(
  node: ChainIoWalletConsensusNodeV0,
  outpoint: Readonly<{ txid: string; vout: number }>,
  tip: ChainIoWalletConsensusNodeTipV0,
): Promise<ChainIoWalletConsensusNodeCurrentSourceOutputStateV0> {
  requireConfiguredNode(node);
  const boundTip = requireAuthenticatedTip(node, tip);
  const txid = normalizeNodeTxid("current source outpoint txid", outpoint.txid);
  if (!Number.isSafeInteger(outpoint.vout) || outpoint.vout < 0) {
    return fail(
      "wallet-consensus-node-current-state-not-established",
      "current source output index must be a non-negative safe integer",
    );
  }
  const result = await rpcCall(node, "gettxout", [txid, outpoint.vout, false]);
  let state: "unspent" | "absent-or-spent";
  let confirmations: number | undefined;
  if (result === null) {
    state = "absent-or-spent";
  } else {
    const current = asRecord("wallet consensus node current source gettxout result", result);
    const bestBlock = normalizeNodeTxid(
      "wallet consensus node current source best block",
      current.bestblock,
    );
    if (bestBlock !== boundTip.blockHash) {
      return fail(
        "wallet-consensus-node-current-state-not-established",
        "current source output evidence is stale or belongs to a mixed tip",
      );
    }
    if (
      typeof current.confirmations !== "number" ||
      !Number.isSafeInteger(current.confirmations) ||
      current.confirmations <= 0
    ) {
      return fail(
        "wallet-consensus-node-current-state-not-established",
        "current source output requires confirmed canonical UTXO evidence",
      );
    }
    state = "unspent";
    confirmations = current.confirmations;
  }
  const recheckedTip = await readChainIoWalletConsensusNodeTipV0(node);
  if (
    recheckedTip.blockHash !== boundTip.blockHash ||
    recheckedTip.height !== boundTip.height
  ) {
    return fail(
      "wallet-consensus-node-current-state-not-established",
      "configured wallet consensus node tip moved during the current source query",
    );
  }
  const base = {
    txid,
    outputIndex: outpoint.vout,
    tip: Object.freeze({ blockHash: boundTip.blockHash, height: boundTip.height }),
    mempoolEffects: "excluded" as const,
  };
  return state === "unspent"
    ? Object.freeze({
      ...base,
      state,
      confirmations: confirmations!,
      stateMeaning: "confirmed-canonical-utxo-state" as const,
    })
    : Object.freeze({
      ...base,
      state,
      stateMeaning: "not-in-confirmed-canonical-utxo-set-at-tip" as const,
    });
}

export async function authenticateChainIoWalletConsensusNodeCurrentBackingSetStateV0(
  node: ChainIoWalletConsensusNodeV0,
  settlementTxidValue: string,
  tip: ChainIoWalletConsensusNodeTipV0,
): Promise<ChainIoWalletConsensusNodeCurrentBackingSetStateV0> {
  requireConfiguredNode(node);
  const boundTip = requireAuthenticatedTip(node, tip);
  const settlementTxid = normalizeNodeTxid("settlement txid", settlementTxidValue);
  const outputIndexes = Object.freeze([0, 1, 2, 3, 4] as const);
  const rawStates: unknown[] = [];
  for (const outputIndex of outputIndexes) {
    rawStates.push(await rpcCall(node, "gettxout", [settlementTxid, outputIndex, false]));
  }
  const records: ChainIoWalletConsensusNodeCurrentBackingStateRecordV0[] = [];
  for (let index = 0; index < outputIndexes.length; index += 1) {
    const outputIndex = outputIndexes[index]!;
    const result = rawStates[index];
    if (result === null) {
      records.push(Object.freeze({ outputIndex, status: "spent" }));
      continue;
    }
    const state = asRecord(
      `wallet consensus node gettxout result for output ${String(outputIndex)}`,
      result,
    );
    const bestBlock = normalizeNodeTxid(
      `wallet consensus node gettxout best block for output ${String(outputIndex)}`,
      state.bestblock,
    );
    if (bestBlock !== boundTip.blockHash) {
      return fail(
        "wallet-consensus-node-current-state-not-established",
        "complete backing state contains mixed-tip or stale output evidence",
      );
    }
    if (
      typeof state.confirmations !== "number" ||
      !Number.isSafeInteger(state.confirmations) ||
      state.confirmations <= 0
    ) {
      return fail(
        "wallet-consensus-node-current-state-not-established",
        "complete backing state requires confirmed canonical output evidence",
      );
    }
    records.push(Object.freeze({ outputIndex, status: "unspent" }));
  }
  const recheckedTip = await readChainIoWalletConsensusNodeTipV0(node);
  if (
    recheckedTip.blockHash !== boundTip.blockHash ||
    recheckedTip.height !== boundTip.height
  ) {
    return fail(
      "wallet-consensus-node-current-state-not-established",
      "configured wallet consensus node tip moved during the complete backing-state query",
    );
  }
  if (records.length !== 5) {
    return fail(
      "wallet-consensus-node-current-state-not-established",
      "complete backing state must contain exactly five ordered records",
    );
  }
  const exactRecords = Object.freeze(records) as ChainIoWalletConsensusNodeCurrentBackingSetStateV0["records"];
  return Object.freeze({
    settlementTxid,
    tip: Object.freeze({ blockHash: boundTip.blockHash, height: boundTip.height }),
    outputIndexes,
    records: exactRecords,
    stateMeaning: "confirmed-canonical-utxo-state",
    mempoolEffects: "excluded",
    spenderIdentity: "optional-and-not-supplied-by-this-mechanism",
  });
}

export async function readChainIoWalletConsensusNodeCanonicalBlockHashV0(
  node: ChainIoWalletConsensusNodeV0,
  height: number,
): Promise<string> {
  requireConfiguredNode(node);
  if (!Number.isSafeInteger(height) || height < 0) {
    return fail(
      "wallet-consensus-node-response-malformed",
      "canonical block height must be a non-negative safe integer",
    );
  }
  return normalizeNodeTxid(
    "wallet consensus node canonical block hash",
    await rpcCall(node, "getblockhash", [height]),
  );
}

export async function diagnoseChainIoWalletConsensusNodeConsensusRejectionV0(
  node: ChainIoWalletConsensusNodeV0,
  exactRawTransactionValue: string,
): Promise<ChainIoWalletConsensusNodeConsensusRejectionDiagnosticV0> {
  const configuration = requireConfiguredNode(node);
  const exactRawTransaction = normalizeNodeRawTransaction(
    "consensus-rejection diagnostic raw transaction",
    exactRawTransactionValue,
  );
  const locallyDerivedTxid = chainIoTransactionIdFromRawTransactionV0(exactRawTransaction);
  const result = await rpcCall(node, "testmempoolaccept", [[exactRawTransaction]]);
  if (!Array.isArray(result) || result.length !== 1) {
    return fail(
      "wallet-consensus-node-response-malformed",
      "configured-node consensus diagnostic requires one testmempoolaccept result",
    );
  }
  const decision = asRecord(
    "wallet consensus node testmempoolaccept result",
    result[0],
  );
  const rejectReason = decision["reject-reason"];
  const publicReasonCode = typeof rejectReason === "string" &&
      rejectReason.startsWith("mandatory-script-verify-flag-failed")
    ? "mandatory-script-verification-failed" as const
    : undefined;
  const base = {
    version: 0,
    kind: "chain-io-wallet-consensus-node-consensus-rejection-diagnostic-v0",
    network: configuration.network,
    locallyDerivedTxid,
    evidenceMeaning: "diagnostic-only",
    authenticatedChainCapability: "not-minted",
    protocolAuthority: "none",
  } as const;
  if (decision.allowed === false && publicReasonCode !== undefined) {
    return Object.freeze({
      ...base,
      outcome: "configured-node-reported-consensus-rejection",
      publicReasonCode,
    });
  }
  return Object.freeze({
    ...base,
    outcome: "configured-node-did-not-report-consensus-rejection",
  });
}

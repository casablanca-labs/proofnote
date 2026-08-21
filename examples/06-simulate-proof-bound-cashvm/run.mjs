#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createVirtualMachineBch2026,
  encodeLockingBytecodeP2sh32,
  encodeTransactionBch,
} from "@bitauth/libauth";
import { verifyGroth16Envelope } from "../01-verify-a-proof/run.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SOURCE_ROOT = resolve(HERE, "..", "..", "..", "..", "..");
const PATHS = {
  proof: "tools/apnt-private-note-transition-sp1/fixtures/canonical-groth16-private-split-v0.json",
  vectors: "tools/apnt-private-note-transition-rust-parity/fixtures/typescript-golden-vectors-public-v0.json",
  covenant: "packages/reference-aggregator/fixtures/apnt-settlement-authorization-covenant-bytecode-v0.json",
  key: "examples/01-verify-a-proof/verification-key.json",
};
const DIGESTS = {
  proof: "bdb18184d6befa0eb02ed5df9f385154c3edc509e52de2acedfbdeea7e45421c",
  vectors: "423dc83551d7062ddb3deae62b6868af959e6a862e8219605b25fd7da254f434",
  covenant: "8d8232bfc97e5dd106a6c46fbeec9355da071e5b5a8e57427d3628941ffc7a65",
  key: "6f98c23d979a5cb6d69286085bbcc5b14f8fbde3513b291c14609a7c64b3043a",
};
const EXPECTED_PROJECTION = "fe9b606ee1cda9e495ef4fc657e78799774cd142ea6e72513a8aab2f1a60709f";
const EXPECTED_STATEMENT = "100091ec7e772297498610191658d56e94279988d9fdff3fd00af4350fe67f65";
const PERSONALIZATION = "BCH Cloak APNT v0 domain-separated SHA-256";
const PROJECTION_DOMAIN = "bch-cloak-apnt-v0:transition-settlement-projection-commitment-v0";
const STATEMENT_DOMAIN = "bch-cloak-apnt-v0:transition-statement-commitment-v1";
const ABSENT_U32 = 0xffff_ffff;

const hex = (bytes) => Buffer.from(bytes).toString("hex");
const bin = (value) => Uint8Array.from(Buffer.from(value, "hex"));
const sha256 = (bytes) => Uint8Array.from(createHash("sha256").update(bytes).digest());
const sha256Hex = (bytes) => hex(sha256(bytes));
const concat = (parts) => Uint8Array.from(parts.flatMap((part) => [...part]));
const text = (value) => Uint8Array.from(Buffer.from(value, "utf8"));
const u16be = (value) => Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
const u32be = (value) => Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
const u32le = (value) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
const u64le = (value) => {
  const out = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1) out[index] = Number((value >> BigInt(index * 8)) & 0xffn);
  return out;
};
const push = (value) => value.length <= 75
  ? Uint8Array.from([value.length, ...value])
  : Uint8Array.from([0x4d, value.length & 0xff, value.length >>> 8, ...value]);

function domainHash(domain, payload) {
  const p = text(PERSONALIZATION);
  const d = text(domain);
  return sha256(concat([u16be(p.length), p, u16be(d.length), d, u32be(payload.length), payload]));
}

class Reader {
  #bytes;
  #offset = 0;
  constructor(bytes) { this.#bytes = bytes; }
  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.#offset + length > this.#bytes.length) throw new Error("statement truncated");
    const out = this.#bytes.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return out;
  }
  u8() { return this.take(1)[0]; }
  u16() { const b = this.take(2); return b[0] | (b[1] << 8); }
  u32() { const b = this.take(4); return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0; }
  u64() {
    const b = this.take(8);
    let out = 0n;
    for (let index = 7; index >= 0; index -= 1) out = (out << 8n) | BigInt(b[index]);
    return out;
  }
  blob() { return Uint8Array.from(this.take(this.u32())); }
  rest() { return this.take(this.#bytes.length - this.#offset); }
}

function parseStatement(bytes) {
  const reader = new Reader(bytes);
  if (Buffer.from(reader.take(8)).toString("ascii") !== "APNTTSV1" || reader.u8() !== 1) throw new Error("statement identity mismatch");
  reader.take(reader.u16());
  reader.take(2 + (32 * 4));
  const designatedVerifierInputIndex = reader.u32();
  reader.take(32);
  if (reader.u8() === 1) reader.take(32);
  reader.take(reader.u32() * 64);
  reader.take(reader.u32() * (4 + 32 + 32));
  reader.take(reader.u32() * (32 + 4 + 32));
  reader.take(reader.u32() * (4 + 32 + 32 + 32));
  if (reader.u8() === 1) reader.take(32);
  const networkFeeSats = reader.u64();
  reader.take(8 + 4 + 8 + 8);
  const projection = new Reader(reader.rest());
  if (projection.u8() !== 1) throw new Error("projection version mismatch");
  const version = projection.u32();
  const locktime = projection.u32();
  const inputs = Array.from({ length: projection.u32() }, () => {
    const outpointTransactionHash = Uint8Array.from(projection.take(32));
    const outpointIndex = projection.u32();
    const sequenceNumber = projection.u32();
    const valueSatoshis = projection.u64();
    const lockingBytecode = projection.blob();
    if (projection.u8() !== 0) throw new Error("published lab statement unexpectedly contains an input token");
    projection.u8();
    return { outpointTransactionHash, outpointIndex, sequenceNumber, valueSatoshis, lockingBytecode };
  });
  const outputs = Array.from({ length: projection.u32() }, () => {
    const valueSatoshis = projection.u64();
    const lockingBytecodeTemplate = projection.blob();
    const encodedOffset = projection.u32();
    if (projection.u8() !== 0) throw new Error("published lab statement unexpectedly contains an output token");
    projection.u8();
    return { valueSatoshis, lockingBytecodeTemplate, statementCommitmentOffset: encodedOffset === ABSENT_U32 ? null : encodedOffset };
  });
  return { designatedVerifierInputIndex, networkFeeSats, version, locktime, inputs, outputs };
}

function projectionTranscript(statement, statementCommitment) {
  const parts = [text("APNTTSP0"), Uint8Array.of(0), u32le(statement.version), u32le(statement.locktime), u32le(statement.inputs.length), u32le(statement.designatedVerifierInputIndex)];
  statement.inputs.forEach((input, index) => {
    if (index !== statement.designatedVerifierInputIndex) {
      parts.push(input.outpointTransactionHash, u32le(input.outpointIndex), u32le(input.sequenceNumber), u64le(input.valueSatoshis));
    }
  });
  parts.push(u32le(statement.outputs.length));
  for (const output of statement.outputs) {
    const locking = Uint8Array.from(output.lockingBytecodeTemplate);
    if (output.statementCommitmentOffset !== null) locking.set(statementCommitment, output.statementCommitmentOffset);
    parts.push(u64le(output.valueSatoshis), u32le(locking.length), locking);
  }
  parts.push(u64le(statement.networkFeeSats));
  return concat(parts);
}

function readPinned(name) {
  const publicPath = join(ROOT, PATHS[name]);
  const bytes = readFileSync(existsSync(publicPath) ? publicPath : join(SOURCE_ROOT, PATHS[name]));
  if (sha256Hex(bytes) !== DIGESTS[name]) throw new Error(`${name} artifact digest mismatch`);
  return JSON.parse(bytes.toString("utf8"));
}

function publicBindings(proof, vector) {
  const statementBytes = bin(vector.statementBytesHex);
  const statementCommitment = domainHash(STATEMENT_DOMAIN, statementBytes);
  if (hex(statementCommitment) !== vector.statementCommitment32Hex || hex(statementCommitment) !== EXPECTED_STATEMENT) throw new Error("statement commitment mismatch");
  if (proof.publicValuesBytes !== vector.expectedPublicResultHex) throw new Error("proof public values do not equal the selected public vector result");
  const publicValues = bin(proof.publicValuesBytes);
  const proofStatement = publicValues.subarray(107, 139);
  const proofProjection = publicValues.subarray(178, 210);
  if (hex(proofStatement) !== EXPECTED_STATEMENT || hex(proofProjection) !== EXPECTED_PROJECTION) throw new Error("proof-bound public values layout mismatch");
  const statement = parseStatement(statementBytes);
  const projection = domainHash(PROJECTION_DOMAIN, projectionTranscript(statement, statementCommitment));
  if (hex(projection) !== EXPECTED_PROJECTION || hex(projection) !== hex(proofProjection)) throw new Error("MISMATCHED_PUBLIC_FIXTURE: transaction and proof projections differ");
  return { statement, statementCommitment, projection };
}

function buildSpend(statement, statementCommitment, projection, covenant) {
  const redeem = bin(covenant.redeemHex);
  const transaction = {
    version: statement.version,
    locktime: statement.locktime,
    inputs: statement.inputs.map((input, index) => ({
      // APNTTSV1 stores this field in wire order; Libauth accepts display order
      // and reverses it when encoding the transaction.
      outpointTransactionHash: Uint8Array.from(input.outpointTransactionHash).reverse(),
      outpointIndex: input.outpointIndex,
      sequenceNumber: input.sequenceNumber,
      unlockingBytecode: index === statement.designatedVerifierInputIndex ? push(redeem) : new Uint8Array(),
    })),
    outputs: statement.outputs.map((output) => {
      const lockingBytecode = Uint8Array.from(output.lockingBytecodeTemplate);
      if (output.statementCommitmentOffset !== null) lockingBytecode.set(statementCommitment, output.statementCommitmentOffset);
      return { lockingBytecode, valueSatoshis: output.valueSatoshis };
    }),
  };
  const sourceOutputs = statement.inputs.map((input, index) => index === statement.designatedVerifierInputIndex
    ? {
      lockingBytecode: encodeLockingBytecodeP2sh32(sha256(sha256(redeem))),
      valueSatoshis: input.valueSatoshis,
      token: { amount: 0n, category: new Uint8Array(32).fill(0x11), nft: { capability: "none", commitment: Uint8Array.from(projection) } },
    }
    : { lockingBytecode: Uint8Array.from(input.lockingBytecode), valueSatoshis: input.valueSatoshis });
  return { inputIndex: statement.designatedVerifierInputIndex, sourceOutputs, transaction };
}

function evaluate(candidate) {
  const state = createVirtualMachineBch2026(false).evaluate(candidate);
  const top = state.stack.at(-1);
  const accepted = state.error === undefined && state.stack.length === 1 && top?.length === 1 && top[0] === 1;
  return { accepted, error: state.error ?? null, top: top === undefined ? null : hex(top), stackDepth: state.stack.length };
}

function reject(code, exit, detail) {
  process.stderr.write(`${code}: ${detail}\n`);
  process.exit(exit);
}

function main(argv) {
  const allowed = ["--tamper-proof", "--tamper-verdict", "--tamper-source", "--tamper-locking", "--mismatch-fixture"];
  if (argv.length > 1 || (argv[0] !== undefined && !allowed.includes(argv[0]))) throw new Error(`unsupported argument ${String(argv[0])}`);
  const mode = argv[0] ?? "pass";
  const proofDocument = readPinned("proof");
  const vectors = readPinned("vectors");
  const covenant = readPinned("covenant");
  const key = readPinned("key");
  const proof = proofDocument;
  const vector = vectors.vectors.find((entry) => entry.id === (mode === "--mismatch-fixture" ? "private-split-flat-aggregator-service-fee" : "private-split"));
  if (vector === undefined) throw new Error("selected public vector is missing");
  let bindings;
  try { bindings = publicBindings(proof, vector); } catch (error) {
    if (mode === "--mismatch-fixture") reject("MISMATCHED_PUBLIC_FIXTURE", 7, error.message);
    throw error;
  }
  const proofPublicValues = Uint8Array.from(bin(proof.publicValuesBytes));
  if (mode === "--tamper-proof") proofPublicValues[178] ^= 1;
  const pairing = verifyGroth16Envelope({
    proofBytesHex: proof.proofBytes,
    publicValuesBytesHex: hex(proofPublicValues),
    programVkeyHash: proof.programVkeyHash,
    keyDocument: key,
  });
  if (mode === "--tamper-proof") {
    if (pairing) reject("PROOF_TAMPER_UNEXPECTED_ACCEPTANCE", 8, "changed public value verified");
    reject("PROOF_BINDING_REJECTED", 3, `publicValues[178] ${proof.publicValuesBytes.slice(356, 358)} -> ${hex(proofPublicValues).slice(356, 358)}; BN254 pairing rejected`);
  }
  if (!pairing) throw new Error("released proof pairing rejected");
  const candidate = buildSpend(bindings.statement, bindings.statementCommitment, bindings.projection, covenant);
  if (mode === "--tamper-verdict") candidate.sourceOutputs[candidate.inputIndex].token.nft.commitment[0] ^= 1;
  if (mode === "--tamper-source") candidate.sourceOutputs.find((_value, index) => index !== candidate.inputIndex).valueSatoshis += 1n;
  if (mode === "--tamper-locking") candidate.sourceOutputs[candidate.inputIndex].lockingBytecode[2] ^= 1;
  const result = evaluate(candidate);
  if (mode !== "pass") {
    const failures = {
      "--tamper-verdict": ["VERDICT_COMMITMENT_REJECTED", 4, `${EXPECTED_PROJECTION.slice(0, 2)} -> ${hex(candidate.sourceOutputs[candidate.inputIndex].token.nft.commitment).slice(0, 2)}; SAC projection equality failed`],
      "--tamper-source": ["SOURCE_OUTPUT_REJECTED", 5, `covered source value changed by 1 satoshi; SAC transaction projection failed`],
      "--tamper-locking": ["LOCKING_BYTECODE_REJECTED", 6, "P2SH32 redeem hash no longer matches the released SAC"],
    };
    const [code, exit, detail] = failures[mode];
    if (result.accepted) reject(`${code}_UNEXPECTED_ACCEPTANCE`, 8, detail);
    reject(code, exit, `${detail}; raw=${result.error ?? `top:${result.top ?? "empty"}`}`);
  }
  if (!result.accepted) throw new Error(`released SAC rejected reconstructed transaction: ${JSON.stringify({ result, inputIndex: candidate.inputIndex, inputValues: candidate.sourceOutputs.map((output) => String(output.valueSatoshis)), outputs: candidate.transaction.outputs.map((output) => String(output.valueSatoshis)) })}`);
  const transactionBytes = encodeTransactionBch(candidate.transaction).length;
  process.stdout.write([
    "PROOF_BOUND_CASHVM_LAB: PASS",
    `proof: ${PATHS.proof}`,
    `proof sha256: ${proof.proofSha256}`,
    `proof bytes: ${String(proof.proofBytesLength)}`,
    "BN254 pairing verified: true",
    `statement commitment: ${hex(bindings.statementCommitment)}`,
    `settlement projection: ${hex(bindings.projection)}`,
    "proof and transaction projection match: true",
    "verdict authentication: synthetic stand-in (production verifier graph not executed here)",
    "VM: @bitauth/libauth 3.1.0-next.8 / BCH_2026_05 consensus",
    `transaction bytes: ${String(transactionBytes)}`,
    "settlement covenant accepted: true",
    `recorded proof generation: ${String(proof.endToEndProofGenerationDurationMs)} ms (one artifact, not a benchmark)`,
    `recorded native verification: ${String(proof.nativeVerificationDurationMicros)} microseconds (artifact metadata)`,
    "non-claim: no authenticated-verifier re-execution, funding, signing, relay, mining, wallet acceptance, or spendability",
  ].join("\n") + "\n");
}

try { main(process.argv.slice(2)); } catch (error) {
  process.stderr.write(`PROOF_BOUND_LAB_REJECTED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

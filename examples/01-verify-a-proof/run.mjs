#!/usr/bin/env node

// Dependency-free, complete BN254 Groth16 verification for the published V4
// fixture. The implementation intentionally uses a reduced Tate pairing rather
// than the private repository's verifier implementation. Any non-zero result
// is derived by this process from the public proof, public values and key.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = resolve(HERE, "..", "..");
const FIXTURE_RELATIVE = "tools/apnt-import-created-note-sp1/fixtures/canonical-groth16-proof-v4.json";
const SOURCE_CANDIDATE = resolve(HERE, "..", "..", "..", "..", "..");
const EVIDENCE_ROOT = existsSync(join(PUBLIC_ROOT, FIXTURE_RELATIVE)) ? PUBLIC_ROOT : SOURCE_CANDIDATE;
const FIXTURE_PATH = join(EVIDENCE_ROOT, FIXTURE_RELATIVE);
const KEY_RELATIVE = "examples/01-verify-a-proof/verification-key.json";
const KEY_PATH = join(PUBLIC_ROOT, KEY_RELATIVE);

const EXPECTED_FIXTURE_SHA256 = "c23e9166b85d4ebe34ba5b820c06a674c4fecaed4b0db0ec375fa35e8c06613a";
const EXPECTED_PROOF_SHA256 = "92ebd58fe4b8e39dc5655b442e2dcf6968d08c612c88b1223f338c30d44391cd";
const EXPECTED_PUBLIC_VALUES_SHA256 = "817a73ecb25d27f62d804a8b463b49cdfa366112869e191a7a66d0a73e737f6f";
const EXPECTED_KEY_SHA256 = "4388a21c687fdd5f218d7e3d13190cac4c5355818d3605fd5fb811df468ee696";
const EXPECTED_SELECTOR = "4388a21c";
const EXPECTED_RELATION = "apnt-import-created-note-relation-v4";
const EXPECTED_DOMAIN = "bch-cloak-apnt-v0:import-created-note-relation-v4";
const EXPECTED_PROGRAM_VKEY = "007de2035d65f1dd58a3cf0c930fde5c7c7c99443b26fc30c2cd7f26014a74b1";
const PROOF_BYTES = 356;

// alt_bn128 / BN254 base and scalar fields.
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const FINAL_EXPONENT = (P ** 12n - 1n) / R;

const mod = (value) => {
  const result = value % P;
  return result < 0n ? result + P : result;
};
const fAdd = (a, b) => {
  const value = a + b;
  return value >= P ? value - P : value;
};
const fSub = (a, b) => (a >= b ? a - b : P - (b - a));
const fNeg = (a) => (a === 0n ? 0n : P - a);
const fMul = (a, b) => (a * b) % P;
const fSqr = (a) => (a * a) % P;
function fPow(base, exponent) {
  let result = 1n;
  let factor = base;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = fMul(result, factor);
    factor = fSqr(factor);
    power >>= 1n;
  }
  return result;
}
const fInv = (value) => {
  if (value === 0n) throw new Error("division by zero");
  return fPow(value, P - 2n);
};
function fSqrt(value) {
  const root = fPow(value, (P + 1n) >> 2n);
  return fSqr(root) === value ? root : null;
}

// Fp2 = Fp[u]/(u^2 + 1), represented [c0, c1].
const F2_ZERO = [0n, 0n];
const F2_ONE = [1n, 0n];
const f2 = (a = 0n, b = 0n) => [a, b];
const f2Add = (x, y) => [fAdd(x[0], y[0]), fAdd(x[1], y[1])];
const f2Sub = (x, y) => [fSub(x[0], y[0]), fSub(x[1], y[1])];
const f2Neg = (x) => [fNeg(x[0]), fNeg(x[1])];
const f2Eq = (x, y) => x[0] === y[0] && x[1] === y[1];
const f2IsZero = (x) => x[0] === 0n && x[1] === 0n;
const f2Mul = (x, y) => [
  fSub(fMul(x[0], y[0]), fMul(x[1], y[1])),
  fAdd(fMul(x[0], y[1]), fMul(x[1], y[0])),
];
const f2Sqr = (x) => f2Mul(x, x);
const f2MulFp = (x, scalar) => [fMul(x[0], scalar), fMul(x[1], scalar)];
function f2Inv(x) {
  const denominator = fInv(fAdd(fSqr(x[0]), fSqr(x[1])));
  return [fMul(x[0], denominator), fNeg(fMul(x[1], denominator))];
}
const f2Div = (x, y) => f2Mul(x, f2Inv(y));
function f2Sqrt(value) {
  if (f2IsZero(value)) return F2_ZERO;
  if (value[1] === 0n) {
    const real = fSqrt(value[0]);
    if (real !== null) return [real, 0n];
    const imaginary = fSqrt(fNeg(value[0]));
    return imaginary === null ? null : [0n, imaginary];
  }
  const norm = fSqrt(fAdd(fSqr(value[0]), fSqr(value[1])));
  if (norm === null) return null;
  const inv2 = (P + 1n) >> 1n;
  let real = fSqrt(fMul(fAdd(value[0], norm), inv2));
  if (real === null) real = fSqrt(fMul(fSub(value[0], norm), inv2));
  if (real === null || real === 0n) return null;
  const root = [real, fMul(value[1], fInv(fAdd(real, real)))];
  return f2Eq(f2Sqr(root), value) ? root : null;
}

// Fp6 = Fp2[v]/(v^3 - (9 + u)), represented [c0, c1, c2].
const XI = f2(9n, 1n);
const F6_ZERO = [F2_ZERO, F2_ZERO, F2_ZERO];
const F6_ONE = [F2_ONE, F2_ZERO, F2_ZERO];
const f6 = (a = F2_ZERO, b = F2_ZERO, c = F2_ZERO) => [a, b, c];
const f6Add = (x, y) => [f2Add(x[0], y[0]), f2Add(x[1], y[1]), f2Add(x[2], y[2])];
const f6Sub = (x, y) => [f2Sub(x[0], y[0]), f2Sub(x[1], y[1]), f2Sub(x[2], y[2])];
const f6Neg = (x) => [f2Neg(x[0]), f2Neg(x[1]), f2Neg(x[2])];
const f6Eq = (x, y) => f2Eq(x[0], y[0]) && f2Eq(x[1], y[1]) && f2Eq(x[2], y[2]);
function f6Mul(x, y) {
  return [
    f2Add(f2Mul(x[0], y[0]), f2Mul(XI, f2Add(f2Mul(x[1], y[2]), f2Mul(x[2], y[1])))),
    f2Add(f2Add(f2Mul(x[0], y[1]), f2Mul(x[1], y[0])), f2Mul(XI, f2Mul(x[2], y[2]))),
    f2Add(f2Add(f2Mul(x[0], y[2]), f2Mul(x[1], y[1])), f2Mul(x[2], y[0])),
  ];
}
const f6Sqr = (x) => f6Mul(x, x);
const f6MulByV = (x) => [f2Mul(XI, x[2]), x[0], x[1]];
function f6Inv(x) {
  const t0 = f2Sub(f2Sqr(x[0]), f2Mul(XI, f2Mul(x[1], x[2])));
  const t1 = f2Sub(f2Mul(XI, f2Sqr(x[2])), f2Mul(x[0], x[1]));
  const t2 = f2Sub(f2Sqr(x[1]), f2Mul(x[0], x[2]));
  const denominator = f2Inv(f2Add(f2Mul(x[0], t0), f2Mul(XI, f2Add(f2Mul(x[2], t1), f2Mul(x[1], t2)))));
  return [f2Mul(t0, denominator), f2Mul(t1, denominator), f2Mul(t2, denominator)];
}

// Fp12 = Fp6[w]/(w^2 - v), represented [c0, c1].
const F12_ONE = [F6_ONE, F6_ZERO];
const f12Add = (x, y) => [f6Add(x[0], y[0]), f6Add(x[1], y[1])];
const f12Mul = (x, y) => [
  f6Add(f6Mul(x[0], y[0]), f6MulByV(f6Mul(x[1], y[1]))),
  f6Add(f6Mul(x[0], y[1]), f6Mul(x[1], y[0])),
];
const f12Sqr = (x) => f12Mul(x, x);
const f12Eq = (x, y) => f6Eq(x[0], y[0]) && f6Eq(x[1], y[1]);
function f12Pow(base, exponent) {
  let result = F12_ONE;
  let factor = base;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = f12Mul(result, factor);
    factor = f12Sqr(factor);
    power >>= 1n;
  }
  return result;
}

const readBigEndian = (bytes) => {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
};
const fromHex = (hex) => Uint8Array.from(Buffer.from(hex, "hex"));
const toHex = (bytes) => Buffer.from(bytes).toString("hex");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest();
const sha256Hex = (bytes) => sha256(bytes).toString("hex");
const requireField = (value, label) => {
  if (value >= P) throw new Error(`${label} is outside Fp`);
  return value;
};

function decompressG1(bytes, label) {
  const mask = bytes[0] & 0xc0;
  if (mask === 0x40) throw new Error(`${label} is infinity`);
  const unmasked = Uint8Array.from(bytes);
  unmasked[0] &= 0x3f;
  const x = requireField(readBigEndian(unmasked), `${label}.x`);
  const root = fSqrt(fAdd(fMul(fSqr(x), x), 3n));
  if (root === null) throw new Error(`${label} has no curve y`);
  const negated = fNeg(root);
  const y = mask === 0xc0 ? (root > negated ? root : negated) : (root < negated ? root : negated);
  return assertG1({ x, y }, label);
}

function decompressG2(bytes, label) {
  const mask = bytes[0] & 0xc0;
  if (mask === 0x40) throw new Error(`${label} is infinity`);
  const first = Uint8Array.from(bytes.subarray(0, 32));
  first[0] &= 0x3f;
  const x = [
    requireField(readBigEndian(bytes.subarray(32, 64)), `${label}.x.c0`),
    requireField(readBigEndian(first), `${label}.x.c1`),
  ];
  const twistB = f2Div(f2(3n, 0n), XI);
  const root = f2Sqrt(f2Add(f2Mul(f2Sqr(x), x), twistB));
  if (root === null) throw new Error(`${label} has no twist y`);
  const negated = f2Neg(root);
  const larger = (left, right) => left[1] === right[1] ? left[0] > right[0] : left[1] > right[1];
  const y = mask === 0xc0
    ? (larger(root, negated) ? root : negated)
    : (larger(root, negated) ? negated : root);
  return assertG2({ x, y }, label);
}

function assertG1(point, label) {
  if (fSqr(point.y) !== fAdd(fMul(fSqr(point.x), point.x), 3n)) throw new Error(`${label} is not on G1`);
  return point;
}

function assertG2(point, label) {
  const twistB = f2Div(f2(3n, 0n), XI);
  if (!f2Eq(f2Sqr(point.y), f2Add(f2Mul(f2Sqr(point.x), point.x), twistB))) throw new Error(`${label} is not on G2`);
  return point;
}

// Jacobian G1 arithmetic, used for the full six-point IC MSM.
const G1_INFINITY = { x: 0n, y: 1n, z: 0n };
const g1Jacobian = (point) => ({ x: point.x, y: point.y, z: 1n });
function g1Double(point) {
  if (point.z === 0n || point.y === 0n) return G1_INFINITY;
  const a = fSqr(point.x);
  const b = fSqr(point.y);
  const c = fSqr(b);
  const d = fMul(2n, fSub(fSub(fSqr(fAdd(point.x, b)), a), c));
  const e = fMul(3n, a);
  const f = fSqr(e);
  const x = fSub(f, fMul(2n, d));
  const y = fSub(fMul(e, fSub(d, x)), fMul(8n, c));
  const z = fMul(2n, fMul(point.y, point.z));
  return { x, y, z };
}
function g1Add(left, right) {
  if (left.z === 0n) return right;
  if (right.z === 0n) return left;
  const z1z1 = fSqr(left.z);
  const z2z2 = fSqr(right.z);
  const u1 = fMul(left.x, z2z2);
  const u2 = fMul(right.x, z1z1);
  const s1 = fMul(left.y, fMul(right.z, z2z2));
  const s2 = fMul(right.y, fMul(left.z, z1z1));
  if (u1 === u2) return s1 === s2 ? g1Double(left) : G1_INFINITY;
  const h = fSub(u2, u1);
  const i = fSqr(fMul(2n, h));
  const j = fMul(h, i);
  const rr = fMul(2n, fSub(s2, s1));
  const v = fMul(u1, i);
  return {
    x: fSub(fSub(fSqr(rr), j), fMul(2n, v)),
    y: fSub(fMul(rr, fSub(v, fSub(fSub(fSqr(rr), j), fMul(2n, v)))), fMul(2n, fMul(s1, j))),
    z: fMul(fSub(fSub(fSqr(fAdd(left.z, right.z)), z1z1), z2z2), h),
  };
}
function g1Multiply(point, scalar) {
  let result = G1_INFINITY;
  let addend = g1Jacobian(point);
  let value = scalar;
  while (value > 0n) {
    if (value & 1n) result = g1Add(result, addend);
    addend = g1Double(addend);
    value >>= 1n;
  }
  return result;
}
function g1Affine(point) {
  if (point.z === 0n) throw new Error("unexpected G1 infinity");
  const inverse = fInv(point.z);
  const inverse2 = fSqr(inverse);
  return { x: fMul(point.x, inverse2), y: fMul(point.y, fMul(inverse2, inverse)) };
}

function loadKey(document) {
  const bytes = fromHex(document.verificationKeyHex);
  if (bytes.length !== 492 || document.verificationKeyBytes !== 492) throw new Error("verification key length mismatch");
  if (sha256Hex(bytes) !== EXPECTED_KEY_SHA256 || document.verificationKeySha256 !== EXPECTED_KEY_SHA256) throw new Error("verification key digest mismatch");
  if (document.selector !== EXPECTED_SELECTOR) throw new Error("verification key selector mismatch");
  const icCount = Number(readBigEndian(bytes.subarray(288, 292)));
  if (icCount !== 6) throw new Error(`unexpected IC point count ${String(icCount)}`);
  return {
    alpha: decompressG1(bytes.subarray(0, 32), "alpha"),
    beta: decompressG2(bytes.subarray(64, 128), "beta"),
    gamma: decompressG2(bytes.subarray(128, 192), "gamma"),
    delta: decompressG2(bytes.subarray(224, 288), "delta"),
    ic: Array.from({ length: icCount }, (_unused, index) => decompressG1(bytes.subarray(292 + index * 32, 324 + index * 32), `ic${String(index)}`)),
  };
}

function loadProofPoints(bytes) {
  if (bytes.length !== PROOF_BYTES) throw new Error(`proof length is ${String(bytes.length)}, expected ${String(PROOF_BYTES)}`);
  const coordinates = bytes.subarray(100);
  const at = (index) => requireField(readBigEndian(coordinates.subarray(index * 32, (index + 1) * 32)), `proof coordinate ${String(index)}`);
  return {
    a: assertG1({ x: at(0), y: at(1) }, "proof A"),
    b: assertG2({ x: [at(3), at(2)], y: [at(5), at(4)] }, "proof B"),
    c: assertG1({ x: at(6), y: at(7) }, "proof C"),
  };
}

function fullVkx(key, scalars) {
  let result = g1Jacobian(key.ic[0]);
  scalars.forEach((scalar, index) => {
    if (scalar !== 0n) result = g1Add(result, g1Multiply(key.ic[index + 1], scalar));
  });
  return g1Affine(result);
}

function sparseLine(yP, xP, slope, xR, yR) {
  return [
    f6(f2(yP, 0n), F2_ZERO, F2_ZERO),
    f6(f2MulFp(f2Neg(slope), xP), f2Sub(f2Mul(slope, xR), yR), F2_ZERO),
  ];
}

function doubleLine(point, p) {
  const slope = f2Div(f2MulFp(f2Sqr(point.x), 3n), f2MulFp(point.y, 2n));
  const x = f2Sub(f2Sqr(slope), f2MulFp(point.x, 2n));
  const y = f2Sub(f2Mul(slope, f2Sub(point.x, x)), point.y);
  return { point: { x, y }, line: sparseLine(p.y, p.x, slope, point.x, point.y) };
}

function addLine(point, addend, p) {
  if (f2Eq(point.x, addend.x)) {
    if (f2Eq(point.y, addend.y)) return doubleLine(point, p);
    // The last bit of the r-loop adds Q to -Q. Its vertical line is in Fp6,
    // so reduced-pairing denominator elimination permits replacing it by one.
    return { point: null, line: F12_ONE };
  }
  const slope = f2Div(f2Sub(addend.y, point.y), f2Sub(addend.x, point.x));
  const x = f2Sub(f2Sub(f2Sqr(slope), point.x), addend.x);
  const y = f2Sub(f2Mul(slope, f2Sub(point.x, x)), point.y);
  return { point: { x, y }, line: sparseLine(p.y, p.x, slope, point.x, point.y) };
}

function miller(g1, g2) {
  const bits = R.toString(2);
  let value = F12_ONE;
  let point = g2;
  for (let index = 1; index < bits.length; index += 1) {
    const doubled = doubleLine(point, g1);
    value = f12Mul(f12Sqr(value), doubled.line);
    point = doubled.point;
    if (bits[index] === "1") {
      const added = addLine(point, g2, g1);
      value = f12Mul(value, added.line);
      point = added.point;
    }
  }
  if (point !== null) throw new Error("Miller loop did not terminate at infinity");
  return value;
}

function groth16Verifies(key, points, scalars) {
  const vkx = fullVkx(key, scalars);
  const pairings = [
    [{ x: points.a.x, y: fNeg(points.a.y) }, points.b],
    [key.alpha, key.beta],
    [vkx, key.gamma],
    [points.c, key.delta],
  ];
  let product = F12_ONE;
  for (const [g1, g2] of pairings) product = f12Mul(product, miller(g1, g2));
  return f12Eq(f12Pow(product, FINAL_EXPONENT), F12_ONE);
}

/**
 * Verify any released SP1 v6.1.0 Groth16 envelope using the same pinned
 * 492-byte wrapper key as this example. This public helper keeps the pairing
 * implementation in one auditable place; callers still own relation-specific
 * decoding and artifact identity checks.
 */
export function verifyGroth16Envelope({
  proofBytesHex,
  publicValuesBytesHex,
  programVkeyHash,
  keyDocument,
}) {
  const proofBytes = fromHex(proofBytesHex);
  const publicValues = fromHex(publicValuesBytesHex);
  const key = loadKey(keyDocument);
  if (toHex(proofBytes.subarray(0, 4)) !== EXPECTED_SELECTOR) {
    throw new Error("proof selector does not match the pinned key digest");
  }
  const points = loadProofPoints(proofBytes);
  const scalars = [
    readBigEndian(fromHex(programVkeyHash)),
    maskedPublicValuesScalar(publicValues),
    readBigEndian(proofBytes.subarray(4, 36)),
    readBigEndian(proofBytes.subarray(36, 68)),
    readBigEndian(proofBytes.subarray(68, 100)),
  ];
  return groth16Verifies(key, points, scalars);
}

function maskedPublicValuesScalar(bytes) {
  const digest = Uint8Array.from(sha256(bytes));
  digest[0] &= 0x1f;
  return readBigEndian(digest);
}

function decodePublicValues(bytes) {
  const ascii = (start, length) => Buffer.from(bytes.subarray(start, start + length)).toString("ascii");
  const u16le = (offset) => bytes[offset] | (bytes[offset + 1] << 8);
  if (bytes.length !== 235 || ascii(0, 8) !== "APNTIRV4" || bytes[8] !== 4) throw new Error("public values are not canonical APNTIRV4 bytes");
  const domainLength = u16le(9);
  const domain = ascii(11, domainLength);
  let cursor = 11 + domainLength;
  const relationLength = u16le(cursor);
  const relation = ascii(cursor + 2, relationLength);
  cursor += 2 + relationLength;
  const semanticContractOffset = cursor;
  const statementOffset = semanticContractOffset + 33;
  const settlementProjectionOffset = semanticContractOffset + 65;
  if (domain !== EXPECTED_DOMAIN || relation !== EXPECTED_RELATION || settlementProjectionOffset + 32 > bytes.length) throw new Error("public values relation or layout mismatch");
  return { relation, domain, semanticContractOffset, statementOffset, settlementProjectionOffset };
}

const ESTABLISHES = [
  "the published V4 proof's BN254 Groth16 pairing verifies under the pinned 492-byte SP1 wrapper key",
  "the pairing uses five independently re-derived public scalars, including masked SHA-256 of the committed public values",
  "the proof envelope selector matches the separately pinned full verification-key digest",
];
const DOES_NOT_ESTABLISH = [
  "that the selected verification key or proved guest implements the intended APNT semantics",
  "authenticated CashVM execution, BCH consensus validation, chain inclusion, APNT acceptance, wallet acceptance, custody, spendability, or successive transfer",
];

function reportText(report) {
  return [
    "PROOFNOTE_PROOF_VERIFICATION: PASS",
    `artifact: ${report.artifact}`,
    `fixture sha256: ${report.fixtureSha256}`,
    `proof sha256: ${report.proofSha256}`,
    `public values sha256: ${report.publicValuesSha256}`,
    `verification key sha256: ${report.verificationKeySha256}`,
    `selector: ${report.selector}`,
    `relation: ${report.relation}`,
    "pairing executed: true",
    "pairing verified: true",
    "non-claim: no CashVM, chain, wallet, custody, spendability, or successive-transfer result",
  ].join("\n") + "\n";
}

function main(argv) {
  const tamper = argv.includes("--tamper-settlement");
  const json = argv.includes("--json");
  const unknown = argv.find((arg) => !["--tamper-settlement", "--json"].includes(arg));
  if (unknown || (tamper && json)) throw new Error(`unsupported argument ${String(unknown ?? "combination")}`);

  const fixtureBytes = readFileSync(FIXTURE_PATH);
  if (sha256Hex(fixtureBytes) !== EXPECTED_FIXTURE_SHA256) throw new Error("fixture identity mismatch");
  const artifact = JSON.parse(fixtureBytes.toString("utf8"));
  const fixture = artifact.proof;
  if (fixture.relationIdentity !== EXPECTED_RELATION || fixture.relationDomain !== EXPECTED_DOMAIN || fixture.programVkeyHash !== EXPECTED_PROGRAM_VKEY) throw new Error("fixture relation identity mismatch");
  const proofBytes = fromHex(fixture.proofBytes);
  const publicValues = fromHex(fixture.publicValuesBytes);
  if (sha256Hex(proofBytes) !== EXPECTED_PROOF_SHA256 || fixture.proofSha256 !== EXPECTED_PROOF_SHA256) throw new Error("proof identity mismatch");
  if (sha256Hex(publicValues) !== EXPECTED_PUBLIC_VALUES_SHA256 || fixture.publicValuesSha256 !== EXPECTED_PUBLIC_VALUES_SHA256) throw new Error("public-values identity mismatch");
  const decoded = decodePublicValues(publicValues);
  const keyDocument = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  const key = loadKey(keyDocument);
  if (toHex(proofBytes.subarray(0, 4)) !== EXPECTED_SELECTOR) throw new Error("proof selector does not match the pinned key digest");
  const points = loadProofPoints(proofBytes);

  const effectivePublicValues = Uint8Array.from(publicValues);
  if (tamper) effectivePublicValues[decoded.settlementProjectionOffset] ^= 1;
  const scalars = [
    readBigEndian(fromHex(EXPECTED_PROGRAM_VKEY)),
    maskedPublicValuesScalar(effectivePublicValues),
    readBigEndian(proofBytes.subarray(4, 36)),
    readBigEndian(proofBytes.subarray(36, 68)),
    readBigEndian(proofBytes.subarray(68, 100)),
  ];
  const pairingVerified = groth16Verifies(key, points, scalars);
  if (!pairingVerified) {
    const classification = tamper ? "PAIRING_REJECTED" : "PAIRING_UNEXPECTED_REJECTION";
    process.stderr.write(`${classification}: BN254 pairing executed with structurally valid proof points and rejected the ${tamper ? "tampered committed public values" : "published fixture"}\n`);
    process.exit(tamper ? 3 : 1);
  }
  if (tamper) {
    process.stderr.write("PAIRING_UNEXPECTED_ACCEPTANCE: tampered committed public values verified\n");
    process.exit(4);
  }
  const report = {
    schemaVersion: "proofnote-proof-verification-result/1",
    status: "PASS",
    summary: "The published V4 SP1 Groth16 proof verified under the pinned wrapper key using a complete dependency-free BN254 pairing calculation.",
    artifact: FIXTURE_RELATIVE,
    fixtureSha256: EXPECTED_FIXTURE_SHA256,
    proofSha256: EXPECTED_PROOF_SHA256,
    publicValuesSha256: EXPECTED_PUBLIC_VALUES_SHA256,
    verificationKey: KEY_RELATIVE,
    verificationKeySha256: EXPECTED_KEY_SHA256,
    selector: EXPECTED_SELECTOR,
    relation: EXPECTED_RELATION,
    pairingExecuted: true,
    pairingVerified: true,
    executionEnvironment: { runtime: "Node.js >=20.6.0", dependencies: "none", network: "denied" },
    trustAssumptions: keyDocument.authority.trustAssumptions,
    establishes: ESTABLISHES,
    doesNotEstablish: DOES_NOT_ESTABLISH,
  };
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : reportText(report));
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`DECODE_REJECTED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_ROOT = resolve(HERE, "..");
const DEFAULT_EXAMPLES_ROOT = HERE;
const DEFAULT_GUARD_PATH = join(HERE, "offline-guard.mjs");
const REQUIRED_HEADINGS = [
  "## Run",
  "## Expected output",
  "## Tamper or negative controls",
  "## What this establishes",
  "## What this does not establish",
  "## If it fails",
];
const DOT_LOCAL_PATH = new RegExp(
  String.raw`(^|/)\.` + "local" + String.raw`(?:-live|-console|-proof|-probes|-analysis)?(?:/|$)`,
  "u",
);

export class ExampleContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExampleContractError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ExampleContractError(code, message);
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function assertSafeRelativePath(label, value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\")) {
    fail("EXAMPLE_UNSAFE_PATH", `${label} must be a non-empty repository-relative POSIX path`);
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail("EXAMPLE_UNSAFE_PATH", `${label} contains an empty, dot, or parent segment`);
  }
  if (
    DOT_LOCAL_PATH.test(value) ||
    /(^|\/)(?:docs-internal|scripts\/live|scripts\/publication|packages\/cloak-console)(?:\/|$)/u.test(value)
  ) {
    fail("EXAMPLE_PRIVATE_SOURCE", `${label} references a source outside the reviewed public tree`);
  }
  return value;
}

export function normalizeOutput(text, rules = []) {
  let normalized = text.replace(/\r\n?/gu, "\n").split("\n").map((line) => line.replace(/[ \t]+$/gu, "")).join("\n");
  for (const rule of rules) {
    if (rule === "duration-ms") normalized = normalized.replace(/\b\d+(?:\.\d+)? ms\b/gu, "<measured-ms>");
    else if (rule === "temporary-path") normalized = normalized.replace(/(?:\/private)?\/tmp\/[A-Za-z0-9._/-]+/gu, "<temporary-path>");
    else fail("EXAMPLE_NORMALIZER_UNSUPPORTED", `unsupported normalization rule ${String(rule)}`);
  }
  return `${normalized.replace(/\n+$/u, "")}\n`;
}

function loadJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(code, `${path}: ${error.message}`);
  }
}

function discoverExampleDirectories(examplesRoot) {
  if (!existsSync(examplesRoot)) fail("EXAMPLE_ROOT_MISSING", `examples root does not exist: ${examplesRoot}`);
  return readdirSync(examplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(examplesRoot, entry.name, "example.json")))
    .map((entry) => join(examplesRoot, entry.name))
    .sort();
}

function manifestPublicPaths(publicRoot) {
  const path = join(publicRoot, "export-manifest.json");
  if (!existsSync(path)) return null;
  const manifest = loadJson(path, "EXAMPLE_EXPORT_MANIFEST_INVALID");
  return new Set([
    ...(manifest.files ?? []).map((entry) => entry.publicPath),
    ...(manifest.generation?.buildGate?.generatedLockfile ? [manifest.generation.buildGate.generatedLockfile.publicPath] : []),
    "export-manifest.json",
  ]);
}

function sourcePublicationView(publicRoot) {
  const sourceRoot = resolve(publicRoot, "..", "..", "..");
  const allowlistPath = join(sourceRoot, "scripts", "public-export", "allowlist.json");
  if (!existsSync(allowlistPath)) return null;
  const allowlist = loadJson(allowlistPath, "EXAMPLE_ALLOWLIST_INVALID");
  const sourceByPublic = new Map();
  for (const category of allowlist.categories ?? []) {
    for (const sourcePath of category.paths ?? []) {
      sourceByPublic.set(allowlist.pathMap?.[sourcePath] ?? sourcePath, sourcePath);
    }
  }
  return { sourceRoot, sourceByPublic };
}

function readManifest(exampleDir) {
  const path = join(exampleDir, "example.json");
  const manifest = loadJson(path, "EXAMPLE_MANIFEST_INVALID");
  if (manifest.schemaVersion !== "proofnote-example/1") fail("EXAMPLE_SCHEMA", `${path}: unsupported schema`);
  if (!/^[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(manifest.id ?? "")) fail("EXAMPLE_ID", `${path}: invalid id`);
  if (!Array.isArray(manifest.features) || manifest.features.length === 0) fail("EXAMPLE_FEATURES", `${manifest.id}: features must be non-empty`);
  if (!Array.isArray(manifest.establishes) || manifest.establishes.length === 0) fail("EXAMPLE_ESTABLISHES", `${manifest.id}: establishes must be non-empty`);
  if (!Array.isArray(manifest.doesNotEstablish) || manifest.doesNotEstablish.length === 0) fail("EXAMPLE_NONCLAIMS", `${manifest.id}: doesNotEstablish must be non-empty`);
  if (!manifest.authority?.evidenceIdentity || !manifest.authority?.executionEnvironment || !Array.isArray(manifest.authority?.trustAssumptions)) {
    fail("EXAMPLE_AUTHORITY", `${manifest.id}: authority must name evidence identity, execution environment, and trust assumptions`);
  }
  if (!["runnable", "blocked"].includes(manifest.status)) fail("EXAMPLE_STATUS", `${manifest.id}: status must be runnable or blocked`);
  return { manifest, path };
}

function runNode(publicRoot, guardPath, runner, args, offline) {
  const nodeArgs = [...(offline ? ["--import", guardPath] : []), runner, ...args];
  return spawnSync(process.execPath, nodeArgs, {
    cwd: publicRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH ?? "",
      NODE_PATH: "",
      PROOFNOTE_EXAMPLE_CONFORMANCE: "1",
    },
    maxBuffer: 32 * 1024 * 1024,
  });
}

function validateBlocked(exampleDir, manifest) {
  if (manifest.runner !== null || manifest.expectedOutput !== null || (manifest.negativeControls ?? []).length !== 0) {
    fail("EXAMPLE_BLOCKED_RUNNER", `${manifest.id}: blocked examples must have no runner, expected output, or negative control`);
  }
  if (existsSync(join(exampleDir, "run.mjs"))) fail("EXAMPLE_BLOCKED_RUNNER", `${manifest.id}: blocked example ships run.mjs`);
  if (!Array.isArray(manifest.blockers) || manifest.blockers.length === 0) fail("EXAMPLE_BLOCKERS", `${manifest.id}: blocked example must enumerate blockers`);
  return { id: manifest.id, status: "blocked", blockers: manifest.blockers.length };
}

function validateWalkthrough(exampleDir, manifest, publicRoot, guardPath) {
  const walkthrough = manifest.walkthrough;
  if (!walkthrough || !["omitted", "generated"].includes(walkthrough.status)) {
    fail("EXAMPLE_WALKTHROUGH", `${manifest.id}: walkthrough status must be omitted or generated`);
  }
  const handEdited = readdirSync(exampleDir).filter((name) => /(?:\.cast$|^walkthrough\.)/u.test(name));
  if (walkthrough.status === "omitted") {
    if (handEdited.length > 0) fail("EXAMPLE_WALKTHROUGH_DRIFT", `${manifest.id}: walkthrough is declared omitted but an artifact exists`);
    return "omitted";
  }
  assertSafeRelativePath(`${manifest.id}.walkthrough.path`, walkthrough.path);
  if (!Array.isArray(walkthrough.generatorArgs) || walkthrough.generatorArgs.some((arg) => typeof arg !== "string")) {
    fail("EXAMPLE_WALKTHROUGH", `${manifest.id}: generated walkthrough needs generatorArgs`);
  }
  const artifactPath = join(exampleDir, walkthrough.path);
  if (!existsSync(artifactPath)) fail("EXAMPLE_WALKTHROUGH_MISSING", `${manifest.id}: generated walkthrough is missing`);
  const generated = runNode(publicRoot, guardPath, manifest.runner, walkthrough.generatorArgs, manifest.offline);
  if (generated.status !== 0) fail("EXAMPLE_WALKTHROUGH_GENERATOR", `${manifest.id}: walkthrough generator failed`);
  if (Buffer.from(generated.stdout).compare(readFileSync(artifactPath)) !== 0 || sha256(readFileSync(artifactPath)) !== walkthrough.sha256) {
    fail("EXAMPLE_WALKTHROUGH_DRIFT", `${manifest.id}: walkthrough is not byte-identical to runner output`);
  }
  return "generated";
}

function validateRunnable(exampleDir, manifest, options) {
  if (manifest.offline !== true && manifest.offline !== false) fail("EXAMPLE_OFFLINE_DECLARATION", `${manifest.id}: offline must be boolean`);
  for (const key of ["readme", "runner", "expectedOutput"]) assertSafeRelativePath(`${manifest.id}.${key}`, manifest[key]);
  if (manifest.readme !== "README.md") fail("EXAMPLE_README", `${manifest.id}: readme must be README.md`);

  const readmePath = join(exampleDir, manifest.readme);
  const runnerPath = join(options.publicRoot, manifest.runner);
  const expectedPath = join(exampleDir, manifest.expectedOutput);
  for (const [label, path] of [["README", readmePath], ["runner", runnerPath], ["expected output", expectedPath]]) {
    if (!existsSync(path)) fail("EXAMPLE_REQUIRED_FILE_MISSING", `${manifest.id}: ${label} is missing`);
  }

  const readme = readFileSync(readmePath, "utf8");
  let lastIndex = -1;
  for (const heading of REQUIRED_HEADINGS) {
    const index = readme.indexOf(heading);
    if (index <= lastIndex) fail("EXAMPLE_README_CONTRACT", `${manifest.id}: missing or misordered ${heading}`);
    lastIndex = index;
  }
  if (!Array.isArray(manifest.documentedCommands) || manifest.documentedCommands.length === 0) {
    fail("EXAMPLE_DOCUMENTED_COMMANDS", `${manifest.id}: documentedCommands must be non-empty`);
  }
  lastIndex = -1;
  for (const command of manifest.documentedCommands) {
    const index = readme.indexOf(command, lastIndex + 1);
    if (index === -1) fail("EXAMPLE_DOCUMENTED_COMMANDS", `${manifest.id}: README omits documented command ${command}`);
    lastIndex = index;
  }

  const publishedPaths = options.publishedPaths;
  for (const input of manifest.inputs ?? []) {
    if (input.source !== "published") fail("EXAMPLE_PRIVATE_SOURCE", `${manifest.id}: every input source must be published`);
    const rel = assertSafeRelativePath(`${manifest.id}.inputs.path`, input.path);
    let full = join(options.publicRoot, rel);
    let containmentRoot = options.publicRoot;
    if (!existsSync(full) && options.sourcePublication?.sourceByPublic.has(rel)) {
      containmentRoot = options.sourcePublication.sourceRoot;
      full = join(containmentRoot, options.sourcePublication.sourceByPublic.get(rel));
    }
    const escaped = relative(containmentRoot, full).startsWith(`..${sep}`);
    if (escaped || !existsSync(full)) fail("EXAMPLE_INPUT_MISSING", `${manifest.id}: input is absent from the public tree: ${rel}`);
    if (publishedPaths !== null && !publishedPaths.has(rel)) fail("EXAMPLE_INPUT_UNLISTED", `${manifest.id}: input is absent from export-manifest.json: ${rel}`);
    if (!/^[0-9a-f]{64}$/u.test(input.sha256 ?? "") || sha256(readFileSync(full)) !== input.sha256) {
      fail("EXAMPLE_INPUT_IDENTITY", `${manifest.id}: input digest mismatch: ${rel}`);
    }
  }

  const positive = runNode(options.publicRoot, options.guardPath, manifest.runner, manifest.runnerArgs ?? [], manifest.offline);
  if (positive.status !== 0) {
    const offlineAttempt = `${positive.stdout}${positive.stderr}`.includes("PROOFNOTE_OFFLINE_NETWORK_DENIED");
    fail(offlineAttempt ? "EXAMPLE_OFFLINE_VIOLATION" : "EXAMPLE_RUNNER_FAILED", `${manifest.id}: positive runner exited ${String(positive.status)}`);
  }
  const observed = normalizeOutput(positive.stdout, manifest.normalization ?? []);
  const expected = normalizeOutput(readFileSync(expectedPath, "utf8"), manifest.normalization ?? []);
  if (observed !== expected) fail("EXAMPLE_OUTPUT_DRIFT", `${manifest.id}: normalized output differs from ${manifest.expectedOutput}`);

  if (!Array.isArray(manifest.negativeControls) || manifest.negativeControls.length === 0) {
    fail("EXAMPLE_NEGATIVE_CONTROLS", `${manifest.id}: at least one negative control is required`);
  }
  const negatives = [];
  for (const control of manifest.negativeControls) {
    if (!Array.isArray(control.args) || control.args.some((arg) => typeof arg !== "string")) fail("EXAMPLE_NEGATIVE_CONTROL", `${manifest.id}/${control.id}: args must be strings`);
    if (!Number.isInteger(control.expectedExit) || control.expectedExit === 0 || !control.failureClass) fail("EXAMPLE_NEGATIVE_CONTROL", `${manifest.id}/${control.id}: expectedExit and failureClass are required`);
    const result = runNode(options.publicRoot, options.guardPath, manifest.runner, control.args, manifest.offline);
    if (result.status !== control.expectedExit || !`${result.stdout}${result.stderr}`.includes(control.failureClass)) {
      fail("EXAMPLE_NEGATIVE_CONTROL_FAILED", `${manifest.id}/${control.id}: expected exit ${String(control.expectedExit)} and ${control.failureClass}`);
    }
    negatives.push({ id: control.id, failureClass: control.failureClass });
  }

  return {
    id: manifest.id,
    status: "runnable",
    output: "matched",
    negatives,
    offline: manifest.offline,
    walkthrough: validateWalkthrough(exampleDir, manifest, options.publicRoot, options.guardPath),
  };
}

export function validateExamples({
  publicRoot = DEFAULT_PUBLIC_ROOT,
  examplesRoot = DEFAULT_EXAMPLES_ROOT,
  guardPath = DEFAULT_GUARD_PATH,
} = {}) {
  const sourcePublication = sourcePublicationView(publicRoot);
  const publishedPaths = manifestPublicPaths(publicRoot) ?? (sourcePublication ? new Set(sourcePublication.sourceByPublic.keys()) : null);
  const ids = new Set();
  const examples = [];
  for (const exampleDir of discoverExampleDirectories(examplesRoot)) {
    const { manifest } = readManifest(exampleDir);
    if (ids.has(manifest.id)) fail("EXAMPLE_DUPLICATE_ID", `duplicate example id ${manifest.id}`);
    ids.add(manifest.id);
    examples.push(manifest.status === "blocked"
      ? validateBlocked(exampleDir, manifest)
      : validateRunnable(exampleDir, manifest, { publicRoot, guardPath, publishedPaths, sourcePublication }));
  }
  return examples;
}

function writeSelfTestTree(root, runnerSource) {
  const exampleDir = join(root, "examples", "00-contract-self-test");
  mkdirSync(exampleDir, { recursive: true });
  writeFileSync(join(exampleDir, "README.md"), [
    "# Contract self-test",
    "",
    "## Run",
    "`node examples/00-contract-self-test/run.mjs`",
    "",
    "## Expected output",
    "`expected-output.txt`",
    "",
    "## Tamper or negative controls",
    "`node examples/00-contract-self-test/run.mjs --reject`",
    "",
    "## What this establishes",
    "The contract runner was executed.",
    "",
    "## What this does not establish",
    "It does not verify a Proofnote artifact.",
    "",
    "## If it fails",
    "Read the stable failure class.",
    "",
  ].join("\n"));
  writeFileSync(join(exampleDir, "run.mjs"), runnerSource);
  writeFileSync(join(exampleDir, "expected-output.txt"), "CONTRACT_SELF_TEST_PASS\n");
  const manifest = {
    schemaVersion: "proofnote-example/1",
    id: "00-contract-self-test",
    title: "Contract self-test",
    status: "runnable",
    features: ["contract"],
    offline: true,
    readme: "README.md",
    runner: "examples/00-contract-self-test/run.mjs",
    runnerArgs: [],
    expectedOutput: "expected-output.txt",
    documentedCommands: ["node examples/00-contract-self-test/run.mjs", "node examples/00-contract-self-test/run.mjs --reject"],
    inputs: [],
    normalization: [],
    negativeControls: [{ id: "reject", args: ["--reject"], expectedExit: 7, failureClass: "CONTRACT_SELF_TEST_REJECT" }],
    walkthrough: { status: "omitted" },
    establishes: ["the synthetic runner executed"],
    doesNotEstablish: ["any Proofnote artifact property"],
    authority: {
      evidenceIdentity: "synthetic-conformance-self-test",
      executionEnvironment: "bare Node.js with offline guard",
      trustAssumptions: ["none beyond the local test process"],
    },
  };
  writeFileSync(join(exampleDir, "example.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { exampleDir, manifest };
}

export function runSelfTests({ guardPath = DEFAULT_GUARD_PATH } = {}) {
  const root = mkdtempSync(join(resolve(tmpdir()), "proofnote-example-contract-"));
  try {
    const runnerSource = "if (process.argv.includes('--reject')) { console.error('CONTRACT_SELF_TEST_REJECT'); process.exit(7); }\nconsole.log('CONTRACT_SELF_TEST_PASS');\n";
    const { exampleDir, manifest } = writeSelfTestTree(root, runnerSource);
    const valid = validateExamples({ publicRoot: root, examplesRoot: join(root, "examples"), guardPath });
    if (valid.length !== 1 || valid[0].status !== "runnable") fail("EXAMPLE_SELF_TEST", "valid synthetic example did not pass");

    const planted = structuredClone(manifest);
    planted.inputs = [{ source: "published", path: `${"."}${"local-live"}/PLANTED-NOT-REAL.json`, sha256: "0".repeat(64) }];
    writeFileSync(join(exampleDir, "example.json"), `${JSON.stringify(planted, null, 2)}\n`);
    let contractViolation = null;
    try {
      validateExamples({ publicRoot: root, examplesRoot: join(root, "examples"), guardPath });
    } catch (error) {
      contractViolation = error instanceof ExampleContractError ? error.code : "UNEXPECTED";
    }
    if (contractViolation !== "EXAMPLE_PRIVATE_SOURCE") fail("EXAMPLE_SELF_TEST", `planted source violation observed ${String(contractViolation)}`);

    writeFileSync(join(exampleDir, "example.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(exampleDir, "run.mjs"), "await fetch('https://example.invalid/');\n");
    let offlineViolation = null;
    try {
      validateExamples({ publicRoot: root, examplesRoot: join(root, "examples"), guardPath });
    } catch (error) {
      offlineViolation = error instanceof ExampleContractError ? error.code : "UNEXPECTED";
    }
    if (offlineViolation !== "EXAMPLE_OFFLINE_VIOLATION") fail("EXAMPLE_SELF_TEST", `offline guard observed ${String(offlineViolation)}`);

    return {
      validContract: "PASS",
      plantedContractViolation: contractViolation,
      plantedOfflineViolation: offlineViolation,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function runCli(argv) {
  const rootArg = argv.find((arg) => arg.startsWith("--root="));
  const unknown = argv.find((arg) => arg !== "--json" && !arg.startsWith("--root="));
  if (unknown) fail("EXAMPLE_ARGUMENT", `unknown argument ${unknown}`);
  const publicRoot = rootArg ? resolve(rootArg.slice("--root=".length)) : DEFAULT_PUBLIC_ROOT;
  const examplesRoot = join(publicRoot, "examples");
  const guardPath = join(examplesRoot, "offline-guard.mjs");
  const selfTests = runSelfTests({ guardPath: DEFAULT_GUARD_PATH });
  const examples = validateExamples({ publicRoot, examplesRoot, guardPath });
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "proofnote-example-conformance-result/1",
    status: "PASS",
    examples,
    runnableExamples: examples.filter((entry) => entry.status === "runnable").length,
    blockedExamples: examples.filter((entry) => entry.status === "blocked").length,
    selfTests,
    establishes: ["every discovered runnable example matched normalized expected output", "every declared negative control failed with its expected class", "the planted contract and offline violations were observed"],
    doesNotEstablish: ["proof validity unless a discovered example actually runs a proof verifier", "chain inclusion, wallet acceptance, or spendability"],
    executionEnvironment: { runtime: process.version, platform: process.platform, arch: process.arch, network: "denied for offline runners" },
  }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ExampleContractError) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

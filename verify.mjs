#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MATRIX_PATH = join(HERE, "verification-matrix.json");
const CAPABILITIES_PATH = join(HERE, "verification-capabilities.json");
const PACKAGE_PATH = join(HERE, "package.json");
const RUNNABLE = "runnable";
const NON_RUNNABLE = new Set(["planned", "blocked", "operator-gated"]);

export class VerificationInterfaceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VerificationInterfaceError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new VerificationInterfaceError(code, message);
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entrySha256 = (entry) => sha256(Buffer.from(JSON.stringify(entry), "utf8"));

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(code, `${path}: ${error.message}`);
  }
}

function defaultEvidenceRoot(root) {
  const sourceCandidate = resolve(root, "..", "..", "..");
  return existsSync(join(sourceCandidate, "scripts", "public-export", "public-tree", "verify.mjs"))
    ? sourceCandidate
    : root;
}

export function loadInterfaceArtifacts(root = HERE, evidenceRoot = defaultEvidenceRoot(root)) {
  const matrixPath = join(root, "verification-matrix.json");
  const capabilitiesPath = join(root, "verification-capabilities.json");
  const packagePath = join(root, "package.json");
  for (const path of [matrixPath, capabilitiesPath, packagePath]) {
    if (!existsSync(path)) fail("VERIFY_ARTIFACT_MISSING", `required interface artifact is missing: ${path}`);
  }
  const matrixBytes = readFileSync(matrixPath);
  let sourceByPublic = null;
  const allowlistPath = join(evidenceRoot, "scripts", "public-export", "allowlist.json");
  if (evidenceRoot !== root && existsSync(allowlistPath)) {
    const allowlist = readJson(allowlistPath, "VERIFY_ALLOWLIST_INVALID");
    sourceByPublic = new Map();
    for (const category of allowlist.categories ?? []) {
      for (const sourcePath of category.paths ?? []) sourceByPublic.set(allowlist.pathMap?.[sourcePath] ?? sourcePath, sourcePath);
    }
  }
  return {
    matrix: readJson(matrixPath, "VERIFY_MATRIX_INVALID"),
    matrixBytes,
    capabilities: readJson(capabilitiesPath, "VERIFY_CAPABILITIES_INVALID"),
    packageJson: readJson(packagePath, "VERIFY_PACKAGE_INVALID"),
    root,
    evidenceRoot,
    sourceByPublic,
  };
}

export function validateInterfaceArtifacts({ matrix, matrixBytes, capabilities, packageJson, root = null, evidenceRoot = root, sourceByPublic = null }) {
  if (matrix.schemaVersion !== "proofnote-verification-matrix/1" || !Array.isArray(matrix.entries)) {
    fail("VERIFY_MATRIX_SCHEMA", "verification matrix schema or entries are invalid");
  }
  if (!Array.isArray(matrix.classes) || new Set(matrix.classes).size !== matrix.classes.length) {
    fail("VERIFY_MATRIX_CLASSES", "verification classes must be a unique array");
  }
  if (capabilities.schemaVersion !== "proofnote-verification-capabilities/1" || !Array.isArray(capabilities.capabilities)) {
    fail("VERIFY_CAPABILITY_SCHEMA", "verification capability schema or records are invalid");
  }
  const observedMatrixSha = sha256(matrixBytes);
  if (capabilities.matrixSha256 !== observedMatrixSha) {
    fail("VERIFY_CAPABILITY_STALE", `capabilities bind ${String(capabilities.matrixSha256)}, matrix is ${observedMatrixSha}`);
  }
  if (packageJson.scripts?.verify !== "node verify.mjs") {
    fail("VERIFY_DISPATCHER_ALIAS", "package.json verify must point only to node verify.mjs");
  }

  const ids = new Set();
  const capabilityById = new Map(capabilities.capabilities.map((record) => [record.id, record]));
  if (capabilityById.size !== capabilities.capabilities.length) fail("VERIFY_CAPABILITY_DUPLICATE", "capability IDs must be unique");
  const runnableIds = new Set();

  for (const entry of matrix.entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id ?? "") || ids.has(entry.id)) {
      fail("VERIFY_MATRIX_ID", `invalid or duplicate matrix ID ${String(entry.id)}`);
    }
    ids.add(entry.id);
    if (!Array.isArray(entry.classes) || entry.classes.length === 0 || entry.classes.some((name) => !matrix.classes.includes(name))) {
      fail("VERIFY_MATRIX_CLASS", `${entry.id} has an empty or unsupported class`);
    }
    if (entry.status === RUNNABLE) {
      runnableIds.add(entry.id);
      if (typeof entry.script !== "string" || typeof entry.implementation !== "string") {
        fail("VERIFY_MATRIX_RUNNABLE", `${entry.id} lacks script or implementation`);
      }
      if (packageJson.scripts?.[entry.script] !== entry.implementation) {
        fail("VERIFY_ALIAS_DRIFT", `${entry.id} matrix implementation differs from package alias ${entry.script}`);
      }
      if (!Array.isArray(entry.evidencePaths) || entry.evidencePaths.length === 0) {
        fail("VERIFY_EVIDENCE_PATHS", `${entry.id} has no evidence paths`);
      }
      if (evidenceRoot !== null) {
        for (const path of entry.evidencePaths) {
          const direct = join(evidenceRoot, path);
          const mapped = sourceByPublic?.get(path);
          if (!existsSync(direct) && (!mapped || !existsSync(join(evidenceRoot, mapped)))) {
            fail("VERIFY_EVIDENCE_MISSING", `${entry.id} evidence path is absent: ${path}`);
          }
        }
      }
      const capability = capabilityById.get(entry.id);
      if (!capability) fail("VERIFY_CAPABILITY_MISSING", `${entry.id} executed no positive capability record`);
      if (capability.status !== RUNNABLE || capability.matrixEntrySha256 !== entrySha256(entry)) {
        fail("VERIFY_CAPABILITY_STALE", `${entry.id} capability does not bind the current matrix entry`);
      }
      if (capability.command !== `pnpm run ${entry.script}` || capability.script !== entry.script) {
        fail("VERIFY_CAPABILITY_COMMAND", `${entry.id} capability command differs from its compatibility alias`);
      }
      if (!capability.evidenceIdentity?.sha256 || !Array.isArray(capability.evidenceIdentity?.files)) {
        fail("VERIFY_CAPABILITY_EVIDENCE", `${entry.id} lacks a generated evidence identity`);
      }
      if (!capability.executionEnvironment?.required || !capability.executionEnvironment?.observed) {
        fail("VERIFY_CAPABILITY_ENVIRONMENT", `${entry.id} lacks required and observed execution environment`);
      }
      if (!Array.isArray(capability.establishes) || capability.establishes.length === 0) {
        fail("VERIFY_CAPABILITY_ESTABLISHES", `${entry.id} lacks establishes language`);
      }
      if (!Array.isArray(capability.doesNotEstablish) || capability.doesNotEstablish.length === 0) {
        fail("VERIFY_CAPABILITY_NONCLAIMS", `${entry.id} lacks does-not-establish language`);
      }
      if (capability.execution?.status !== "passed" || capability.execution?.exitCode !== 0) {
        fail("VERIFY_CAPABILITY_UNEXECUTED", `${entry.id} was not generated from a passing execution`);
      }
    } else {
      if (!NON_RUNNABLE.has(entry.status)) fail("VERIFY_MATRIX_STATUS", `${entry.id} has unsupported status ${String(entry.status)}`);
      if (entry.script !== null || entry.implementation !== null || entry.default !== false) {
        fail("VERIFY_UNSUPPORTED_CAPABILITY", `${entry.id} is unavailable but looks runnable`);
      }
      if (!Array.isArray(entry.blockers) || entry.blockers.length === 0 || !Array.isArray(entry.doesNotEstablish) || entry.doesNotEstablish.length === 0) {
        fail("VERIFY_BLOCKER_INCOMPLETE", `${entry.id} must carry blockers and explicit non-claims`);
      }
      if (capabilityById.has(entry.id)) fail("VERIFY_UNSUPPORTED_CAPABILITY", `${entry.id} has a positive capability while ${entry.status}`);
    }
  }

  for (const id of capabilityById.keys()) {
    if (!runnableIds.has(id)) fail("VERIFY_UNSUPPORTED_CAPABILITY", `positive capability ${id} is absent or unavailable in the matrix`);
  }
  if (![...runnableIds].some((id) => matrix.entries.find((entry) => entry.id === id)?.default === true)) {
    fail("VERIFY_DEFAULT_EMPTY", "at least one runnable default check is required");
  }
  return { status: "PASS", entries: matrix.entries.length, runnable: runnableIds.size, matrixSha256: observedMatrixSha };
}

export function listRecords(artifacts) {
  const capabilityById = new Map(artifacts.capabilities.capabilities.map((record) => [record.id, record]));
  return artifacts.matrix.entries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    classes: entry.classes,
    default: entry.default,
    command: entry.status === RUNNABLE ? capabilityById.get(entry.id)?.command ?? null : null,
    blocker: entry.status === RUNNABLE ? null : entry.blockers,
  }));
}

export function explainRecord(artifacts, id) {
  const entry = artifacts.matrix.entries.find((candidate) => candidate.id === id);
  if (!entry) fail("VERIFY_UNKNOWN_ENTRY", `unknown verification entry ${id}`);
  if (entry.status !== RUNNABLE) {
    return {
      id: entry.id,
      status: entry.status,
      classes: entry.classes,
      evidenceIdentity: { kind: "not-established", value: "no positive capability record" },
      executionEnvironment: "none",
      blockers: entry.blockers,
      establishes: [],
      doesNotEstablish: entry.doesNotEstablish,
    };
  }
  const capability = artifacts.capabilities.capabilities.find((record) => record.id === id);
  return {
    id: entry.id,
    status: entry.status,
    classes: entry.classes,
    command: capability.command,
    evidenceIdentity: capability.evidenceIdentity,
    executionEnvironment: capability.executionEnvironment,
    execution: capability.execution,
    establishes: capability.establishes,
    doesNotEstablish: capability.doesNotEstablish,
  };
}

function textList(records) {
  return `${records.map((entry) => {
    const state = entry.status === RUNNABLE ? "RUNNABLE" : entry.status.toUpperCase();
    return `${state.padEnd(15)} ${entry.id.padEnd(38)} [${entry.classes.join(", ")}]${entry.command ? `  ${entry.command}` : ""}`;
  }).join("\n")}\n`;
}

function textExplain(record) {
  const lines = [
    `${record.id}: ${record.status}`,
    `classes: ${record.classes.join(", ")}`,
    `evidence identity: ${JSON.stringify(record.evidenceIdentity)}`,
    `execution environment: ${JSON.stringify(record.executionEnvironment)}`,
  ];
  if (record.command) lines.push(`command: ${record.command}`);
  if (record.blockers) {
    lines.push("blockers:", ...record.blockers.map((value) => `  - ${value}`));
  }
  lines.push("establishes:", ...(record.establishes.length > 0 ? record.establishes.map((value) => `  - ${value}`) : ["  - nothing"]));
  lines.push("does NOT establish:", ...record.doesNotEstablish.map((value) => `  - ${value}`));
  return `${lines.join("\n")}\n`;
}

function selectEntries(matrix, selector) {
  if (selector === "default") return matrix.entries.filter((entry) => entry.status === RUNNABLE && entry.default === true);
  const byId = matrix.entries.find((entry) => entry.id === selector);
  if (byId) return byId.status === RUNNABLE ? [byId] : [];
  if (!matrix.classes.includes(selector)) fail("VERIFY_UNKNOWN_SELECTION", `unknown verification ID or class ${selector}`);
  return matrix.entries.filter((entry) => entry.status === RUNNABLE && entry.classes.includes(selector));
}

export function runSelection(artifacts, selector = "default", { emit = true } = {}) {
  const entries = selectEntries(artifacts.matrix, selector);
  if (entries.length === 0) fail("VERIFY_SELECTION_UNAVAILABLE", `${selector} has no runnable checks in this checkout`);
  const results = [];
  for (const entry of entries) {
    const result = spawnSync("pnpm", ["run", entry.script], {
      cwd: artifacts.root,
      stdio: emit ? "inherit" : ["ignore", "pipe", "pipe"],
      encoding: emit ? undefined : "utf8",
    });
    results.push({ id: entry.id, script: entry.script, exitCode: result.status });
    if (result.status !== 0) fail("VERIFY_CHECK_FAILED", `${entry.id} exited ${String(result.status)}`);
  }
  return results;
}

export function runCli(argv) {
  const json = argv.includes("--json");
  const args = argv.filter((arg) => arg !== "--json");
  const artifacts = loadInterfaceArtifacts(HERE);
  validateInterfaceArtifacts(artifacts);
  const command = args[0] ?? "run";
  if (command === "list") {
    const records = listRecords(artifacts);
    process.stdout.write(json ? `${JSON.stringify(records, null, 2)}\n` : textList(records));
    return;
  }
  if (command === "explain") {
    if (!args[1] || args.length > 2) fail("VERIFY_ARGUMENT", "usage: verify.mjs explain <id> [--json]");
    const record = explainRecord(artifacts, args[1]);
    process.stdout.write(json ? `${JSON.stringify(record, null, 2)}\n` : textExplain(record));
    return;
  }
  const selector = command === "run" ? (args[1] ?? "default") : command;
  if ((command === "run" && args.length > 2) || (command !== "run" && args.length > 1)) fail("VERIFY_ARGUMENT", "usage: verify.mjs [run] [class-or-id] [--json]");
  const results = runSelection(artifacts, selector, { emit: !json });
  if (json) process.stdout.write(`${JSON.stringify({ status: "PASS", selector, results }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    if (error instanceof VerificationInterfaceError) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

export { CAPABILITIES_PATH, MATRIX_PATH, PACKAGE_PATH, entrySha256, sha256 };

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(HERE, "..", "..", "..");
const IN_PRIVATE_AUTHORITY = existsSync(resolve(SOURCE_ROOT, "scripts", "public-export", "public-tree"));
const PUBLIC_ROOT = IN_PRIVATE_AUTHORITY ? resolve(SOURCE_ROOT, "scripts", "public-export", "public-tree") : resolve(HERE, "..");
const HTML = resolve(PUBLIC_ROOT, "browser-verifier", "proofnote-browser-verifier.html");
const HEADLESS_BINARY = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
const PLAYWRIGHT_CACHE = join(homedir(), "Library", "Caches", "ms-playwright");

function decodeEntities(value) {
  return value.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

/**
 * Return the complete Chromium argument vector for a disposable acceptance run.
 *
 * The installed browser may be running interactively. Supplying an isolated
 * user-data directory is therefore a correctness boundary, not just test
 * hygiene: Chromium otherwise attempts to acquire the user's profile lock.
 */
export function chromiumAcceptanceArguments({ url, profileDirectory }) {
  if (!isAbsolute(profileDirectory)) throw new Error(`CHROMIUM_PROFILE_NOT_ABSOLUTE: ${profileDirectory}`);
  return [
    `--user-data-dir=${profileDirectory}`,
    `--disk-cache-dir=${join(profileDirectory, "Cache")}`,
    `--media-cache-dir=${join(profileDirectory, "Media Cache")}`,
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--disable-extensions",
    "--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--noerrdialogs",
    "--password-store=basic",
    "--use-mock-keychain",
    "--force-prefers-reduced-motion=reduce",
    "--virtual-time-budget=120000",
    "--dump-dom",
    url,
  ];
}

export function isDedicatedChromiumHeadlessRunner(candidatePath) {
  return Boolean(candidatePath) && basename(candidatePath) === HEADLESS_BINARY && !candidatePath.includes(".app/Contents/");
}

export function selectDedicatedChromiumHeadlessRunner({ configuredPath, discoveredPaths = [], pathExists = existsSync } = {}) {
  if (configuredPath) {
    if (!pathExists(configuredPath)) throw new Error(`PROOFNOTE_CHROMIUM_HEADLESS_NOT_FOUND: ${configuredPath}`);
    if (!isDedicatedChromiumHeadlessRunner(configuredPath)) throw new Error(`PROOFNOTE_CHROMIUM_DESKTOP_BINARY_REFUSED: ${configuredPath}`);
    return configuredPath;
  }
  const dedicated = discoveredPaths
    .filter((candidate) => isDedicatedChromiumHeadlessRunner(candidate) && pathExists(candidate))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  return dedicated.at(-1);
}

export function discoverChromiumHeadlessShells(cacheRoot = PLAYWRIGHT_CACHE) {
  if (!existsSync(cacheRoot)) return [];
  return readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const shellRoot = join(cacheRoot, entry.name);
      return readdirSync(shellRoot, { withFileTypes: true })
        .filter((child) => child.isDirectory() && child.name.startsWith("chrome-headless-shell-"))
        .map((child) => join(shellRoot, child.name, HEADLESS_BINARY));
    });
}

export function resolveDedicatedChromiumHeadlessRunner({ configuredPath = process.env.PROOFNOTE_CHROMIUM_HEADLESS, cacheRoot = PLAYWRIGHT_CACHE } = {}) {
  const selected = selectDedicatedChromiumHeadlessRunner({ configuredPath, discoveredPaths: discoverChromiumHeadlessShells(cacheRoot) });
  if (!selected) {
    throw new Error("CHROMIUM_HEADLESS_SHELL_NOT_FOUND: install the Playwright Chromium headless shell or set PROOFNOTE_CHROMIUM_HEADLESS to that dedicated binary; desktop .app Chrome is intentionally refused");
  }
  return selected;
}

export function createDisposableChromiumProfile({ temporaryRoot = tmpdir() } = {}) {
  const profileDirectory = mkdtempSync(join(temporaryRoot, "proofnote-browser-verifier-chromium-"));
  return {
    profileDirectory,
    cleanup() {
      // The directory is freshly allocated above and never derived from a user
      // browser path. Retrying covers Chromium's short process-exit window.
      rmSync(profileDirectory, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 });
    },
  };
}

export function runChromiumAcceptance({ htmlPath = HTML, chromePath = resolveDedicatedChromiumHeadlessRunner() } = {}) {
  if (!isDedicatedChromiumHeadlessRunner(chromePath)) throw new Error(`PROOFNOTE_CHROMIUM_DESKTOP_BINARY_REFUSED: ${chromePath}`);
  if (!existsSync(htmlPath)) throw new Error(`BROWSER_ARTIFACT_MISSING: ${htmlPath}`);
  const url = `${pathToFileURL(htmlPath).href}?acceptance=1`;
  const profile = createDisposableChromiumProfile();
  let result;
  try {
    result = spawnSync(chromePath, chromiumAcceptanceArguments({ url, profileDirectory: profile.profileDirectory }), {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180000,
    });
  } finally {
    profile.cleanup();
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`CHROMIUM_EXECUTION_FAILED: exit ${String(result.status)} signal ${String(result.signal)}\n${result.stderr}`);
  const match = result.stdout.match(/data-acceptance="([^"]+)"/u);
  if (!match) throw new Error(`BROWSER_ACCEPTANCE_MISSING: page did not emit its acceptance record\n${result.stderr}`);
  const payload = JSON.parse(Buffer.from(decodeEntities(match[1]), "base64").toString("utf8"));
  if (payload.expectedMatched !== true) throw new Error(`BROWSER_VERDICT_MISMATCH: ${JSON.stringify(payload.reports)}`);
  if (payload.resourceRequests.length !== 0) throw new Error(`BROWSER_EXTERNAL_REQUEST: ${JSON.stringify(payload.resourceRequests)}`);
  if (payload.nativeButtons !== true) throw new Error("BROWSER_KEYBOARD_CONTROL: interactive controls are not native buttons");
  if (payload.traceComplete !== true) throw new Error("BROWSER_EXECUTION_TRACE: a case omitted its source, location, before/after value, or verification operation");
  if (payload.transientMutationDisclosed !== true) throw new Error("BROWSER_MUTATION_SCOPE: a tamper case did not disclose its in-memory-only mutation boundary");
  if (payload.reducedMotion !== true) throw new Error("BROWSER_REDUCED_MOTION: Chromium did not observe the forced reduced-motion preference");
  const html = readFileSync(htmlPath, "utf8");
  if (!/<noscript>[\s\S]*JavaScript is off\./u.test(html)) throw new Error("BROWSER_NOSCRIPT_FALLBACK: explanatory fallback is missing");
  return {
    schemaVersion: "proofnote-chromium-acceptance/1",
    status: "PASS",
    engine: "Chromium",
    delivery: "file://",
    cases: payload.reports,
    resourceRequests: payload.resourceRequests,
    nativeButtonControls: payload.nativeButtons,
    executionTraceComplete: payload.traceComplete,
    transientMutationDisclosed: payload.transientMutationDisclosed,
    reducedMotionObserved: payload.reducedMotion,
    noJavaScriptFallback: true,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const report = runChromiumAcceptance();
    process.stdout.write(process.argv.includes("--json") ? `${JSON.stringify({
      ...report,
      summary: "The generated self-contained verifier executed the released proof and every declared tamper under file:// in Chromium with zero resource requests.",
      executionEnvironment: {
        required: {
          runtime: "installed Chromium-family browser with BigInt and Web Crypto",
          dependencies: "none beyond files in the public checkout",
          delivery: "file://",
          network: "denied by the artifact CSP and measured as zero resource requests",
        },
        observed: {
          engine: report.engine,
          delivery: report.delivery,
          resourceRequests: report.resourceRequests.length,
          reducedMotion: report.reducedMotionObserved,
          platform: process.platform,
          arch: process.arch,
        },
      },
      establishes: [
        "the released proof passes the complete browser BN254 pairing under the pinned key",
        "public-value, proof-byte, key-byte, and selector tamper controls reject with their declared failure classes",
        "every case identifies its public source, exact field or byte location, original and run value, and the verification operation reached",
        "tamper controls disclose that mutations exist only in a transient in-memory copy",
        "the measured file:// run made zero resource requests and exposed native keyboard-operable buttons plus reduced-motion and no-JavaScript behavior",
      ],
      doesNotEstablish: [
        "guest semantic correctness, authenticated CashVM execution, BCH consensus validation, chain inclusion, APNT or wallet acceptance, custody, spendability, privacy, successive transfer, or support for an unmeasured browser engine",
      ],
    }, null, 2)}\n` : `browser-verifier Chromium acceptance: PASS -- ${String(report.cases.length)} cases, zero resource requests\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

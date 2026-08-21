#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const HERE=dirname(fileURLToPath(import.meta.url));
const path=resolve(HERE,"..","..","browser-verifier","proofnote-browser-verifier.html");
const expected="691e824b9c9960d585eefa56462e5adf175d822dff282fcb2e37683b3e691263";
const bytes=readFileSync(path);
if(process.argv.includes("--tamper-artifact")){const changed=Buffer.from(bytes);changed[changed.length-2]^=1;if(createHash("sha256").update(changed).digest("hex")===expected)throw new Error("mutation was ineffective");console.error("BROWSER_ARTIFACT_IDENTITY_REJECTED: mutated generated HTML differs from the reviewed digest");process.exit(3)}
const observed=createHash("sha256").update(bytes).digest("hex");
if(observed!==expected){console.error("BROWSER_ARTIFACT_IDENTITY_REJECTED: committed generated HTML differs from the reviewed digest");process.exit(2)}
console.log("PROOFNOTE_BROWSER_ARTIFACT: PASS");
console.log("sha256: "+observed);
console.log("delivery: self-contained HTML, zero runtime dependencies");
console.log("browser acceptance: measured separately in Chromium under file://");

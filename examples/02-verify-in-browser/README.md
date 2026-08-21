# Verify a released proof in your browser

This example is the zero-install form of example 01. The verifier, released proof, public values, pinned key, styles, and honesty metadata are all embedded in one generated HTML file. Before every run, the execution trace names the public source file, exact field or byte offset, original value, run value, and next verification operation.

## Run

Open `browser-verifier/proofnote-browser-verifier.html` in Chromium, or run the artifact identity check:

`node examples/02-verify-in-browser/run.mjs`

## Expected output

`examples/02-verify-in-browser/expected-output.txt` records the artifact-identity check. In the browser, **Published proof** reports `PROOF_VERIFIED` and each tamper reports its named rejection class.

## Tamper or negative controls

Use the four browser controls for public values, proof bytes, pinned key bytes, and selector-bound bytes. Each browser mutation is applied only to a transient in-memory copy; the trace shows the exact before/after value and no file, browser storage, transaction, or chain state is changed. The machine-graded artifact mutation is:

`node examples/02-verify-in-browser/run.mjs --tamper-artifact`

## What this establishes

The measured Chromium run executes the complete published BN254 pairing offline. The public-value tamper keeps valid proof points and reaches the pairing calculation before rejection. The generated file binds its inputs, CSP, and source identities.

## What this does not establish

This does not establish correct guest semantics, authenticated CashVM execution, BCH consensus validation, chain inclusion, APNT or wallet acceptance, custody, spendability, privacy, successive transfer, or support for an unmeasured browser engine.

## If it fails

Check the visible failure class. `PAIRING_REJECTED` is expected only for the public-value tamper; identity, proof, key, and selector failures are reported separately.

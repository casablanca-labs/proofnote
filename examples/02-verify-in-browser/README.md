# Verify a released proof in your browser

This example is the zero-install form of example 01. The verifier, complete released JSON artifact, public values, pinned key, styles, and honesty metadata are all embedded in one generated HTML file. The visible journey focuses on one real proof: inspect its exact bytes, execute the pairing, and follow the boundary from proof identity to a BCH transaction projection, authenticated verdict input, UTXO seal, and private-note commitment.

## Run

Open `browser-verifier/proofnote-browser-verifier.html` in Chromium, or run the artifact identity check:

`node examples/02-verify-in-browser/run.mjs`

## Expected output

`examples/02-verify-in-browser/expected-output.txt` records the artifact-identity check. In the browser, **Verify published proof** reports `PROOF_VERIFIED`.

## Tamper or negative controls

The page keeps public-value, proof-byte, pinned-key, and selector-bound mutations in its machine-graded acceptance interface, rather than presenting five competing visitor journeys. Each mutation applies only to a transient in-memory copy. The artifact-identity mutation is:

`node examples/02-verify-in-browser/run.mjs --tamper-artifact`

## What this establishes

The measured Chromium run executes the complete published BN254 pairing offline. The public-value control keeps valid proof points and reaches the pairing calculation before rejection. The generated file binds its inputs, CSP, and source identities. The binding map identifies which proof-to-transaction links are exercised here and which remain construction targets.

## What this does not establish

This does not establish correct guest semantics, authenticated CashVM execution, BCH consensus validation, chain inclusion, APNT or wallet acceptance, custody, spendability, privacy, successive transfer, or support for an unmeasured browser engine.

## If it fails

Check the visible failure class. `PROOF_VERIFIED` is the only successful verdict. Identity, proof, key, selector, and pairing failures remain distinct in the machine acceptance report.

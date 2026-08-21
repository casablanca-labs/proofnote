# Verify a real released proof

This example verifies the published APNT import-created-note V4 SP1 Groth16
proof with a complete BN254 pairing calculation. It uses only files in the
public checkout, needs no installed package, and is run with network access
denied by example conformance.

## Run

From the public repository root:

```sh
node examples/01-verify-a-proof/run.mjs
```

Then keep the proof points unchanged and flip one bit in the committed
settlement-projection bytes:

```sh
node examples/01-verify-a-proof/run.mjs --tamper-settlement
```

The first command exits zero. The tamper command exits 3 with
`PAIRING_REJECTED`.

## Expected output

The successful command must match
`examples/01-verify-a-proof/expected-output.txt` exactly. It names the
fixture, proof, public values, 492-byte verification key, four-byte selector,
and relation by immutable digest or identity. `pairing executed: true` is a
derived result from this run, not a copied fixture field.

## Tamper or negative controls

`--tamper-settlement` changes the first byte of the decoded
settlement-projection commitment, recomputes the masked SHA-256 public scalar,
and retains the original valid A, B, and C curve points. The full pairing loop
therefore executes and rejects at arithmetic binding. A malformed point or
layout instead reports `DECODE_REJECTED`; the two failure classes are not
interchangeable.

## What this establishes

For the exact fixture and key digests printed by the runner, the published
Groth16 proof verifies under the five re-derived public inputs. It also shows
that changing a committed public-value bit while preserving proof-point
structure causes the pairing equation to fail.

This is one rung of the comparison record, not a claim that this 356-byte
released proof envelope makes the complete BCH protocol 356 bytes. Proof payload,
verification key, CashVM locking and unlocking bytecode, serialized transaction
overhead, setup/state hand-offs, and complete lifecycle bytes are separate
quantities. See
[`docs/proof-system-evidence-rubric.md`](../../docs/proof-system-evidence-rubric.md).

## What this does not establish

This example does not prove that the selected wrapper key or proved guest
implements the intended APNT semantics. It does not execute the authenticated
CashVM verifier and does not establish BCH consensus validation, transaction
inclusion, APNT acceptance, wallet acceptance, custody, spendability, privacy,
or successive-owner transfer.

## If it fails

`DECODE_REJECTED` means an immutable input, selector, relation, layout, field
element, or curve point failed before pairing. `PAIRING_UNEXPECTED_REJECTION`
means all inputs decoded but the released proof failed arithmetic verification.
`PAIRING_REJECTED` is expected only for the declared tamper command.

# Follow a proof into a CashVM-authorized spend

This lab connects the pieces that “proof-bound spend” compresses into two words. It verifies one real released Groth16 proof, re-derives the exact transaction projection committed by its public values, reconstructs that unsigned BCH transaction, and runs Proofnote's released settlement-authorization covenant (SAC) in Libauth CashVM.

The path has four separate authorities:

1. **Prove:** a private witness satisfies a relation. The prover emits a proof and public values. This lab uses a released proof and never receives the witness.
2. **Verify:** the proof, pinned verifying key, and public values pass a real BN254 pairing check.
3. **Authenticate verdict:** Proofnote's production verifier graph is responsible for creating the on-chain terminal-verdict token. This introductory lab uses an explicitly synthetic stand-in carrying the verified projection; it does not execute that graph.
4. **Authorize spend:** the SAC re-derives the projection from the BCH transaction and accepts only if the verdict commitment matches.

The SAC is the transaction covenant. It is not the Groth16 pairing verifier.

## Run

Install the pinned public dependencies, then keep the execution offline:

```console
pnpm install --frozen-lockfile
node --import examples/offline-guard.mjs examples/06-simulate-proof-bound-cashvm/run.mjs
```

The machine-graded command is `node examples/06-simulate-proof-bound-cashvm/run.mjs`.

## Expected output

The exact stable output is in `examples/06-simulate-proof-bound-cashvm/expected-output.txt`. The important lines are the verified pairing, the identical proof/transaction projection, `BCH_2026_05`, and `settlement covenant accepted: true`.

The recorded proof-generation duration is **511,154 ms** for this one released artifact. It is not a universal benchmark. Proving time changes with the relation and circuit size, witness-generation work, recursion/aggregation, proof backend, implementation, CPU/GPU, memory, and concurrency. Proof bytes, proving time, verification cost, SAC cost, and transaction bytes are separate measurements.

## Tamper or negative controls

Run each boundary independently:

```console
node examples/06-simulate-proof-bound-cashvm/run.mjs --tamper-proof
node examples/06-simulate-proof-bound-cashvm/run.mjs --tamper-verdict
node examples/06-simulate-proof-bound-cashvm/run.mjs --tamper-source
node examples/06-simulate-proof-bound-cashvm/run.mjs --tamper-locking
node examples/06-simulate-proof-bound-cashvm/run.mjs --mismatch-fixture
```

Each command prints the original-to-changed boundary or a precise mismatch class and exits non-zero. The proof tamper fails the pairing. The verdict and source-output tampers fail the SAC's projection equality. The locking-bytecode tamper fails P2SH32 before the covenant can authorize anything.

## Agent workflow

Give a coding agent this bounded prompt:

> Start from the casablanca-labs Proofnote repository at commit `21117d0927bb7f4f3c0d8f64a80f04e8a6596b69`. Do not edit files. Inventory `examples/06-simulate-proof-bound-cashvm/example.json` and verify every pinned input digest. Install with the frozen lockfile, disable network access for execution, run the positive command and all five negative controls, then explain the four stages—prove, verify, authenticate verdict, authorize spend—in plain language. Distinguish proof generation time, proof size, verification cost, covenant cost, and transaction size. Stop before any private witness, wallet key, funding, signing, broadcast, chain, or unsupported end-to-end claim. Return exact commands, exit codes, derived commitments, VM profile, and non-claims.

## Verifier lineage

Proofnote’s BN254 CashVM verifier work builds on the pinned
[mr-zwets/groth16_cashscript](https://github.com/mr-zwets/groth16_cashscript),
CashScript compiler fork, and
[mr-zwets/zk-verifier-bench](https://github.com/mr-zwets/zk-verifier-bench)
projects and their contributors. Proofnote adopts
the intra-transaction quotient/residue verifier pipeline from this
collaborative upstream work.

- [Mr-Zwets' Groth16 CashScript repository](https://github.com/mr-zwets/groth16_cashscript) at `6a309f506f87ef584165b9d3ae4c0ec6d66ad56f`
- [Mr-Zwets' ZK verifier benchmark](https://github.com/mr-zwets/zk-verifier-bench) at `227ddf58110a2e21d75cef9cf897132244fd0f47`

Those links establish lineage, not Proofnote correctness. The pinned Proofnote artifacts and the checks you run here remain the authority for this example's claims.

## What this establishes

- One released proof passes a complete BN254 pairing check under the pinned key.
- The proof's public values carry the same statement and settlement commitments independently derived from published, witness-redacted bytes.
- The reconstructed unsigned transaction produces that same settlement projection.
- A synthetic verdict carrying that projection lets the released SAC accept the transaction under Libauth's BCH 2026 consensus VM.
- Each major link is falsifiable in isolation.

## What this does not establish

- The private witness or the intended meaning of every private-relation constraint.
- Execution of the production authenticated-verifier graph or production of a real terminal-verdict token.
- A funded, signed, relayable, mined, chain-confirmed, wallet-accepted, spendable, or production-private Proofnote transaction.
- That the recorded proving duration predicts another circuit, prover, machine, or proof system.

## If it fails

Match the first stable failure class. An artifact-digest or fixture mismatch means the checkout is not the pinned release. `PROOF_BINDING_REJECTED` means the proof no longer authenticates the public values. `MISMATCHED_PUBLIC_FIXTURE` means the statement and proof are not a pair. The remaining classes identify the verdict, covered transaction data, or P2SH32 covenant seal.

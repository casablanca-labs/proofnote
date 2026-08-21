# How to compare proof systems on Bitcoin Cash

“The proof is small” and “the transaction was accepted” are useful facts. They
are not, by themselves, evidence that two systems prove the same statement or
that either system is a viable private-transfer protocol. Use this rubric before
making a size, cost, soundness, or deployability comparison.

## Keep the claims separate

These boundaries must never be collapsed:

```text
reference verification != CashVM verification
CashVM verification != confirmed chain inclusion
confirmed chain inclusion != standard relay
proof verification != proof-to-transaction binding
proof-to-transaction binding != wallet acceptance
wallet acceptance != custody, persistence, or successive spendability
```

CashVM acceptance establishes that the executed bytecode returned true. A
proof-verification claim additionally requires evidence that this exact
bytecode implements the complete verifier, binds every proof and transcript
component, and enforces the claimed application statement at the stated
security level. A component check, demo configuration, or covenant-binding
check can be real and useful without yet establishing complete proof
verification.

## Minimum comparison record

Publish all of the following for each candidate. An absent row is an evidence
gap, not a zero.

| Dimension | Required evidence |
| --- | --- |
| Immutable source | Repository, exact commit, reproducible build instructions, and digests for generated verifier bytes. |
| Statement | Exact circuit, AIR, or guest relation; public inputs; state transition; conservation and authorization rules. |
| Security profile | Field and extension, query/blowup/grinding parameters or curve, claimed security bits, setup assumptions, random-oracle assumptions, and review status. |
| Proof binding | Whether one fixed verifier accepts arbitrary valid proofs for the relation (`runtime`) or proof material is baked into instance-specific scripts that must be regenerated (`instance-specific`). |
| Executed bytecode | Exact locking and redeem bytecode, transaction input mapping, and a byte-level proof that the committed outputs select the scripts that executed. |
| Complete proof verification | A source-to-bytecode account of every verifier equation and transcript binding, including how freely supplied values are recomputed or constrained and how split inputs cannot be omitted or substituted. |
| Negative controls | A structurally valid tamper or forged witness that reaches the relevant arithmetic and is rejected; omission, script-substitution, and cross-input-binding attacks where applicable. |
| BCH deployability | Consensus result and mempool-standardness result reported separately, with transaction version, maximum input/script sizes, operation cost, hash iterations, and packaging type. |
| Bytes and fees | Proof payload, verification material, locking bytes, unlocking bytes, serialized transaction overhead, setup/funding transactions, state hand-offs, final settlement, total lifecycle bytes, and observed fee. |
| Proving cost | Exact hardware, wall time, peak memory, concurrency, software commit, and whether the measurement used production security parameters. |
| Privacy model | What hides sender identity, recipient identity, sender-to-recipient linkage, and value; what remains public through counts, denominations, timing, fees, recovery data, or reusable markers; and the measured anonymity set. |
| Product acceptance | Proof-to-transaction equivalence, nullifier/double-spend behavior, exact conservation, recipient authority, wallet acceptance, Recovery, persistence, reorg handling, and successive spendability. |

Do not divide one system's proof payload by another system's full transaction.
Do not compare different statements, public-input counts, curves or fields,
security targets, or deployment models as if they were implementation-only
differences. Report both the best measured single transaction and the complete
lifecycle: multi-transaction verification does not become free because its
steps are spread out.

## Private-note transfer requirements

For a private note transfer, the proved statement must do more than show that a
hash chain or polynomial relation is valid. The evidence chain must bind:

- a genuinely accepted input note and its unspent backing state;
- spend authority without revealing or delegating the secret that can spend;
- a nullifier or equivalent one-time-consumption rule;
- exact value conservation and any explicit fee rule;
- new note commitments without publishing note values;
- the intended recipient's acceptance and exit authority without exposing a
  reusable recipient marker or sender-to-recipient link;
- the proof's public statement to the exact BCH transaction being authorized;
- authenticated on-chain verifier execution, then independent wallet
  acceptance, persistence, reorg handling, and the ability to spend again.

Name residual privacy leakage separately. Equal-denomination cell counts,
transaction shape, timing, fees, recovery-carrier structure, and a small or
single-operator anonymity set can remain observable even when note values and
identities are absent from the proof statement. A valid STARK or SNARK proves
only the relation it was given; it cannot supply identity or value shielding
that the protocol statement and transaction design never encoded.

## BCH-specific constraints

CashVM can implement cryptographic verification from general script operations;
a dedicated pairing or STARK opcode is not a prerequisite. The engineering
question is whether the complete verifier, at the stated security level, fits
the operation, hashing, script, transaction, fee, and relay-policy boundaries.

The activated BCH VM limits retained a 100,000-byte maximum standard
transaction size while introducing operation-cost and hashing-density limits.
The separate Transaction Version 5 proposal describes read-only inputs and
larger scripts that can deduplicate verifier bytecode, but a proposed or future
format is not evidence about a transaction measured under today's rules. Re-run
the full record under the exact VM and policy being claimed.

Primary references:

- [CHIP-2021-05: Targeted Virtual Machine Limits](https://github.com/bitjson/bch-vm-limits)
- [CHIP-2025-01: Transaction Version 5](https://github.com/bitjson/bch-txv5)
- [BCH Groth16 verifier benchmark methodology](https://github.com/mr-zwets/zk-verifier-bench)

## Proof-system tradeoffs are part of the result

A Groth16 wrapper offers a very small proof and relatively compact verifier,
which matters on a VM without native pairing operations. It also brings a
circuit-specific setup and pairing-based, non-post-quantum assumptions.

A hash-based STARK can avoid a circuit-specific trusted setup and use
post-quantum-oriented assumptions. On BCH it must still pay for its field
arithmetic, transcript, Merkle openings, composition checks, and low-degree
test in CashVM bytecode. Whether that is smaller or more deployable is an
artifact-level measurement, not a property that follows from the word
“STARK.”

Proofnote chose SP1's Groth16 wrapper for its first acceptance backend because
the guest proves the protocol's existing SHA-256 relation directly. That is an
engineering choice, not Proofnote's permanent protocol identity and not a
claim that Groth16 dominates every proof system. See
[`docs/why-sp1.md`](./why-sp1.md).

## Applying the rubric to this release

At the Verification layer, the *01-verify-a-proof* example described by the
[`examples` contract](../examples/README.md) executes a full BN254 pairing over
one released V4 proof and rejects an arithmetic-binding tamper. It establishes
offline proof verification under one pinned key. It does not execute CashVM or
establish chain inclusion, transaction binding, wallet acceptance, or
successive transfer.

[`docs/live-settlement-evidence.md`](./live-settlement-evidence.md) independently
measures a confirmed 99,835-byte Chipnet transaction. It establishes chain
inclusion and byte structure. It does not, by itself, establish Groth16
proof-to-transaction equivalence or wallet acceptance.

The CashVM verifier sources, pinned descriptors, independent byte checkers, and
wallet/research evidence are separate artifacts because each supports a
different rung. The successive-owner example remains visibly blocked until one
evidence chain establishes the host relation, Rust and SP1 parity, accepted
proof, authenticated on-chain verifier, exact conservation and recipient-bound
wallet acceptance together.

That is the comparison standard Proofnote applies to itself and to any other
system.

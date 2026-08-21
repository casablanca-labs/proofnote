# Proofnote example contract

Every runnable directory directly below examples has exactly four required
artifacts: README, runner, expected output, and feature declaration files.
The feature declaration is the machine authority: it names
the runner, ordered commands, published inputs and their SHA-256 identities,
offline status, normalization rules, negative controls, evidence identity,
execution environment, trust assumptions, and both halves of the result claim.

Run the same conformance command used by the public build:

```sh
node examples/conformance.mjs
```

The harness executes each positive runner, compares normalized output, and
executes every declared negative control. Offline runners are preloaded with a
network guard. The harness also executes two synthetic mutations every time:
one source-boundary violation and one network attempt. A detector that has not
been driven to fail cannot support a passing result.

Only two output normalizers exist: `duration-ms` and `temporary-path`. Any
other requested normalizer fails closed. A terminal cast or walkthrough must
be declared `generated`, reproduced from runner output, and match its committed
SHA-256; otherwise it must be declared `omitted`, in which case the presence of
a cast or walkthrough artifact is a contract violation.

A blocked example uses the same feature-declaration envelope with status set to
`blocked`, an explicit blocker list, and no runner, expected output, negative
control, or positive capability. Planned work is visible without looking
runnable.

The examples deliberately do not form a proof-system size leaderboard. Before
comparing this repository's Groth16 example with a STARK, Bulletproof, or other
construction, use
[`docs/proof-system-evidence-rubric.md`](../docs/proof-system-evidence-rubric.md).
It requires the same statement and security target, then separately accounts
for proof, verifier, transaction, lifecycle, relay-policy, and product-acceptance
evidence.

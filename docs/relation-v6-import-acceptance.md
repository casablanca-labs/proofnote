# Relation V6: the import-acceptance boundary

Reviewed 2026-08-18 against canonical implementation main
`7af3558b96448ac0991f241b2ed2a88151ad65e3`.

The central research question is:

> Can private value move through successive owners using ordinary BCH UTXOs as
> authoritative single-use state, while note ownership and value relationships
> remain hidden, without a global mutable privacy pool or trusted sequencer?

The current answer has two halves. The import-to-private-acceptance half is now
implemented and authenticated. The remaining decisive experiment is turning
that accepted note into durable, spendable wallet state and privately
transferring it to the next owner.

## What the current result establishes

| Part of the question | Current result |
| --- | --- |
| Ordinary BCH UTXOs as authoritative single-use backing and state | **Established for the import/current-state acceptance path** |
| Hidden private semantics, value and linkage, with exact conservation | **Established in Relation V6 and its proof path** |
| A global mutable private-value pool | **Not required by this architecture** |
| A trusted sequencer or aggregator authority | **Not granted by this architecture** |
| Authenticated Recovery V1 and independent point-in-time wallet acceptance | **Established** |
| Durable wallet ownership and spendability | **Not established** |
| Successive private owner transition | **Not yet demonstrated** |

These layers are intentionally separate:

```text
proof construction != proof verification
proof verification != chain validation
chain inclusion != wallet acceptance
wallet acceptance != recording
recording != persistence
persistence != spendability
Recovery != spendability
```

The accepted path requires a process-local capability produced by real native
proof verification and a distinct capability authenticating evidence from the
wallet's configured validating node. An aggregator can assemble transactions,
but it cannot mint either authority or decide wallet truth. Aggregation remains
the privacy-default path; direct exit remains a fallback, not evidence of a
successive private transfer.

## Canonical settlement measurement

| Measurement | Value |
| --- | ---: |
| Serialized size | **99,950 bytes** |
| SHA-256 | `2ae95c94910ee9adb49e37a668871b9913231da6f513f164d7649fe36ef80770` |
| Shape | 12 inputs / 21 outputs |
| Remaining standard-size margin | 50 bytes |
| Local BCH-2026 consensus VM | **PASS** |
| Local BCH-2026 standard VM | **PASS** |

This is exact local settlement conformance. It does not establish relay
acceptance or live inclusion of the current canonical fresh-category path.

## Evidence boundary

The canonical Relation V6 proof, public values, verifier bindings, certificate
run, source-parent material, and settlement were reviewed as a package. This
release does **not** publish that raw package. The current export policy refuses
binary artifacts rather than pretending to inspect them, several companion
JSON files intentionally trip private-material key-name controls even when
their values are negative assertions, and the remaining JSON subset would not
form an independently closed verification surface without the omitted files
and verifier source.

This page is therefore a reviewed milestone summary, not a claim that Relation
V6 can be independently reproduced from this public tree. Existing verifier
fixtures in this repository belong to earlier published relations and must not
be used as substitutes for the Relation V6 package.

## Privacy and public residue

The current architecture keeps participant identity, payer-to-recipient
linkage, private-note amounts, input-to-output note correspondence, private
bundle partitions, note-to-cell assignments, private change ownership,
Recovery plaintext, openings, and proving witnesses out of public results. It
does not introduce a reusable recipient marker.

Public transaction shape, counts, fees, timing, BCH metadata, backing
structure, and category lineage remain correlation surfaces. No production
anonymity is claimed.

## Current non-claims

- Recording is not established.
- Persistence is not established.
- A durable reorg-safe lifecycle is not established.
- Spendability is not established.
- Relay acceptance is not established.
- Live inclusion of the current canonical fresh-category path is not
  established.
- Bob to Charles and successive private-hop transfer are not established.
- Full end-to-end APNT is not claimed.

The next target is bounded: accepted note to durable, reorg-safe wallet state;
then spendability; then a private transfer to the next owner, who independently
recovers and accepts it. That is a target, not a current capability claim.

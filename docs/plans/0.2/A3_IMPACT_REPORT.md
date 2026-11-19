# 0.2A / A3 — Dependency impact reports

Implementation branch: `feature/mappo-0.2a-a3-impact-report`.
Baseline: merged A2 PR #23, `8cce456cc132447e70fe88abf1710a198d250307`.
Checkpoint distribution: `dist/mappo-0.2-dev.a3.html`; root `index.html` is identical.
Owner authorized PR #23 merge and A3 implementation on 2026-11-18. A3 requires separate merge approval.

[Execution plan](MILESTONE_0_2A_PLAN.md) · [Preservation contract](ROAD_EDIT_CONTRACT.md) · [A2 record](A2_FACE_IDENTITY.md) · [Report examples](A3_IMPACT_EXAMPLES.json)

## Result and interfaces

A3 owns Safe / Needs review / Invalid classification for temporary road changes. Its modular functions are bundled privately for the future A4 inspector; this checkpoint adds no road-edit UI, Apply, Undo transaction, persistence field, public browser global or HTTP service.

```js
const proposal = proposeJunctionMove(project.city, junctionId, point);
const report = analyzeRoadImpact(project, proposal);
// Equivalent convenience wrapper:
const report2 = inspectJunctionImpact(project, junctionId, point);
```

`analyzeRoadImpact` consumes an A1-style temporary graph proposal. It rebuilds the graph indexes from the actual records, determines changed node/road IDs itself, then consumes A2 extraction and matching. Caller-provided `graphValid`, `status` or changed-ID hints do not establish safety. The generic graph entry also supports read-only split/merge diagnostics; it does not authorize adding/removing accepted roads.

| Report field | Contract |
| --- | --- |
| `status` | `safe`, `needs-review`, or `invalid`; A3 is the authority for this classification |
| `operation`, `roadIds`, `junctionIds` | Operation label and actual candidate change scope; rejected proposals retain relevant accepted IDs |
| `affected` | Deterministic kind-qualified object rows with code, severity, explanation, related IDs and available old/new measurements |
| `issues` | The non-informational subset of affected rows |
| `preservedObjects` | Unaffected accepted objects, qualified by kind and ID; only returned for a completed analysis |
| `preservedIds` | Flat deduplicated convenience list; `preservedObjects` is authoritative if IDs overlap across collections |
| `metrics` | Junction positions, road lengths/classes, face areas/overlap, derived open-space areas and unresolved topology groups |
| `validation` | Accepted-project validation and candidate validation state; candidate validation can be skipped once a conflict is already established |
| `complete` | Whether the full analysis completed; false never qualifies as Safe |
| `requiresReconciliation` | At least one review issue needs an explicit future resolution |
| `counts` | Unique affected objects, issues and preserved objects |
| `canApplyIn02A` | Always false |

Reports contain IDs and selected measurements, not an accepted city, candidate project, mutable graph or persistence payload. Returned report objects/lists/measurements are deeply frozen. Analysis never serializes or writes an accepted city, changes editor history, deletes/relocates objects or reattaches access paths.

## Classification proof

**Safe** requires all of the following:

1. The accepted JSON tree and schema-9 project validate.
2. The actual candidate graph validates, then A2 proves face coverage, identity and protected-feature invariants.
3. Accepted frontage, setback, block/property/plot/building ownership and containment relationships remain valid.
4. Accepted access paths still connect to their frontage roads; district and fortification dependencies resolve.
5. No opaque/unknown dependency remains unrecognized on a changed proposal.
6. A temporary candidate snapshot passes the authoritative full project validator. No property/plot/building/frontage/ownership geometry is rewritten in that snapshot.

**Needs review** means topology can remain well-formed but an accepted relationship would require explicit review or reconciliation: changed frontage alignment/frame, setback/corridor conflict, lost containment, unsupported access, missing/unresolved object ownership, split/merge/ambiguous block correspondence, district/defense dependency or opaque extension data. It also covers an incomplete analysis or an otherwise unrecognized candidate-validation failure. No repair is attempted.

**Invalid** covers invalid accepted input, malformed/disconnected/crossing candidate topology, boundary escape, impossible plaza/landscape topology or a prohibited protected-edge/face rewrite. These reports may stop before dependent analysis; `complete: false` identifies that limitation rather than claiming a complete set of proven unaffected objects.

A no-op may remain Safe with opaque stored metadata because it does not reinterpret or change the network. For an actual network change, unknown fields and nonempty extension bags, including supported nested geometry/state bags, require review. Unknown false/null/empty constraint values are not assumed inactive; for example, `allowRoadEditing: false` must not qualify as Safe. Custom names/uses and other defined model metadata are preserved without being treated as unknown dependencies.

## Checks and metrics

- Property, plot and building frontage IDs must resolve to supported streets bounding the same accepted block. Any changed frontage geometry/class requires review; saved frontage frames are not silently realigned.
- Property setbacks use the existing street widths, edge width and property margin, with old/new distance measurements and exact road/property IDs.
- Changed block containment is checked for properties, plots and buildings. Parent/child membership and occupied-plot references are checked without renumbering or reallocating anything.
- Buildings retain their entrance and access path. A detached road endpoint is reported, and changed road corridors are checked against footprints.
- A2 split/merge/ambiguous groups propagate to the affected properties, plots, buildings and districts. No accepted ID is assigned to a new face; candidate-face keys remain explicitly temporary diagnostics.
- District membership/connectivity and wall/gate/tower references are checked with kind-qualified targets. Changed streets are checked against wall solids, gateposts and towers. Protected bank/bridge/plaza/foothill/pass connections identify their owning water/terrain/defense IDs.
- Only known derived block area and open-area summaries are computed in the validation-only snapshot. Their old/new measurements are informational and do not relocate land or accepted objects. Future 0.2B acceptance would still need its separately approved atomic transaction.

The existing bounded A1/A2 and project/landscape/fortification validators remain authoritative. A3 adds a 6,000,000-unit dependency-analysis budget. Work exhaustion or an unsupported inspection path cannot produce a Safe partial result.

## Verification

- 98 baseline cities: unchanged candidates are Safe only after authoritative candidate validation; input project bytes remain unchanged.
- Real undeveloped-junction movement: Safe with derived area metrics only.
- Developed frontage moves: exact property/plot/building/frame/access IDs and measured setbacks/corridor conflicts.
- Crossing, disconnection, invalid coordinate/selection/boundary and protected plaza/perimeter/bridge/bank/pass/foothill cases.
- Corrupt plot/building/block/district/gate/tower references; opaque root/nested metadata; known custom names/uses; actual split/merge/ambiguous topology propagation.
- Record/endpoint reordering, forged status/changed-ID hints, kind-qualified ID collisions, bounded work, immutable reports, unchanged schema-9 portable document bytes and compiled/module report parity.
- `npm run check`: 312/312 tests pass, including 25 A3 tests and the unchanged generation/persistence regression suites.
- Node 22.23.4: 25/25 focused A3 tests pass, including compiled/module parity and the malformed-input guards.
- `npm run test:browser`: both suites pass, 16/16 browser/viewport runs across Chromium and Firefox at desktop, ultrawide, tablet and phone sizes.
- Root and versioned standalone are identical: 768,664 bytes; SHA-256 `a08ab1a90aaa9c271354daa22ca4d637f80768c61334600d5e2f5bdd8d833f09`.
- `git diff --check`: clean. Previous distributions retained; schema remains 9.

Five report excerpts are committed in `A3_IMPACT_EXAMPLES.json`: unchanged, Safe undeveloped movement, frontage review, invalid crossing and protected bridge. Regenerate them with `node scripts/road-impact-examples.mjs`; the helper asserts their expected statuses and only writes documentation.

## Next checkpoint

A4 will consume A1 proposals and A3 reports for explicit road/junction inspection and a non-destructive preview. It will display these classifications and affected IDs without adding another geometry authority or enabled Apply operation. A4 implementation is outside this PR.

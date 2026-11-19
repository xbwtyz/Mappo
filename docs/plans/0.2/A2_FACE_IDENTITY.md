# 0.2A / A2 — Face topology and block identity

Implementation branch: `feature/mappo-0.2a-a2-face-identity`.
Baseline: merged A1 PR #22, `2290af7407d3f4efbaa36fa227e2286576748994`.
Checkpoint distribution: `dist/mappo-0.2-dev.a2.html`; root `index.html` is identical.
Owner authorized A1 merge and A2 implementation on 2026-11-18. A2 requires separate merge approval.

[Execution plan](MILESTONE_0_2A_PLAN.md) · [Preservation contract](ROAD_EDIT_CONTRACT.md) · [A1 record](A1_ROAD_GRAPH.md)

## Result and API contract

The A2 APIs are read-only and transient. They are included in the standalone bundle for the later road inspector, without new UI, product globals, Apply, history entries or project schema changes.

| API / output | Meaning |
| --- | --- |
| `extractRoadFaces(graph, acceptedCity)` | Canonical bounded faces, one exterior ring, coverage metrics and diagnostics from an A1 graph and the accepted protected geometry |
| Face `key` | A temporary canonical vertex-cycle key; never an accepted block ID |
| Face geometry | Positive winding, raw area, vertex IDs, coordinates, directed edges and their existing road IDs |
| Face ownership | Block, plaza, water or terrain; water/terrain feature IDs are checked using the existing validators |
| `matchExistingFaces(acceptedCity, extraction)` | Preserved/changed records, added/removed face diagnostics, split/merge/ambiguous groups, geometric metrics and reference issues |
| `valid` | A2 graph/face/identity proof completed without a prohibited protected change; it does not establish property/building safety |
| `requiresReview` | Unresolved identity, structural or district/defense consequences need review; a false value still requires A3 dependent-object validation |
| `canApplyIn02A` | Always false |

Candidate coordinates live in the detached A1 graph. A changed matched record retains its existing vertex IDs/order and all source metadata, updating only its computed area. Unchanged records retain the original serialized fields exactly. All returned records/coordinates/lists are deeply frozen and detached from accepted records.

## Face validation

A canonical directed-edge traversal is independent of generator insertion order. Each half-edge is consumed once, every walk must close, no face may repeat a junction, and the graph must produce one exterior ring plus positive bounded faces. The generator continues to use A1's insertion-order traversal: its geometry and identity output is unchanged.

Boundary roads must form exactly the connected exterior ring with degree two at perimeter junctions. Road endpoints and cut-interval samples must remain inside the accepted outline; boundary edges must stay on that outline. Bounded area and exterior area must match the accepted boundary within the existing 0.02 tolerance. Land/plaza minimum area and water/terrain minimum area retain the existing thresholds.

The accepted plaza center must lie strictly within exactly one face. Existing water and mountain validators recheck face ownership, shore/foothill geometry, bridge/pass connections and traversable connectivity. Protected edge records and their endpoint positions are compared with accepted data during matching. Reversing an undirected road's endpoint order alone is not a geometric rewrite.

## Identity policy

1. Normalize cyclic starting vertices and face ordering for analysis, without reordering accepted records.
2. Prove the same ordered vertex-cycle topology and the same road ID on each corresponding undirected edge. Array order, sequential face number or a geometrically similar polygon alone is insufficient.
3. Confirm unchanged geometry, or corroborate a moved counterpart with positive geometric overlap. Retain the accepted ID, ring, sector, usage, district and extension/custom metadata for that counterpart.
4. For remaining unmatched faces, compute a bipartite graph of positive polygon overlaps. Closed one-to-many groups are split diagnostics; closed many-to-one groups are merge diagnostics; other intersecting groups remain ambiguous. Disjoint unmatched records/candidates are reported as removed/added.
5. No split/merged/ambiguous candidate inherits an accepted ID. No new persisted IDs are invented, and accepted records are never deleted or relocated.

Arbitrary concave polygon overlap uses bounded ear-clipping triangulation and the existing convex clipping primitive. It is not approximated by bounding-box overlap. Protected faces with lost counterparts, changed geometry or changed feature ownership are blocked explicitly.

The implementation deliberately leaves topology-changing one-to-one matches unresolved when no explicit edge correspondence is available. Future operations may supply a separately designed correspondence path; A2 does not guess identity from overlap alone.

## Reference validation and limits

District membership/connectivity and fortification wall/gate/tower references are rechecked against a temporary candidate snapshot. Their issue records are diagnostics, without rewriting membership or defense geometry. Parcel frontage, setbacks, plot/building containment and full dependency impact classification remain A3 responsibilities; `valid` or `requiresReview: false` in A2 is not a Safe city status.

A2 uses the A1 bounded graph inputs and a 6,000,000-unit work budget for each face extraction/matching path. Geometric corroboration shares the matching budget. If triangulation, traversal or matching cannot complete reliably, the result is invalid and partial identity mappings are discarded. The landscape/defense validators also retain their existing internal limits.

## Verification

- 98 unchanged baseline cities: positive face extraction, complete coverage and exact accepted face-record preservation.
- Small ordinary-junction movement: stable block IDs, vertex order, district references and nested custom metadata.
- Explicit split, merge, ambiguous overlap, road renumbering/swapping, concavity, boundary escape, invalid graph, missing protection flags, invalid plaza center and accepted face mismatch cases.
- Real mixed water/terrain/defense cases and a dividing mountain range with a real pass.
- District/gate reference corruption is diagnosed; protected geometry is blocked; pinched cut-edge faces fail closed.
- Frozen accepted input, immutable/detached output, unchanged schema-9 portable save bytes and compiled/module API parity.
- `npm run check`: 287/287 tests pass, including 17 A2 tests and the unchanged 98-city generation parity suite.
- Node 22.23.4: A1 + A2 focused suites pass 29/29 tests.
- Final standalone import order: compiled application/A1/A2 regression suites pass 33/33 tests.
- `npm run test:browser`: 16/16 browser/viewport runs pass (Chromium + Firefox, desktop/ultrawide/tablet/phone, navigation/file and property/building suites).
- Reproducible root/versioned HTML: 721,028 bytes; SHA-256 `5abef5037aec77d04e1576c2119d7a15835a09e917714519d6585b901ebb7d8a`.
- `git diff --check`: clean.

A six-city local Node sample measured extraction at 8.64–36.79 ms and matching at 16.80–62.88 ms (170–228 faces, including mixed landscape/defense cases). These are development observations, not frame-time guarantees; A4 must schedule preview analysis appropriately.

## Next checkpoint

A3 consumes A1 candidates plus A2 face identities and metrics to report property/plot/building/frontage/setback/district/defense impacts with Safe / Needs review / Invalid semantics. A2 does not start A3 and does not add an enabled road-edit operation.

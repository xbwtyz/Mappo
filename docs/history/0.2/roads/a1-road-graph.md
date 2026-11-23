# 0.2A / A1 — Reusable road-graph foundation

Implementation branch: `feature/mappo-0.2a-a1-road-graph`.
Baseline: `785e9cb2a44c40819e91a636523ac397b6660f9e` (stable 0.1.0, including Dev 4f).
Checkpoint distribution: `dist/mappo-0.2-dev.a1.html`; `index.html` is identical.
Merged with separate owner approval as PR #22 on 2026-11-18, commit `2290af7407d3f4efbaa36fa227e2286576748994`.

[Execution plan](milestone-0-2a-plan.md) · [Preservation contract](../../../reference/road-edit-contract.md)

## Scope and behavior

A1 extracts the generator's microunit node normalizer and positive-winding directed-edge face traversal into `src/core/road-topology.js`. Generator insertion order, snapping, tolerances, seeded geometry and object identities remain unchanged. The existing shared `segmentCuts` predicates remain authoritative for intersections; no second intersection implementation was introduced.

`src/core/road-graph.js` provides an independent analysis path for accepted city records. It copies and deeply freezes records, sorts indexes and diagnostics by ID, and exposes read-only index facades. Freezing a JavaScript Map by itself would still permit mutations; these facades deliberately provide no write methods or backing-map access.

| API | Result | Contract |
| --- | --- | --- |
| `buildRoadGraph(city)` | Node/road indexes, adjacency, incident-road IDs, protected classifications, connected components, issues and `valid` | Detached immutable records; array/key order cannot select winners for duplicate IDs |
| `analyzeRoadGraph(city)` | Deterministic counts, components, protected road IDs and issue records | Read-only summary; issues carry explicit junction/road IDs |
| `classifyRoad(road)` | Class and protected reasons | Boundary, plaza, bank, water boundary, bridge, foothill, terrain boundary and mountain pass metadata retained |
| `proposeJunctionMove(city, id, point)` | Temporary graph and `graphValid`, changed incident roads and issues | No city, project, save or history mutation; protected moves and invalid accepted bases rejected |
| `createRoadNodeNormalizer(nodes, mergeNearby)` | Generator-owned node builder | Use an initially empty output array; never pass accepted city nodes |
| `traceRoadFaces(nodes, roads)` | Positive-area vertex cycles in supplied traversal order | Low-level primitive for valid planar input; it does not validate or repair a graph |

Graph diagnostics cover invalid records/IDs/coordinates, duplicate IDs/edges, missing endpoints, self-loops, degenerate roads, crossings/T contacts/collinear overlaps, orphan/dangling junctions, disconnection and exceeded work limits. Candidate diagnostics additionally identify nonexistent junctions, invalid proposed coordinates, boundary escape and protected junction connections.

`graphValid` means only that A1 graph invariants pass. It does **not** establish valid city faces or dependent-property safety. All proposals explicitly carry `canApplyIn02A: false`. There is no Apply, persistence change, history entry or road inspection UI in this checkpoint. APIs are included in the standalone bundle for the next checkpoints without exposing product globals.

## Preservation and regression evidence

The committed golden fixture was captured from the stable baseline **before** extraction. Its 24 shared starting outlines are stored as literal coordinates, so every runtime receives exactly the same input geometry. The fixture must not regenerate these outlines: Node 22 and Node 24 exhibit pre-existing last-bit `Math.pow` differences for the planned shape. SHA-256 covers the entire `city` JSON, including original array order, IDs, names, district metadata, properties, plots, buildings, defenses and special geometry. Generator/app version metadata outside `city` is deliberately excluded so development versioning does not invalidate geometry parity.

- 96 cases: eight starting outlines × four street morphologies × three sizes.
- Two additional cases: combined coast/river/lake/bridge/defense geometry, plus mountains on the same wet city.
- All 98 exact city hashes remain unchanged after extraction; every generated graph also passes A1 validation and face-count parity. The same unchanged golden hashes pass on Node 22.23.4 and Node 24.22.3 with the frozen input outlines.
- Frozen-input tests prove analysis/candidate creation cannot write accepted records. Result-write attempts and later source mutations verify full detachment.
- Tests cover reordered records/keys, invalid geometry, protected metadata, no-op/ordinary/rejected moves, bounded pathological work, compiled/module equivalence and unchanged schema-9 portable document bytes.
- Source and standalone HTML share the same graph implementation. Root and versioned HTML are byte-for-byte equal; previous distributions remain intact.

## Performance limits

The graph path uses indexed adjacency and an X-axis segment bounding-box sweep. It caps input at the existing project limits of 20,000 junctions / 40,000 roads and stops after 6,000,000 pair inspections. Exceeding the budget produces an explicit diagnostic and cannot validate a partial graph as valid. Accepted city inputs are plain, already validated project records.

A local Node 24 sample of ten analyses per city measured median 2.82–8.72 ms for four large seeded morphologies (530–745 roads), and 4.85–6.24 ms for the two mixed landscape cases (500–599 roads). Maximum observed sample time was 15.29 ms. These are environment-specific development observations, not browser frame-time guarantees. A 3,500-road pathological duplicate fixture verifies the hard work cap.

## Verification

- `npm run check`: 270 tests pass, including 12 new A1 tests.
- `npm run test:browser`: both suites pass (16 browser/viewport runs: Chromium + Firefox × desktop, ultrawide, tablet and phone × navigation/file and property/building suites).
- Focused A1 suite: 12/12 tests pass on both Node 22.23.4 (CI runtime) and Node 24.22.3. An untouched 0.1 worktree also confirmed exact before/after city equality for all 98 cases separately on each runtime.
- `git diff --check`: clean.
- Reproducible build SHA-256: `1cc16246074eb40a…`; standalone size: 695,834 bytes.

## Next checkpoint

A2 will turn the low-level face traversal into canonical face candidates and match existing block identities by topology, retaining metadata for unambiguous counterparts and reporting splits/merges/ambiguities. No A2 implementation is included in this PR. A3 dependency impact classification and A4 interactive previews follow in order.

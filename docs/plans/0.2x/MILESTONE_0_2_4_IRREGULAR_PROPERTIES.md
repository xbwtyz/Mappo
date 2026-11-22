# Mappo 0.2.4 — Irregular Property Boundaries and Procedural Generation

**Status:** Owner-approved decisions D-024-1 through D-024-7 (all A); implementation on `feature/mappo-0.2.4-irregular-property-generation` only, against Issue [#99](https://github.com/xbwtyz/Mappo/issues/99). **No merge, release or Pages publication authorization.**

## Objective

Make property boundaries fit real city-block geometry. Deliver both (1) manual insertion, movement and removal of vertices on valid convex/concave property polygons and (2) morphology-aware irregular properties in newly generated cities. Retain the offline standalone editor and existing user-authored work. This is B01; arbitrary N-gon split/merge, complex road-driven authored parcel relocation and hole/multi-frontage models remain separate B02–B05 projects.

## Approved architecture

| Decision | Approved A contract |
|---|---|
| D-024-1 | Simple convex and concave polygons, hole-free, CCW; 3–12 corners for new editing and generation actions. Existing valid saved geometry beyond the authoring limit is not silently invalidated. |
| D-024-2 | Extend shared geometry, boundary and validation modules; no duplicate conflicting polygon engine. Full project validation remains authoritative. |
| D-024-3 | Persist convex plots whose union equals the polygon. Deterministic triangulation for concavity; unchanged IDs retained if possible. Refuse destructive retiling of authored or provenance-unknown plots. |
| D-024-4 | Add vertex operations and precise coordinates to the existing property editor. Retain preview/Cancel/Reset, safe Apply and Undo/Redo; no extra workspace or tutorial. |
| D-024-5 | Morphology-aware generation by default, with rectangular fallback; planned stays orderly, organic/radial prefer fitting irregulars. Deterministic independent RNG. |
| D-024-6 | Contain existing/generated buildings and entrances, update plot membership; prefer unbuilt site or rectangular fallback rather than invalid development. |
| D-024-7 | One focused branch and PR. Preserve project schema 9 only if full validation and saved-document roundtrip prove compatibility; otherwise stop and seek a separately approved schema 10 contract. Version `0.2.4-dev`. PR merge, release, tag and Pages deployment are each separate approvals. |

## Implementation checkpoints

- [ ] **P1 — Geometry:** canonical overlap, containment, convexity and polygon partition; positive/negative fixtures and schema-9 compatibility.
- [ ] **P2 — Manual UI:** add, move, delete vertex with direct controls and live preview; stable frontage and per-vertex numeric editing.
- [ ] **P3 — Integrity:** safe deterministic generated-only plot retiling and explicit protection for authored/unknown records; building plot membership; independent atomic Apply, Undo/Redo, saved format.
- [ ] **P4 — Cross-workspace:** preserve four-corner split/merge, property creation, building tool, Roads fail-closed unsupported cases, offline rendering and imports.
- [ ] **P5 — Procedural generation:** morphology-driven geometry derived from block/frontage fit, convex plot coverage, contained development, seeded determinism, rectangular fallback and measured output mixes.

## Acceptance and negative cases

1. Polygon triangles, convex 5+, wedges and concave L-shaped samples; reject inverted, self-crossing, invalid vertex counts, zero-area, boundary overflow and road-setback intrusion.
2. Area and convex plot coverage match within 0.02; no overlap/orphan IDs; no unauthorized custom metadata, name, usage or building moves.
3. Existing generated-only plot shapes may be retiled only when provenance is provable; directly authored/unknown plot records fail closed with actionable explanation.
4. Manual Apply validates a *fresh* candidate independently; no mutation to accepted city before Apply. Undo/Redo and project export/import must preserve the result exactly.
5. Fixed seeds per planned/linear/radial/organic morphology, small/medium/large, keep road and district topology deterministic; report property side counts, fallback rate, full-project validity and relative runtime.
6. E2 splits, E3 merges and legacy 3I/E4 operations remain working for supported four-corner properties; unsupported N-gon split/merge blocked clearly.
7. Required six-runner Node/browser CI and aggregate gate, Firefox and Chromium desktop, and byte-identical built `index.html` and `dist/mappo-0.2.4-dev.html` before PR is declared review-ready. Heavy C7 benchmark remains opt-in.

## Design cautions

Road-warp B2 still requires convex four-corner parcels; do not accidentally broaden it in this milestone. Full-project validation is bounded and remains independent of lightweight interaction previews. Avoid generation RNG ripple to street layout or unrelated blocks. If an irregular candidate cannot fit inside the block, overlap guardrails or protected development, keep the rectangular generated candidate. Document measured distribution and actual limitations at PR review.

# Mappo 0.2.4 — Irregular Property Boundaries and Procedural Generation

**Status:** Owner-approved decisions D-024-1 through D-024-7 (all A); P1–P5 implemented and acceptance-verified on [PR #114](https://github.com/xbwtyz/Mappo/pull/114) (branch `feature/mappo-0.2.4-irregular-property-generation`), against Issue [#99](https://github.com/xbwtyz/Mappo/issues/99). **Review-ready, NOT merged; no release, tag or Pages publication authorization.**

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

- [x] **P1 — Geometry:** canonical overlap, containment, convexity and polygon partition; positive/negative fixtures and schema-9 compatibility.
- [x] **P2 — Manual UI:** add, move, delete vertex with direct controls and live preview; stable frontage and per-vertex numeric editing.
- [x] **P3 — Integrity:** safe deterministic generated-only plot retiling and explicit protection for authored/unknown records; building plot membership; independent atomic Apply, Undo/Redo, saved format.
- [x] **P4 — Cross-workspace:** preserve four-corner split/merge, property creation, building tool, Roads fail-closed unsupported cases, offline rendering and imports.
- [x] **P5 — Procedural generation:** morphology-driven geometry derived from block/frontage fit, convex plot coverage, contained development, seeded determinism, rectangular fallback and measured output mixes.

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

## Final acceptance evidence — full morphology × size matrix

**Measured CI:** [Mappo CI #44989284994](https://github.com/xbwtyz/Mappo/actions/runs/44989284994), exact tested source/acceptance HEAD `9e700666cc350618fb6fd7134d93404ea8013f85`: **PASS**. Node shards **228/228** and **269/269**, total **497/497**; desktop, roads, property and integration browser suites all passed; required aggregate gate passed. The official source build yielded byte-identical `index.html` and `dist/mappo-0.2.4-dev.html`. Automated Firefox/Chromium acceptance is not a claim of owner hands-on testing.

**Method:** `tests/property-polygons-024-acceptance.test.js` creates a fixed reproducible `024-acceptance-<morphology>-<size>` seed in all 12 morphology/size combinations, with legacy rectangular generation (`irregularProperties:false`) and the opt-in generator (`true`) from the same current code revision. It confirms equal node/road/block/district arrays, full candidate validation, repeat seeded city equality, JSON project roundtrip, bounded polygon sides, and distinct accepted vs. rejected irregular candidate attempts. Generated city data and schema remain unchanged by optional diagnostic counters.

| Size | Morphology | Total properties | Four-sided | Five-sided | Selected attempts | Rejected fallback | Fallback % | Rectangular ms | Irregular ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Small | Organic | 179 | 139 | 40 | 47 | 7 | 14.9% | 192.7 | 147.3 |
| Small | Radial | 162 | 100 | 62 | 67 | 5 | 7.5% | 73.1 | 98.1 |
| Small | Linear | 166 | 151 | 15 | 17 | 2 | 11.8% | 70.2 | 68.3 |
| Small | Planned | 173 | 173 | 0 | 0 | 0 | — | 49.6 | 53.6 |
| Medium | Organic | 418 | 279 | 139 | 159 | 20 | 12.6% | 99.3 | 140.3 |
| Medium | Radial | 413 | 345 | 68 | 70 | 2 | 2.9% | 110.5 | 153.1 |
| Medium | Linear | 451 | 436 | 15 | 20 | 5 | 25.0% | 75.0 | 117.8 |
| Medium | Planned | 449 | 449 | 0 | 0 | 0 | — | 101.9 | 113.7 |
| Large | Organic | 972 | 702 | 270 | 323 | 53 | 16.4% | 218.2 | 258.7 |
| Large | Radial | 779 | 608 | 171 | 181 | 10 | 5.5% | 202.6 | 275.8 |
| Large | Linear | 997 | 950 | 47 | 50 | 3 | 6.0% | 225.1 | 182.1 |
| Large | Planned | 1,053 | 1,053 | 0 | 0 | 0 | — | 163.8 | 138.6 |
| **Total** | **12 cases** | **6,212** | **5,385** | **827** | **934** | **107** | **11.5%** | — | — |

**Interpretation:** 827/6,212 properties (13.3%) are irregular, concentrated in organic (449), radial (301), and linear (77) generation. Planned retains only four-sided properties by current design. Here *fallback rate* means the portion of **selected irregular attempts** rejected by geometric or protected-building checks (107/934 = 11.5%); it does **not** mean the share of all properties remaining rectangular, most of which were never selected for conversion. All generated irregular candidates in these fixtures were pentagons; wider 3–12-vertex shapes are supported by manual authoring, not promised by procedural generation.

**Timing qualification:** Node v22.23.5, Linux x64 hosted GitHub Actions runner. Each displayed generation time is one `performance.now()` observation around `createProject()`, without validation/save costs. Comparisons are exploratory, sensitive to JIT/cold-run and co-running jobs; **no performance gain or regression magnitude is claimed** and these numbers are not release thresholds. Heavy C7 benchmarking remains opt-in.

**Final acceptance scope:** Existing 0.2.4 positive/negative polygon, authored metadata, preview isolation, Apply/Undo/Redo, standalone, historical four-corner operations and browser checks remain covered by the prior and current PR suites. No holes, multiple independent frontages, arbitrary N-gon split/merge, B05 authored road relocation, schema 10 or mobile QA added. The public Generate workflow opts into irregular morphology; bare `createProject()` without `irregularProperties:true` deliberately retains legacy generation semantics. Preserve that distinction for future integration.

**Approval boundary:** P1–P5 verification and documentation completion **do not authorize PR merge or stable release**. Confirm all required CI on the final documentation revision before requesting explicit owner merge approval.

# Mappo 0.2.6 — B03 Irregular Property Merging

> **Owner-approved P1–P5 implementation in PR [#116](https://github.com/xbwtyz/Mappo/pull/116).**
> **Development-only:** not merged, released, tagged or deployed. Project schema 9 and portable envelope 1 retained.

**Target issue:** [#101](https://github.com/xbwtyz/Mappo/issues/101) · **Version:** \`0.2.6-dev\` · **Baseline:** main \`62626d298d3e38a225409d98077ed8c8fe5e8d49\`

## Approved architecture decisions

| Decision | Approved contract |
| --- | --- |
| D-026-1=A | Two properties in the same block/district, one continuous straight shared seam, partial or complete edge |
| D-026-2=A | Connected, hole-free simple concave/convex union, 3–12 corners |
| D-026-3=B | Distinct source frontage roads and multiple exterior road-facing edges, with one authoritative primary frontage |
| D-026-4=A | Preserve every existing plot geometry, ID and compatible metadata, never retile |
| D-026-5=B | Automatic verified access/entrance repair and bounded rigid relocation when needed, with individual protected consent |
| D-026-6=A | Primary property ID survives; complete secondary identity is saved in merge lineage |
| D-026-7=A | Extend existing E3 Inspector and history in modular source, same schema, one owner-reviewed PR |

## Problem and intended user outcome

Before 0.2.6, E3 accepted only two compatible convex four-corner properties with a complete shared frontage-to-rear edge, identical frontage frame and strict strip plot arrangement. B01/B02 made irregular polygons possible but those properties remained unmergeable.

After 0.2.6, the user can select eligible concave or partial-edge neighbors, inspect their actual combined polygon, retain every source plot and building identity, review any necessary building/access repair, explicitly approve protected changes, then Apply as one reversible transaction. The existing E3 rectangular merge remains unchanged.

## P1 — Topological union and multi-road compatibility

**Implementation:**
- \`src/core/property-merge-union-026.js\` subdivides source boundary edges at shared vertices, cancels only exactly opposite shared subsegments, proves one straight connected shared seam, traces one exterior cycle and simplifies only redundant collinear corners.
- Rejects gaps, corner contact, crossing/overlapping interiors, disjoint/non-manifold seams, holes, area loss, invalid winding, excess vertices and missing exposed source frontages.
- \`propertyMergeFlexibleGeometry026\` extends E3 eligibility without changing accepted legacy full-edge E3 geometry behavior.
- Retains the selected primary source's authoritative \`frontageRoadId\` and frontage frame; reports all distinct, independently verified source road IDs as derived frontage exposure. Source building/plot road associations survive.

**Gate:** Mappo schema 9 does not natively persist a frontage-edge array. Only the primary road remains authoritative; secondary exposed frontages are derived from the source records and merge lineage. The existing independent validator permits buildings to retain their separately referenced road IDs. Do not represent this as support for arbitrary multi-frontage property authoring, automatic multi-road road-reflow or new per-edge road metadata. If a specific downstream edit cannot safely reconcile those dependencies, fail closed. Schema 10 remains unauthorized.

**P1 acceptance:** verify same-block/district eligibility, positive area and coverage, 3–12 corner limit, multi-road geometry, conservation and B02 sibling compatibility. Negative cases must make no accepted changes.

## P2 — Exact plots and bounded building/access adaptation

**Implementation:**
- Existing convex plot boundaries/IDs/annotations are unchanged; only secondary plot ownership references change.
- \`src/editor/property-merge-adaptation-026.js\` checks current routes, including valid accepted *setback-frontage* endpoints, preserving an existing route if valid.
- If necessary, tries existing and alternate verified road access, new entrance/route candidates, then deterministic bounded rigid translation/rotation within the merged property's existing plot tiling.
- Never silently deletes or regenerates buildings, edits plot geometry, scales footprints or changes any building ID.
- A building with authored/custom/unknown provenance cannot be changed without its own affirmative authorization; all proposals appear in the preview and lineage.
- Infeasible access, collision, plot membership or permissions block Apply.

**P2 acceptance:** unit coverage of unchanged route retention, individual protected authorization, successful bounded relocation with stable IDs and exact plots, and no-mutation negative cases.

## P3 — Atomic E3 transaction and preservation

**Implementation:**
- E3's flexible path delegates to \`src/editor/property-merge-026.js\`; the canonical rectangular E3 path remains as-is.
- A detached project clone receives merged boundary, combined plot/building memberships, verified ownership references, and any authorized access/building adjustment.
- Primary ID and compatible custom fields survive; full retired secondary record and original changed-building records enter \`propertyMergeHistoryE3\` lineage.
- Independent \`validateStoredProject\`, schema-9 portable encode/decode, revalidation at Apply, stale-revision guards and E3-scoped Undo/Redo remain mandatory.

**P3 acceptance:** exact Undo/Redo, one property retired, exact plot/building identities, no mutation on invalid inspection, portable save/reopen and full validation.

## P4 — Inspector / map experience

**Implementation:**
- Reuse the existing **Merge properties** Inspector, neighbor selection, Cancel/Reset/Apply, Undo/Redo and one accepted-city transaction.
- Show combined area, primary frontage length, number of distinct source roads, plot/building identity preservation, and the count of proposed building/access adaptations.
- Draw original and proposed building footprints and new access path overlay; provide a per-protected-building consent checkbox, plus existing protected-property retirement consent.
- Keep keyboard-driven Inspector controls and mouse/trackpad map selection; do not introduce forced onboarding or phone QA.

**P4 acceptance:** nonmutating previews; clear blockers; existing E3 browser tests, new 026 browser tests in Firefox/Chromium; protected adaptation cannot apply without consent.

## P5 — Verification, artifacts and owner review

**Implementation:**
- Node geometry/unit/integration coverage: \`tests/property-merge-union-026.test.js\`, \`tests/property-merge-adaptation-026.test.js\`, \`tests/property-merge-026-integration.test.js\`.
- Compiled desktop QA: \`scripts/property-merge-026-browser-qa.mjs\` added to the existing property suite without dropping previous tests.
- \`0.2.6-dev\` package/source versions in sync; source-built \`index.html\` and \`dist/mappo-0.2.6-dev.html\` remain byte-identical and reproduce deterministically.
- Full two-shard Node and four-suite desktop Firefox/Chromium CI plus aggregate gate on exact PR head; heavy C7 opt-in unchanged.

**Review evidence (superseded when a newer head is pushed):** [full CI run 44995391370](https://github.com/xbwtyz/Mappo/actions/runs/44995391370), **511/511 Node tests**, four browser suites and aggregate gate succeeded on \`77d4f38db9f9d01fdaeb4b50bc8abe5eb03f276c\`. This latest development pass adds a bounded relocation fixture, so final exact-head CI is still required.

## Scope exclusions and risks

- Only one straight continuous seam between two same-block, same-district polygons. No cross-block, corner-only, disconnected, multi-property, hole, arbitrary multi-segment merge or union exceeding 12 corners.
- Exact original plots must tile the merged shape. No B04 retiling or non-convex plot migration.
- Only proven exterior source roads are candidates. No generic construction of multiple frontage roads in other editors; accepted primary frontage semantics remain.
- Building repair is bounded, not a promise of a valid location for every incompatible arrangement. Unsolvable cases fail closed, without removing work.
- No global persistent undo, road reflow or B05 authored parcel displacement in this milestone.
- Relative performance is unmeasured; do not assert latency improvements without controlled benchmarks.

## Release/merge gates

- [x] Owner approved architecture and P1–P5 development.
- [x] Isolated feature branch from verified main, one PR, modular source and versioned compiled HTML.
- [x] P1–P4 functionality implemented with compatibility guards and positive/negative fixtures.
- [ ] P5 **final** complete six-runner CI and aggregate gate on exact final head.
- [ ] Owner independently authorizes merging PR #116.
- [ ] Exact post-merge main CI succeeds.
- [ ] Owner separately authorizes tag, stable release or Pages deployment if desired.

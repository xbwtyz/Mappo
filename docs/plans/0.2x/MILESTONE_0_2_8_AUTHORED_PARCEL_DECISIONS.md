# Mappo 0.2.8 B05 — Author-preserving parcel decisions

**Issue:** [#103](https://github.com/xbwtyz/Mappo/issues/103) · **Approved architecture:** D-028-1 through D-028-6 as presented in the owner review.
**Implementation authorized:** P1–P5; no merge, stable release, tag, Pages or schema change authorized.
**Baseline:** main at 0fa2271b37b37f2473e4cce07fe90376b6b5fd38 · **Target:** 0.2.8-dev · **Schema:** 9.

## User experience
Before: A road move touching a custom/older property stops with parcel-decision-required.
After: Existing Roads review exposes eligible property-specific choices. Users preview **Keep**, **Reshape**, **Transfer**, or **Retire**, when geometry and dependent data allow them; proposals with no safe choice still block Apply. Once fully validated, the road/property change is accepted atomically and can be undone in one step.

## P1 Conflict discovery and provenance
- [x] Reuse road lineage and custom/unknown provenance classification, no silent auto-modification of authored geometry.
- [x] Report directly affected property IDs, candidate options and blockers.
- [x] Deterministic positive and negative fixtures passed in both Node shards.

## P2 Validated parcel choice resolver
- [x] Local authored four-corner Keep / Reshape with independent full validation.
- [x] Topology candidate Keep / Transfer on unchanged eligible footprint, Reshape on eligible successor footprint and Retire for building-free parcels.
- [x] Candidate-only operations; schema-9-compatible bounded original-record archive for chosen topology changes.
- [x] Full regression and negative eligibility evidence passed; topology choices remain deliberately conditional on geometry and dependency proof.

## P3 Building, plot and metadata preservation
- [x] Keep plot and building identities; transform plot geometry only when valid; preserve building footprints and accesses.
- [x] Fail closed when authored/unknown dependent records cannot be safely reconciled.
- [x] Unknown metadata survives accepted candidates; source records of authorized topology outcomes are archived.
- [x] Portable save/reopen, original-record snapshots, and atomic accepted Undo/Redo covered by Node and browser regression.

## P4 Roads workspace and Apply
- [x] Extend existing review cards, conflict navigation and candidate display, not a new workspace.
- [x] Carry choices in both synchronous and worker previews, fresh Apply, reset/clear invalidation.
- [x] Atomic accepted Road history handles cross-entity changes without a parallel store.
- [x] Chromium and Firefox road editor browser QA passed, including the new authored property decision/Apply/Undo flow.

## P5 Release-independent review gate
- [x] Exact-feature-code full CI [#45003249346](https://github.com/xbwtyz/Mappo/actions/runs/45003249346) passed: **523/523 Node** (274+249), four browser suites, aggregate gate, **3m23s**, zero failed/skipped tests on `cdf487a4171a571c140f573f9fa2227b0bb4d8c0`.
- [x] [Fast Checks #45003242437](https://github.com/xbwtyz/Mappo/actions/runs/45003242437) passed: reproducible standalone HTML `index.html` and `dist/mappo-0.2.8-dev.html` generated identically.
- [x] [PR #118](https://github.com/xbwtyz/Mappo/pull/118) open for owner review with acceptance evidence.
- [ ] Exact final documentation-only PR head full CI confirmation.
- [ ] Owner must separately approve PR merge; after merge, verify exact-main post-merge CI.
- [ ] Stable release/tag and Pages deployment remain separately authorized.

## Implementation evidence and failure resolution

- **Before:** Customized/unknown-provenance property edits returned `parcel-decision-required`; the existing Roads review had building and block ownership choices but no parcel resolution controls.
- **After:** Authored parcel cards appear in the existing Roads review. Proven compatible **Keep** or **Reshape** options can be selected for local moves; bounded topology candidates may also offer **Transfer** or building-free **Retire** where full geometry, ownership, road frontage and dependency checks permit. An unsafe choice remains blocked.
- **Source:** `src/core/road-parcel-decisions-028.js` handles bounded topology eligibility and original-record receipts; local reflow, worker preview, synchronous recheck at Apply, desktop Roads UI and existing Road history are reused.
- The first browser acceptance attempts failed because the preview selected a broader topology fallback and a UI choice containing `targetId:null` was rejected as malformed by the local resolver. Both mismatches were corrected, regression fixtures were added, and the exact-code CI completed green.
- Only **locally verified authored reshape** is exercised end-to-end by the new Chromium/Firefox B05 browser fixture. Complex topology choices intentionally fail closed without proven eligibility, and positive topology paths are not claimed to work for every generated city.
- Existing generated-only road behavior and older browser suites passed. No performance speedup or owner-run manual Firefox smoke test is claimed.

## Intentional restrictions
Never silently retire or rehouse authored plots or buildings. Retirement is only offered where there are zero dependent buildings and an auditable original snapshot. Transfer keeps existing geometry rather than inventing road access. Reshape reuses a provable valid shape and preserves building footprints. No guaranteed resolution for every road change, no cross-property arbitrary plot transfer, no new road rights, no mobile QA, no heavy C7 benchmark, and no schema 10.

The road-reflow engine must reject an option or stop for architecture review rather than relaxing schema-9 validation to force an outcome.

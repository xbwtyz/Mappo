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
- [ ] Verify deterministic positive and negative test fixtures.

## P2 Validated parcel choice resolver
- [x] Local authored four-corner Keep / Reshape with independent full validation.
- [x] Topology candidate Keep / Transfer on unchanged eligible footprint, Reshape on eligible successor footprint and Retire for building-free parcels.
- [x] Candidate-only operations; schema-9-compatible bounded original-record archive for chosen topology changes.
- [ ] Full regression and negative eligibility evidence.

## P3 Building, plot and metadata preservation
- [x] Keep plot and building identities; transform plot geometry only when valid; preserve building footprints and accesses.
- [x] Fail closed when authored/unknown dependent records cannot be safely reconciled.
- [x] Unknown metadata survives accepted candidates; source records of authorized topology outcomes are archived.
- [ ] Verify save/reopen and exact history through CI.

## P4 Roads workspace and Apply
- [x] Extend existing review cards, conflict navigation and candidate display, not a new workspace.
- [x] Carry choices in both synchronous and worker previews, fresh Apply, reset/clear invalidation.
- [x] Atomic accepted Road history handles cross-entity changes without a parallel store.
- [ ] Browser QA.

## P5 Release-independent review gate
- [ ] Node and Firefox/Chromium acceptance, full six-runner CI and aggregate gate on final PR SHA.
- [ ] Reproducible byte-identical source-generated index.html and dist/mappo-0.2.8-dev.html.
- [ ] Open review-ready PR with acceptance evidence; owner must separately approve merge.

## Intentional restrictions
Never silently retire or rehouse authored plots or buildings. Retirement is only offered where there are zero dependent buildings and an auditable original snapshot. Transfer keeps existing geometry rather than inventing road access. Reshape reuses a provable valid shape and preserves building footprints. No guaranteed resolution for every road change, no cross-property arbitrary plot transfer, no new road rights, no mobile QA, no heavy C7 benchmark, and no schema 10.

The road-reflow engine must reject an option or stop for architecture review rather than relaxing schema-9 validation to force an outcome.

# Mappo 0.2E / E2 — Acceptance and integration report

> **Status (2026-11-20):** The E2 feature is implemented for review in **[PR #60](https://github.com/xbwtyz/Mappo/pull/60)**, based on the E2 planning branch from **[PR #59](https://github.com/xbwtyz/Mappo/pull/59)**. Both are unmerged. Acceptance is **pending successful full CI on the final PR head**. Do not merge, tag, publish, change project schema, or call E2 released without separate owner approval.

## Scope implemented

- Select existing four-corner property → **Split property** in the ordinary Inspector.
- One validated straight divider at a normalized frontage/rear fraction, adjustable by map drag and numeric percentage. Both successors remain attached to their accepted street edge.
- Original property ID/name/custom identity remains on the frontage-start side; new deterministic property/plot IDs only for newly created right-side fragments.
- Reuse existing 3I plot-subdivision geometry and E1 whole-project history machinery instead of parallel implementation; preserve untouched plot identities and reject unknown annotations that cannot be partitioned safely.
- Calculate ownership for buildings that remain in place. Block crossings and access conflicts; require explicit authorization for safely verified protected ownership transfers.
- Draft-only preview, statuses, Reset, Cancel and Escape. Independent schema-9 validation and portable format-1 round-trip before Apply; one accepted city transaction and one whole-split Undo/Redo entry. History remains session-only and is cleared by load/regeneration.
- Match compiled offline `index.html` and `dist/mappo-0.2-dev.e2.html` with package and version metadata. No 0.2 release is authorized.

## Validation evidence and gates

| Gate | Check | Status |
| --- | --- | --- |
| E2-A | Pure frontage/rear geometry; draw, numeric input, Reset, Cancel; nonmutating preview | Implemented; browser and integration CI required |
| E2-B | Partition existing strip plots, preserve original IDs, allocate new fragments deterministically | Unit tests and schema round-trip; review edge/metadata protection |
| E2-C | Detect crossing buildings, handle safe ownership, block invalid access, protect customized records | Crossing regression added; building transfer scenarios require further coverage |
| E2-D | Full-project validator, portable round-trip, stale draft check, atomic Apply + session Undo/Redo | Implemented and tested by E2 model and browser suites |
| E2-E | Full Node regression; Chromium/Firefox desktop and phone; standalone byte parity | **Must be green on current PR head before merge** |

The source-side 4+ focused E2 model tests passed in temporary GitHub validation runs. On the first browser runs, CI revealed bundled-script symbol collisions, panel overlaps on phone and extra workspace revision events. The branch has fixes for these issues and uses the standard full PR CI as the acceptance authority. **Earlier failed/cancelled runs do not constitute final acceptance.**

Reference: [PR #60 checks](https://github.com/xbwtyz/Mappo/pull/60/checks).

## Preservation and review requirements

- Confirm generated Small/Large radial, organic, planned and linear fixtures; legacy schema-9 files and E1-created single-plot sources.
- Confirm source area equals the sum of successors; child plots tile properties with no gaps, overlaps, orphan references or unauthorized metadata copying.
- Test invalid narrow cuts, self-intersections, unusual plot dividers, legacy unknown plot fields, protected/unknown building ownership, crossing footprints, courtyards, sibling-crossing access paths and invalid stale transactions.
- Verify custom names/uses, roads, water, terrain, defenses, districts, unrelated properties/buildings, recovery and ordinary save geometry are unchanged where not explicitly part of the split.
- Use Chromium and Firefox at desktop/phone size including real pointer/touch, reachable controls, readable status and map space. No forced user walkthrough.
- Verify checked-in root and versioned HTML are byte-identical after `npm run build`. No temporary E2 workflows remain in the final feature PR.
- Check modular reuse/nonredundancy and make a specific merge recommendation only after all CI gates pass.

## Deliberately out of scope

Arbitrary angled/curved cuts, non-four-corner properties, automatic building slicing/deletion/relocation, merging properties (E3), independent plot-count changes (E4), more expressive buildings (0.2F), migration of schema 9, physical user testing, publication of 0.2, and unrelated large-city road frame stalls tracked in [issue #44](https://github.com/xbwtyz/Mappo/issues/44).

**Merge flow:** PR #59 design needs its own approval/merge. After that, PR #60 may be retargeted to the updated `main`, and **only with fresh all-green CI plus explicit owner approval** may it be merged. No automatic release.

# Mappo 0.2.3 — A06 Bounded Topology Ownership Reflow

**Status:** Implementation branch, not merged or released. Issue [#98](https://github.com/xbwtyz/Mappo/issues/98).
**Architecture:** D-023-1..5 and C-023-A/B/C approved. Baseline 0.2.2-dev, schema 9, format 1.

## Intent and user value

Mixed-district/land-use ordinary road edits may produce valid street geometry but remain blocked because the existing engine cannot assign resulting blocks safely. 0.2.3 adds direct geometric predecessor/successor lineage and asks users only for the ownership of genuinely ambiguous successors in the existing Roads review panel. Existing authored-protection and independently validated atomic Apply remain compulsory.

## Confirmed baseline fixtures

- **R1:** small radial seed `c2-radial`, remove `RD-0098`; `BLK-0029` and `BLK-0030` merge across DIST-003/DIST-001.
- **R2:** small planned seed `c2-planned`, merge `N-0139` into `N-0140`; the two original blocks restructure into three successors. Only one new face overlaps both predecessors; the other two originate solely from BLK-0030.
- **R3:** no valid normal user operation involving more than 32 affected blocks is established. Keep the current `TOPOLOGY_BLOCK_LIMIT=32` and do not promise larger work.

## Implementation contract

1. Use the existing face matcher and polygon overlap engine, with work bounded by `ROAD_FACE_WORK_LIMIT`. Produce complete, sorted direct old-to-new lineage, with area-closure checks.
2. For true split/merge/many-to-many, generate deterministic new block IDs; keep one-to-one IDs. Give each old block only its **directly overlapping** successor IDs in the ledger.
3. Retain one-source district/use values automatically. Require explicit choices for multiple directly overlapping source classifications; never default to largest area or first source.
4. Do not transfer opaque predecessor metadata by cloning an arbitrary block. Construct new records from proven fields. Protect authorship, custom parcels, known/nonknown metadata and protected infrastructure by refusing unresolved drafts.
5. Rebuild district membership from selected final ownership, then call existing `validateDistricts` and full `validateStoredProject`. A choice causing district disconnect/emptiness remains blocked.
6. Keep choices transient in the Roads preview. Clear on changed geometry, invalidate pending work, send through both synchronous road preview and junction worker; send exact choices into fresh independent Apply.
7. Display successor choices in Roads review, support keyboard and locating the successor on the map, and summarize generated property/building changes before Apply.
8. Keep six-runner CI, deterministic standalone `index.html` and `dist/mappo-0.2.3-dev.html` byte-identical, Firefox/Chromium desktop acceptance and schema 9.

## Acceptance and approval gates

- R1/R2 positive district choices, R2 disallow unrelated choices, mixed usage choices, opaque metadata blockers, no unapproved custom destruction.
- Both preview paths plus fresh Apply deterministic and identical; Cancel, Reset, stale results, Undo/Redo and file round trip.
- Full current CI on review-ready PR, with actual checked-commit evidence. No merge, release, tagging or Pages without separately explicit owner approval.
- Capacity expansion is **not** part of this PR; reevaluate after a valid >32-block input and measured budgets.

**Status distinction:** Green tests establish the committed code's coverage, not approval to merge or release.

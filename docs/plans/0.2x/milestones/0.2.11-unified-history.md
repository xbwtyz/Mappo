# Mappo 0.2.11 D01 — Unified Accepted Session History

**Implementation authorization:** The owner approved D-031-1–5 (A/A/A/A/A), detailed P1–P5, and a fresh branch/PR with full CI. **Merge, tag, release and Pages require separate authorization.** [Issue #106](https://github.com/xbwtyz/Mappo/issues/106).
**Base:** main `8923da9` (post-merge CI passed). **Target:** `0.2.11-dev`, schema 9, portable format 1.

## Approved user outcome

After a road edit, property or plot change, building change, rename and compound transform, Undo/Redo navigates the **accepted chronological sequence** across editors. Recent accepted edit labels appear in the existing workspace. Pending draft Reset/Cancel remains separate. History expires on project import/rebuild and is **not** saved. There is no arbitrary time travel.

## P1 — Integration matrix, acceptance and boundaries

| Accepted mutation pathway | Current source/adapter | D01 handling |
|---|---|---|
| Road geometry and neighborhood reconciliation | `src/app.js::commitRoadEditB4`, `src/editor/road-history.js` | Observe **one** validated accepted project after async race gate, family road; preserve road/workspace restore |
| Property geometry and plot partitions | `src/app.js::applyPropertyEdit3I`, `src/editor/property-history.js`, `src/editor/plot-application-027.js` | Observe one whole candidate per accepted Apply, family property |
| Property creation/deletion/split/merge | `applyPropertyCreationE1`, `deleteProperty4A`, `PropertySplitControlsE2.onCommit`, `PropertyMergeControlsE3.onCommit` | Observe one whole candidate per accepted multi-record operation |
| Building transforms/vertices/edges/courtyard | `applyBuildingTransform`, `src/editor/building-application.js` | Observe one validated accepted footprint; preserve authored identity |
| Building add/replace/delete/clear | `applyStructurePlacement3H`, `deleteStructureBuilding3H`, `clearPropertyBuildings4E` | Observe one accepted structural candidate |
| C01 compound create/update/dissolve/transform | `c01SaveMembership`, `c01ApplyTransform`, `src/editor/building-compounds-c01.js` | Observe one accepted group change; preserve membership/geometry |
| Identity and building-use | `src/ui/identity-workspace.js`, `src/core/identity.js` | Observe single accepted record; legacy history disabled in integrated UI and shared Undo/Redo includes identity |
| District, fortification, landscape and other unsupported accepted city changes | `src/app.js` commit callbacks / generator pathways | Explicit ledger barrier, no stale restoration; visual-only controls are not history entries |
| Generation/rebuild, file-open and recovery | `generate`, `applyProjectDocument`, `src/ui/project-files.js` | Explicit session-history clear/baseline; existing project preservation unchanged |
| Outline, terrain, water and tentative geometry/identity drafts | Existing editor-local draft operations | No accepted journal entries until accepted city changes; Cancel/Reset remain local |

**P1 gates:** Inventory every accepted change and existing reversal; preserve author-owned metadata. No visual-only action may clear history. Baseline negative interleaving fixtures retained.

## P2 — Shared ledger, strict validation and bounds

`src/core/accepted-edit-history-d01.js`: immutable full before/after accepted project states, chronological `past/future`, stable serial, type/action/target labels, bounded estimated UTF-16 bytes, exact accepted-state comparison, independently validated portable restore and safe road workspace reconciliation. `observe` compares authoritative city; unsupported accepted edits clear history. A new accepted transaction clears Redo.

**P2 gates:** Interleaved Undo/Redo exactly restores expected states; stale async and out-of-band edits do not replay; 20 entries and 64 MiB combined budget; oldest-pruning and oversize conditions are reported, never silently represented as undoable.

## P3 — Single actionable history

`src/app.js` records only accepted-city transitions in the common project-change notification; invalid or uncommitted changes never enter history. Legacy per-editor Apply validation remains untouched. Existing accepted Undo/Redo buttons delegate to the central chronological ledger; split/merge and identity controllers receive explicit adapters. No other local history may become an independent action in the shipped interface.

**P3 gates:** Exactly one journal entry for road reflow, property split/merge, building draft and compound group Apply. Cross-editor mixed sequence can Undo/Redo completely. Identity now Redos. Import/rebuild clears, selection changes do not.

## P4 — Compact shared UI and draft precedence

Use existing map workspace Undo, add adjacent Redo, and a collapsible read-only accepted history list. Preserve draft-reset precedence and Ctrl/Cmd shortcuts, with focused form field protection. No timeline jumping or separate workspace.

**P4 gates:** Global history usable regardless of current selected inspector, pending drafts block rather than being silently discarded, accessible status and labels in Firefox/Chromium.

## P5 — Verification and owner review

Run focused Node (ledger/capacity/identity), existing Node suites, all four browser QA runners plus new cross-editor Chromium/Firefox acceptance, offline standalone build parity, exact-head aggregate CI. Keep previous dist archives; no schema/envelope change. Report tested memory/size, CI duration, failures and fixes, UX before/after and known non-goals. Open PR without merging.

## Explicit limitations

History is **session only** (not encoded in portable project files or recovered after reload). No 3D, generalized optimistic merge, global history for districts/fortification/landscape, click-to-jump or forced walkthrough. Full-project snapshots are bounded for safety; large transactions may make older history unavailable and must display that fact.

**Approval gates:** P1–P5 implementation approved; merge, release, tag, Pages *not* approved.

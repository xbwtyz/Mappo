# Mappo 0.2E / E4 — Plot count acceptance report

> **Status (2026-11-20):** E4 was **merged into main** via [PR #64](https://github.com/xbwtyz/Mappo/pull/64) after successful [full CI run #44826623008](https://github.com/xbwtyz/Mappo/actions/runs/44826623008). This report preserves historical acceptance evidence. **Mappo 0.2 remains unreleased.**

## User-facing changes

- The existing 3I Property Geometry panel now offers **+ Split plot** and **− Merge plots**. No separate editor, wizard or mandatory walkthrough.
- One straight frontage-to-rear divider can be inserted or removed per accepted Apply; the map and Inspector expose draft consequences without touching accepted data.
- A split keeps the original frontage-start plot ID and user-authored metadata on the left, and allocates one deterministic unused ID on the right; no fabricated metadata.
- A merge keeps the left plot's ID, and retires the right plot. A full copy of the old source/retired plot is stored in optional `plotCountHistoryE4` property lineage. Authored or unknown source metadata requires explicit consent; unsupported/full lineage blocks.
- Building IDs, footprints, holes, entrances and accepted access geometry remain untouched; `deriveOccupiedPlots` computes real building membership against new plot geometry.
- Apply performs full-project schema-9 validation and portable save/load verification and enters the existing 3I property history as a single transaction. Structural Undo/Redo captures exact whole-city before/after snapshots; session history clears after reload/regeneration.

## QA evidence and gates

| Check | Current status |
| --- | --- |
| Existing 3I plus E4 model tests | Passed focused Node workflow |
| Compiled E4 standalone/root HTML | Build workflow passed; both blobs have identical SHA |
| Full Node regression | Passed on merged PR #64 head |
| Chromium and Firefox browser matrix, desktop and phone | Passed on merged PR #64 head |
| Authored plot metadata, save round-trip, consent and lineage | E4 Node cases; inspect negative edge cases before merge |
| Temporary CI workflows | Removed from implementation branch |
| Schema compatibility | Schema 9 retained |

## Intentional boundaries

- Only accepted convex four-corner properties with canonical frontage-to-rear strips.
- One count change per Apply, no arbitrary polygon union, multi-divider batch or automatic building/road redevelopment.
- Any unauthorized loss of user annotations, unsupported lineage, invalid/ambiguous building membership, or invalid geometry blocks.
- The stable public 0.1 release is unchanged. E5 is the next integrated property-editor QA phase after E4 acceptance.

## Review

- E4 design: [PR #63](https://github.com/xbwtyz/Mappo/pull/63)
- E4 implementation: [PR #64](https://github.com/xbwtyz/Mappo/pull/64)
- [CI checks](https://github.com/xbwtyz/Mappo/pull/64/checks)

**No merge, tag, publish or schema migration without separate approval.**

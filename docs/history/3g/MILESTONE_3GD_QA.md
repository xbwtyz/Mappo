# Milestone 3G-D — Accepted Building Undo/Redo and Portable Persistence

**Versioned checkpoint:** `0.1-dev.3gd`  
**Branch:** `feature/building-history-3gd` · **Base milestone:** merged 3G-C PR #8  
**Status:** Implementation branch; owner must approve merge separately.

## D1 — Bounded accepted-edit history

`src/editor/building-history.js` tracks up to **20** accepted edits in memory, grouped by building ID. Each Apply records the complete set of geometry-dependent building fields (footprint, holes, orientation, area, occupied plots, entrance, access path and frontage road). Redo is cleared only for the newly edited building. History is never included in the project/workspace or recovery envelopes.

## D2 — Atomic geometry Undo/Redo

History operations apply geometry to an independently cloned project and retain unrelated building identity and metadata. Before committing, they verify building identity, current geometry continuity, whole-project `validateStoredProject`, and `createProjectDocument → encodeProjectDocument → decodeProjectDocument`, comparing the resulting city exactly. An invalid state leaves accepted geometry untouched. Applies, Undos and Redos mark recovery dirty. An active uncommitted transform blocks history operations.

## D3 — Contextual controls and shortcuts

The floating Building Edit panel has **Undo building** and **Redo building** controls. They operate on the active selected building rather than changing another building without warning. The map contextual Undo routes to building history while the building editor is active, otherwise existing outline, identity, landscape, district and defense histories are unchanged. Ctrl/Cmd+Z undoes and Ctrl/Cmd+Y / Ctrl/Cmd+Shift+Z redoes accepted building edits, but text inputs and editable controls retain their normal shortcuts.

## D4 — Persistence and backward compatibility

Accepted changed geometry remains in schema **9** files and browser recovery. Session history is cleared after loading a project, restoring a recovery snapshot or regenerating the city. The existing workspace schema remains **1**. No new fields are serialized; old schema-9 projects remain readable.

## D5 — Regression and distribution

- `tests/building-history.test.js`: pure history, bounded scope, metadata preservation, UI commit/Undo/Redo, keyboard safety and schema-9 round trip.
- Existing regression and browser QA suites continue to protect 3G-A/B/C behavior.
- `index.html` and `dist/mappo-0.1-dev.3gd.html` are built from modular source, and must be byte-identical.
- Unified GitHub Actions CI runs Node tests, checked-in build parity and desktop/ultrawide/tablet/phone Chromium + Firefox QA before merge.

## Guardrails

- No cross-property moves or building placement/deletion.
- No automatic edits to non-selected buildings.
- No saving Undo/Redo history or changing project schema 9.
- No changes to previous versioned standalone files.
- Do not merge without explicit approval from the owner.

[Standalone preview](../../../dist/mappo-0.1-dev.3gd.html) · [Roadmap](../../ROADMAP.md) · [3G-C QA](MILESTONE_3GC_QA.md).

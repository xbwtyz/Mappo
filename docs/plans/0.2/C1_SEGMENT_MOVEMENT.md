# 0.2C / C1 — Bounded road-segment movement

**Status:** C1-A engine checkpoint (implementation underway; *not* full C1 acceptance).

## Goal
Translate both endpoints of one ordinary road segment together while preserving network connectivity, every pre-existing road ID, stable face identities, property relationships and all existing city data. The accepted project remains unchanged during preview.

## Checkpoint C1-A: detached candidate engine
- Pure `prepareSegmentTranslationC1(project, roadId, {x,y}, workspace?)` in `src/core/road-segment-translation.js`.
- Requires finite bounded displacement, a valid accepted graph and existing road.
- Rejects protected incident roads at either endpoint, crossing/out-of-bounds geometry and topology/face identity ambiguity.
- Carries forward only proven, one-to-one block-area and vacant open-space adjustments.
- **Developed-property dependencies are explicitly blocked in this checkpoint**, not auto-migrated.
- Revalidates entire project and portable Save/Load round-trip for successful candidates.
- Returns `applyReady:false` *always*; no UI, file/recovery, accepted state or history changes in C1-A.

## Remaining to complete C1
- Extend dependency-safe parcel/plot reconciliation to two endpoint changes with positive *developed-city* fixtures, no building modifications.
- Introduce segment selection and before/after preview in the Road Inspector, including keyboard/touch and precise endpoint coupling.
- Extend final atomic Apply gate and coupled Undo/Redo for multi-junction moves, independent candidate recomputation, field whitelist and one file revision.
- Full Node, current legacy fixtures, Chromium and Firefox at desktop/ultrawide/tablet/phone, offline bundled HTML in version `0.2-dev.c1`.
- Open separate owner approval gate before merge; preserve schema 9.

## Scope and non-goals
No road insert/remove, class changes, arbitrary spline paths, special/protected edge rewrites, silent parcel ownership changes or building movement. Those remain C2–C5 topics.

C1-A is an initial engine implementation, not a production-ready road segment editor. Do not mark C1 complete or merge merely because its focused tests pass.

# 0.2C C1 — Road-first intent preview checkpoint

**Status:** Feature branch implementation, not approved for merge or release. Based on merged B5 `main`; planning revision is in PR #35.

This checkpoint intentionally lets users **position an ordinary street as a detached draft despite developed-neighborhood conflicts**. Select a street in Road Inspection, drag it (mouse/touch), nudge it with keyboard arrows or enter the desired X/Y offset. The source and destination are shown distinctly; the two endpoints and all incident roads follow the same translation intent. The requested position is retained in the preview even if topology needs normalization, blocks need reflow or old parcels no longer fit.

**Crucial distinction:** C1 `draftable` does not imply `applyReady`. These new road intents are **always preview-only**, because the full road-first neighborhood adaptation pipeline will be built in C2–C5. Existing independently verified B4 single-junction Apply and Undo/Redo continue to work as before.

No accepted city writes, saving, recovery, history or global regeneration while drafting. Protected infrastructure remains ineligible. No schema change; preserve schema 9, property-first workflows and existing standalone versions.

**Positive QA:** 15-world-unit moves can be previewed in ordinary developed streets of all four morphologies, not just 0.001-unit accepted offsets. Test road-drag/cancel, stale session, touch, graph-conflict visibility, and old B4 regressions. Full Node and browser suites plus versioned offline HTML parity required before this checkpoint is considered review-ready.

**C2 handoff:** Create typed identity and ownership reconciliation and local generated-property/plot reflow to turn supported large drafts into fully verified accepted edits.

## Review fix: validated draft inputs and repeat gestures

The initial preview helper accidentally called a nonexistent `Object.c1IntentFreeze` and crashed all six new tests. Corrected to `Object.freeze`. Invalid/blank/nonfinite numeric offsets now clear the stale ghost, show an actionable error and never represent an Apply-ready draft; Reset clears the error. Hit-testing recognizes a previously displaced selected road at its *new* draft location so subsequent drags can refine placement. Tests assert draft cancellation, stale replacement, repeat movement, protected-feature rejection, and full-recovery isolation.

Real-browser pointer mouse/touch/cancel checks are required in addition to numeric input checks; full CI must be green before declaring this checkpoint ready.

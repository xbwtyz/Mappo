# 0.2B / B3 — Non-destructive neighborhood reconciliation preview

B3 makes existing B1/B2 analyses visible in road inspection; it **never** enables Apply, changes accepted city geometry, saves a candidate or appends history. The accepted city canvas remains the baseline; the proposed candidate is drawn in distinguishable dashed outlines and can be toggled off.

## Behavior
- A settled junction proposal calls A3 as before, then B2 once via injected `reconcile`. For rejected B2 results, B1's proven topology may provide a **roads/blocks-only** fallback. It never invents a parcel repair.
- New core inventory `roadReconciliationPreviewB3` extracts typed geometry from accepted and candidate cities, with before/after area/length measurements. The renderer draws accepted outlines in gray and candidate geometry dashed (roads/blocks amber, property violet, plots teal).
- Detailed per-object changes and unresolved typed issues are listed, keyboard-operable, paginated and linked to a Locate action. The selected item is highlighted on the map.
- B2's actual candidate is shown only when validated. If rejected, labels explicitly state **topology only**; unresolved property/building changes are **not** fabricated. If A1/B1 reject, no unproven geometry is shown.
- Each project replacement, selection change, Reset, Cancel, Escape, drag cancellation or stale callback clears prior candidates. Draft geometry is not serialized and the existing A4 transient workspace/camera restoration is unchanged.
- Toggle only controls overlay visibility, not project state. No new schema-9 fields, save/recovery or Apply/Undo interfaces.

## Test and merge gates
- Focused core preview tests, null/blocked fallback, typed IDs, stale callbacks, DOM harness preservation/toggle.
- Chromium + Firefox × 1440×900, 5120×1440, 768×1024, 390×844 checks for panel/status/toggle with existing A4 preservation suite.
- Complete Node regression suite, byte-exact generated `index.html` and versioned offline `dist/mappo-0.2-dev.b3.html`.
- One final commit and one PR, with separate approval to merge.

B4 owns Apply, project validation at commit time, history and persistence. B3 is an inspection and visualization milestone only.

# Mappo 0.2C C7 closeout — review and acceptance record

**Base:** merged C7 on main, 1a86528c4494303b88ae80f49f92308a3b9b68e8.
**Branch:** feature/mappo-0-2c-c7-finalization.
**Scope:** satisfy [C7 finalization plan](C7_JUNCTION_FINALIZATION_PLAN.md) before proceeding with 0.2D. Do not merge or change schema 9 without separate owner approval.

## Source review
- `src/editor/road-preview.js`: Junction preview runs the A3 impact report and local C7 reconciliation sequentially. Each call is synchronous after the 180 ms debounce; already-running computation cannot be interrupted by a subsequent input. Draft revision guards reject queued obsolete callbacks.
- `src/core/neighborhood-reflow.js`: Tries preserved geometry, local adaptation and topology reconstruction for eligible generated work. Keep provenance protection and building decisions.
- `src/editor/road-application.js`: Rebuilds candidates at Apply, compares with inspected records and validates portable save/reopen; this is a critical safety guard, not an optimization target.
- `src/ui/road-inspection.js`: The B3 overlay is reconstructed on every render, even when the accepted project, reconciliation and topology are unchanged. Investigate after baseline profiling. Also verify statuses are not excessively re-announced.
- `tests/road-editor-acceptance.test.js`: C6 and C7 cases cover all four layouts, crossings, custom building approval, Undo/Redo and exact portable reopen in Node. `scripts/road-browser-qa.mjs` already exercises mouse, simulated touch, focus and primary edit controls; physical hardware is not implied.

## Performance evidence
- Baseline script: `scripts/c7-browser-performance.mjs`. Runs Chromium and Firefox, desktop 1440x900 and phone 390x844, Small Organic N-0139 Y+15 and Large Organic N-0145/N-0239/N-0332 X+8 (cold and warm; fresh accepted project each run).
- Instruments browser release-to-preview, A3 report calculation, local reconciliation, DOM update, frame gaps and Apply time. It also checks invalid proposals, rapid draft supersession, accepted-state isolation and Undo/Redo. Per-case raw timings, sample counts, machine details and median/p95 summaries are written to `artifacts/c7/performance.json` and uploaded as CI evidence.
- Browser performance timings are diagnostic: CI runners are variable; do not set uncalibrated hard thresholds. Compare the same fixtures before and after optimization, record any visible stalls and any remaining responsiveness limitations.

## C7 completion gates
- [ ] Baseline Chromium/Firefox performance collected and reviewed on exact commit.
- [ ] Measured bottleneck addressed and same cases rerun with cold/warm samples, frame gaps and Apply.
- [ ] Latest-draft wins, invalid/superseded draft cannot Apply, project and recovery unchanged until accepted.
- [ ] Final Node regressions, full Chromium/Firefox viewport matrix and byte-identical offline distribution.
- [ ] Four C7 junction fixtures; C6 street, bend, split and merge fixtures; generated-only and named custom building protection, boundary/terrain/water protection and legacy schema-9.
- [ ] Actual physical touch: street/junction/bend drag, release/cancel/pan, scroll and conflict controls.
- [ ] Keyboard-only real-device walkthrough: junction select/nudge, read status, conflict choice, Apply and Undo, collapsed-panel focus and scrolling.
- [ ] Actual screen reader: status announcements without chatter, Resolve conflict focus and labels, exit controls.
- [ ] Evidence archived with exact release-candidate commit and final review of remaining blockers.

**Manual hardware/AT gate:** CI-simulated touch and DOM-based accessibility checks are useful but **do not** satisfy the physical-device and real screen-reader requirements. These boxes must remain open until witnessed and recorded. Do not declare complete based on automation alone.

**Follow-on boundary:** Preview redesign, replacement-report language and general road editing UX belong to 0.2D, not this closeout.

# Mappo 0.2C C7 closeout — review and acceptance record

**Base:** merged C7 on main, 1a86528c4494303b88ae80f49f92308a3b9b68e8.
**Branch:** feature/mappo-0-2c-c7-finalization.
**Scope:** historical source review and acceptance record for the [C7 finalization plan](C7_JUNCTION_FINALIZATION_PLAN.md).

## Current disposition

C7/P7 is accepted for the 0.2D handoff. [P7 CI](https://github.com/xbwtyz/Mappo/actions/runs/44671837906) passed on runtime commit `f3bf860`. [Issue #44](https://github.com/xbwtyz/Mappo/issues/44) remains open for reproducible input stalls. Revisit autosave preparation if a short hands-on check repeatedly reproduces unresponsive input during ordinary junction edits, including shortly after an edit that triggers autosave. See [the benchmark fixture, results and caveats](C7_P7_INPUT_RESPONSIVENESS.md#results-and-disposition).

## Historical source review
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
- [x] Baseline Chromium/Firefox performance collected and reviewed on exact commit.
- [x] Measured bottleneck addressed and same cases rerun with cold/warm samples, frame gaps and Apply.
- [x] Latest-draft wins, invalid/superseded draft cannot Apply, project and recovery unchanged until accepted.
- [x] Final Node regressions, full Chromium/Firefox viewport matrix and byte-identical offline distribution.
- [x] Four C7 junction fixtures; C6 street, bend, split and merge fixtures; generated-only and named custom building protection, boundary/terrain/water protection and legacy schema-9.
- [x] Physical touch accessibility gate — accepted by project owner on 2026-11-19; device-level results not supplied.
- [x] Physical keyboard accessibility gate — accepted by project owner on 2026-11-19; individual case evidence not supplied.
- [x] Screen-reader accessibility gate — accepted by project owner on 2026-11-19; specific software and announcement logs not supplied.
- [x] Evidence archived with exact release-candidate commit and final review of remaining blockers.

**Manual hardware/AT gate:** Owner accepted this gate as complete on **2026-11-19**. This sign-off
does **not** establish that individual physical devices or screen readers were independently
witnessed or documented. The scenario-level worksheet remains open for evidence collection.
CI-simulated touch and DOM-based checks are separate evidence. Remaining large-city stalls are tracked in [Issue #44](https://github.com/xbwtyz/Mappo/issues/44).

**Next milestone** is [0.2D](MILESTONE_0_2D_ROAD_UX_PLAN.md), covering preview redesign, replacement-report language, and general road-editing usability.

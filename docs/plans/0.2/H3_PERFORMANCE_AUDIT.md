# Mappo 0.2H H3 — Large-city road responsiveness audit

**Status:** Benchmark and issue review completed on [H3 PR #89](https://github.com/xbwtyz/Mappo/pull/89). Final PR-head CI and owner merge approval are separate. No production JS, historical-save fixture, schema or compiled distribution is changed by H3.

## Source and reproducibility

- Baseline: [merged H1/H2 main](https://github.com/xbwtyz/Mappo/commit/d6eb81f5017c644ba44a607f17d8724b76a852c1), runtime `0.2-dev.g3g`, project schema **9**.
- Current measurement: [H3 branch run #44956907935](https://github.com/xbwtyz/Mappo/actions/runs/44956907935), [integration artifact `artifacts/c7/performance.json`](https://github.com/xbwtyz/Mappo/actions/runs/44956907935/artifacts/14728130923). **The integration benchmark step passed** and uploaded raw observations. That intermediate branch run's Node shard 1 *failed only the H1 release-policy assertion* because a temporary `main, feature/...` trigger was used to collect measurements; all 227 other tests in that shard passed. H3 removes the temporary trigger before final CI. Do not cite the measurement run as a fully green CI.
- Runner: Intel Xeon 6975P-C, four logical CPUs, 15.3 GiB RAM, Linux, Node 22.23.5; Playwright Chromium/Firefox headless. Desktop viewport **1440×900 only**, honoring 0.2G's desktop-support policy. Shared GitHub runners and CPU contention introduce variability.
- Unchanged `scripts/c7-browser-performance.mjs`: Small Organic `c2-organic` junction `N-0139` Y +15; Large Organic same seed junctions `N-0145`, `N-0239`, `N-0332` X +8. Each starts from the unchanged accepted city, with cold and warm measurements, exactly **six Large preview samples per browser**; independent Apply, Undo/Redo and cancellation on the warm samples.
- Reproduce on a developer workstation after `npm run build`, temporary Playwright 1.56.1 installation and browsers: `node scripts/c7-browser-performance.mjs`. Or manually dispatch Mappo CI with `run_c7_benchmark` selected. **No benchmark added permanently to routine CI.**

## Current results (desktop, per browser)

| Measurement | Chromium | Firefox | Interpretation |
| --- | ---: | ---: | --- |
| Small preview median (n=2) | 402 ms | 394 ms | Includes debounce and browser UI work |
| Large preview median (n=6) | **926 ms** | **1,020 ms** | Time from changed input to Apply-ready state |
| Large preview p95 (n=6) | 954 ms | 1,042 ms | Nearest-rank small-sample statistic, not a population percentile |
| Median Large worker computation (n=6) | 605 ms | 690 ms | Analysis plus neighborhood reconciliation run off the UI thread |
| Median worker impact analysis | 142 ms | 168 ms | Part of worker compute, not separately blocking the UI |
| Median worker reconciliation | 462 ms | 524 ms | Heaviest stage inside the worker |
| Worst preview frame gap | **133 ms** | **183 ms** | Residual brief main-thread frame stalls, not the original ~1 second |
| Worst preview page timer gap | 156 ms | 195 ms | Another indicator of UI scheduling stalls |
| Trusted keyboard events while checking | 66 | 70 | Real trusted Shift presses were processed during background previews |
| Max keyboard event-to-handler delay | 88 ms | 1 ms | Chromium peak only; browser timestamp accuracy varies |
| Max Playwright key-command turnaround | 114 ms | 127 ms | Includes browser automation overhead |
| Median independent Apply completion (n=3) | **787 ms** | **871 ms** | Includes fresh worker rebuild, commit, UI update; *not* click-handler blocking |
| Longest Apply click handler | **39 ms** | **36 ms** | Previous issue #46's ~1–2.3 second click stall did not reproduce |
| Longest Apply frame gap | 135 ms | 157 ms | Brief stalls still occur during asynchronous Apply |

The latest historical [P7 report](C7_P7_INPUT_RESPONSIVENESS.md) recorded Large preview medians **1.02–1.10 seconds**, maximum preview frame gaps around **150–167 ms**, and Apply completion **0.85–0.95 seconds**, on a different runner. The present measurements are broadly comparable or modestly faster in total duration; Firefox's **183 ms** peak is within plausible host/run variation from P7, not evidence of a new consistent regression. Earlier pre-worker C7 Firefox samples showed roughly **1,050 ms** main-thread frame stalls, which **did not reproduce**.

### What the trace does and does not establish

- The original worker remains active for all junction previews in the measured fixture. Client-to-worker dispatch took only 2–5 ms median; median return transport 3–7 ms. Most total preview wall time is debounce/scheduling plus expensive **worker-side** calculation; equating ~1 second readiness to ~1 second frozen UI is incorrect.
- The largest preview frame gaps occur **while the worker is still calculating**, not during a recorded canvas draw. The trace does not conclusively attribute those gaps to autosave, garbage collection, browser/host scheduling or another callback. Do not promise their absence or assign an unproven root cause.
- All test scenarios checked latest-draft safety, intentionally invalid draft rejection, accepted-project and saved-revision invariants, separate authoritative Apply, one atomic change and Undo/Redo. Both browsers passed these assertions.
- Main-thread input/frame gaps of 100–183 ms remain noticeable. This is a measurement and acceptance review, **not** a claim that all responsiveness issues are gone. Reassess if actual desktop testers observe persistent input stalls, especially near autosave; profile the main thread and recovery callbacks on the affected machine before optimizing.

## Issue disposition recommendations

**[#44 — Large-city preview input freezes](https://github.com/xbwtyz/Mappo/issues/44): KEEP OPEN, NARROW THE REPRODUCTION.** Its original description says preview runs synchronously on the browser UI thread; that historical architecture was replaced by the bundled Web Worker in P1–P7. The original roughly 1-second Firefox input freeze was not reproduced today. However, 133–183 ms frame stalls remain, and the sample size/runner variability prevent a complete fix claim. Update the issue's working symptoms to the remaining frame/input spikes, and defer any performance source fix until a localized main-thread profile shows a responsible hotspot. Review as a **known 0.2.0 limitation** in H4; owner decides if release-blocking.

**[#46 — Synchronous junction Apply](https://github.com/xbwtyz/Mappo/issues/46): PRIMARY WORKER PATH FIX VERIFIED; PROVISIONAL CLOSURE CANDIDATE.** The current Large Organic junction Apply uses an independent worker operation and revision/fingerprint/ledger checks before atomic commit. Its click handler maxed at **39/36 ms** instead of historical stalls of ~1–2.3 seconds. Complete validation still takes ~0.8–0.9 seconds **asynchronously**. A fallback when workers cannot initialize and ordinary road edit paths can still validate synchronously, so *do not* claim every road Apply path is nonblocking. Recommendation: after owner review, close this **specific** stale junction report or narrow it to those separately scoped paths rather than reopening the fixed primary case.

**[#79 — Connected dead-end deletion](https://github.com/xbwtyz/Mappo/issues/79): UNCHANGED.** Requires engine/face/parcel support for dead-end corridors, not H3 performance work.

No issues were closed or edited without explicit review of these findings.

## H3 gates

- [x] Current original-C7 Small/Large Organic benchmark collected in Chromium/Firefox desktop with raw artifact and runner metadata.
- [x] Preview median/p95, frame/timer/input gaps and independent Apply timings compared to historical P7.
- [x] Worker-bound calculation and residual UI stalls distinguished without inventing causes.
- [x] Valid, stale and rapid-change drafts, authoritative Apply, Undo/Redo and accepted-state preservation passed both browsers.
- [x] No material performance regression identified requiring speculative changes to the app runtime.
- [x] No forced interactions, mobile-specific tests, new schema, Pages publish or release introduced.
- [x] One-off audit CI benchmark trigger removed; original manual-only benchmark is preserved.
- [ ] Final review-ready H3 PR six-runner CI green with release-policy test restored.
- [ ] Owner separately approves PR merge and issue dispositions.

## User experience since H2

**No new UI controls or editing semantics.** The current desktop road editor retains responsive background validation compared to early C7, with documented limitations for occasional frame stalls. Developers get reproducible baseline data and issue-specific H4 release criteria without increasing routine CI time.

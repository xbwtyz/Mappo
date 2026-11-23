# C7 P7 junction input responsiveness

P6 reduced the time until large-city junction previews were ready. The worst
frame gaps varied across browsers and viewport sizes. P7 measures whether
those gaps also delay input and which stage overlaps the interruption.

## Measurement

Run `node scripts/c7-browser-performance.mjs` on the compiled HTML. The
benchmark uses the same Small and Large Organic junctions as P6 and measures
desktop and phone-sized viewports in Chromium and Firefox.

- Send trusted Shift presses during preview. They exercise browser input
  delivery without changing the draft. Record page event-to-handler time
  and Playwright command turnaround separately. Command time includes
  automation overhead, and browser event timestamps may omit earlier queuing.
- Record long frame intervals, page timer gaps, worker dispatch and reply,
  report readiness, and the canvas draw. Keep the trace through the first
  queued map draw after readiness.
- Compare repeated profiles and the timing of interrupted input before
  choosing a runtime change. A slow preview can still process input smoothly.
- Verify cancellation, the independent Apply rebuild, unchanged accepted state
  during preview, and atomic Apply/Undo/Redo. Keep Issue #44 open.

## Worker phase trace and validation change

Set `C7_TRACE_WORKER_PHASES=1` when running the benchmark to collect worker
intervals for stored-project validation, impact analysis, junction intent,
neighborhood reflow, topology reflow, and face extraction. The benchmark
instruments the worker in the served test HTML and includes intervals in
`artifacts/c7/performance.json`. Compare their overlap with each trial's
frame gaps. A gap can overlap multiple phases, and overlap alone does not
establish its cause.

Stored-project validation uses the bounds of validated parcels in the same
block to skip detailed intersection checks for clearly separated pairs.
Pairs whose bounds touch or nearly touch still get the full test. Separated
pairs consume the same work budget as before. Clearance calculation also
avoids a temporary distance array.

## Recovery work during previews

Chromium's engine trace found long IndexedDB recovery callbacks on the main
thread during large-city previews. Recovery can reuse a snapshot only when
storage returns the exact text previously validated and committed in this
session. Changed, imported, and previously unseen snapshots still go through
the existing checks. The conflict token, current and backup rotation, and
storage transaction remain in place. The file panel reuses already validated
recovery documents when their stored bytes match, and project capture copies
metadata without copying the project it is about to replace.

## Results and disposition

The benchmark's **Large Organic** case fixes `size: large`, Organic street
pattern, seed `c2-organic` and the generated default outline. It spans about
1,294 by 1,155 map units and encloses about 980,000 square map units. The
benchmark moves three junctions by X +8 from the same accepted city, with a
cold and warm run per junction for each browser and viewport.

| Preset with the same seed and default outline | Junctions | Road segments | Blocks | Properties | Buildings |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small | 167 | 240 | 73 | 148 | 173 |
| Medium | 249 | 388 | 139 | 431 | 456 |
| Large | 332 | 551 | 219 | 943 | 1,029 |

The benchmark times Small and Large. Medium is included here for scale.
The presets set street spacing and use nominal radii of 260, 390 and 560 map
units when generating a default outline. In the editor, **Street density**
changes spacing within the current outline on rebuild. The counts describe
this fixture and do not define a size cutoff for input stalls.

| Large Organic measure | Earlier result | Latest relevant result |
| --- | --- | --- |
| Firefox longest preview frame gap | 1,050–1,083 ms at baseline | 167–183 ms at P6 |
| Chromium longest preview frame gap | About 29 ms at baseline | 150–183 ms at P6 |
| Longest warm desktop Apply click handler | 996 ms Chromium, 2,300 ms Firefox at P3 | About 22 ms at P4 |
| Traced Chromium IndexedDB recovery callbacks | 113–191 ms before P7 recovery reuse | 23–40 ms after the change in six local trials |

[Baseline](https://github.com/xbwtyz/Mappo/actions/runs/44645147376),
[P3](https://github.com/xbwtyz/Mappo/pull/45),
[P4](https://github.com/xbwtyz/Mappo/pull/47),
[P6](https://github.com/xbwtyz/Mappo/actions/runs/44667457894),
and [P7](https://github.com/xbwtyz/Mappo/pull/50) contain the evidence.
Apply's click handler and time to finish are separate measurements.

[P7 CI](https://github.com/xbwtyz/Mappo/actions/runs/44671837906) passed on
runtime commit `f3bf860`, including 405 Node tests, Chromium and Firefox,
standalone parity, offline Apply and cancellation, and the C7 benchmark.
It observed worst preview frame gaps of 150–167 ms, median previews of
1.02–1.10 s, and median Apply completion of 0.85–0.95 s. P7 used an AMD runner
and added input probes. Earlier runs used Intel. Each preview group has six
headless trials, and local Firefox at phone viewport size still showed a
long outlier.

The project owner accepted wrapping up C7 and moving to the planned
[0.2D road experience work](milestone-0-2d-road-ux-plan.md). Keep
[Issue #44](https://github.com/xbwtyz/Mappo/issues/44) open. A short hands-on
check should include ordinary edits and edits shortly after autosave is
scheduled. If input repeatedly becomes unresponsive, profile synchronous
autosave preparation on the affected setup and consider a focused fix.

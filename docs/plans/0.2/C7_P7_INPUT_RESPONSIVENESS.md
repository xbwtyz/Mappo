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

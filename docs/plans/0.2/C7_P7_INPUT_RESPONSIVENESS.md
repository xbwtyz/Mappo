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

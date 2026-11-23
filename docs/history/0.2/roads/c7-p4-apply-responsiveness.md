# C7 P4 junction responsiveness

[Issue #44](https://github.com/xbwtyz/Mappo/issues/44) tracks the remaining
junction preview and Apply stalls. P3 showed that the worker cut Firefox's
worst Large Organic preview frame gap from 1,050 ms to 233.5 ms on desktop.
Chromium desktop went from 29 ms to 166.6 ms. Warm junction Apply on Large
Organic still occupied the main thread for 888–996 ms in Chromium and
1,177–2,300 ms in Firefox.

- Run the fresh junction rebuild, complete candidate and ledger comparison,
  and schema-9 round-trip in the offline worker. The editor rechecks the
  accepted project fingerprint, file revision, and draft revision before
  recording one undoable transaction.
- Show validation progress immediately. Resetting, changing the draft or
  selection, leaving road inspection, and replacing a project invalidate
  the pending request. Worker errors leave the accepted city untouched.
- Reuse the accepted project fingerprint as the worker input snapshot and
  prepare preview overlay geometry in the worker to reduce main-thread work
  at dispatch and display time.
- Repeat the P3 fixtures in Chromium and Firefox on desktop and phone-sized
  viewports. Record preview latency and frame gaps, Apply click duration,
  total validation and commit time, and Apply frame gaps. Verify offline
  Apply, cancel during validation, and atomic Apply/Undo/Redo.

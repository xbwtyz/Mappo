# C7 P3 — browser, offline and performance closeout

**Issue:** [#44](https://github.com/xbwtyz/Mappo/issues/44) ·
**PR:** [#45](https://github.com/xbwtyz/Mappo/pull/45) ·
**Scope:** Final verification of the P1/P2 preview responsiveness implementation.
**Working version:** 0.2-dev.c7-p2 · **Schema:** 9 unchanged.

## Acceptance gates

- [ ] Full Node regression suite passes on final PR head.
- [ ] Chromium/Firefox browser matrix, including P2 rapid-gesture and
  cancellation cases, passes.
- [ ] Actual offline \`file://\` compiled standalone opens in both browsers,
  creates an asynchronous worker, previews a known-safe C7 junction,
  preserves project/recovery data, and makes no HTTP(S) requests.
- [ ] Same Small/Large Organic C7 benchmark fixture as baseline passes in
  both Chromium/Firefox and desktop/phone-sized viewports, cold/warm.
- [ ] Compare median/p95 end-to-end preview and worst main-thread frame gaps
  to [the C7 baseline](c7-performance-baseline.md) at exact CI run.
- [ ] Verify invalid/rapid drafts, Apply/Undo/Redo and portable roundtrip.
- [ ] Quantify the separate synchronous Apply latency. Preserve independent
  candidate rebuilding, schema-9 validation and atomic history.
- [ ] Archive link to CI artifact and explain remaining responsiveness
  limitations or follow-up issue(s).
- [ ] Present evidence for review; **no merge without owner approval**.

P3 does not silently change the accepted city schema or replace authoritative
Apply validation. A worker can eliminate the preview's main-thread freeze even
when total elapsed preview calculation time does not decrease.

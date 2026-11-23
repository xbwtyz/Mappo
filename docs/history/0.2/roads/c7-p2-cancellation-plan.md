# C7 P2 — cancellation, bounded work and stale-draft safety

**Issue:** [#44](https://github.com/xbwtyz/Mappo/issues/44) · **PR:** [#45](https://github.com/xbwtyz/Mappo/pull/45)
**Branch:** `feature/c7-p1-background-preview` · **Schema:** 9 unchanged.

## Problem

P1 puts A3/C7 computations off the UI thread but merely discards stale replies.
A canceled preview can still consume the worker for ~1 second while subsequent
proposals accumulate behind it. Queued work may delay the latest valid draft.

## P2 architecture

1. Exactly **one active job** per controller. `compute(newDraft)` cancels the
   previous job and terminates its worker before sending a new request.
2. `RoadPreviewSession.invalidate()` cancels immediately for new coordinates,
   drag start/movement, bend and street work, selection changes and resets.
   Session exit suspends the idle worker; the next preview recreates it.
3. Canceled worker promises reject with `AbortError`. The session's revision
   and project identity checks ignore obsolete replies and rejections.
   A microtask queued for a now-invalid revision must not dispatch a request.
4. Worker `error`, `messageerror`, clone failures, and a bounded
   **30-second watchdog** reject the current request. The controller recycles
   and is reusable on a subsequent edit (no silently stuck `checking`).
   Worker startup failure retains the pre-existing synchronous fallback.
5. The UI continues to own `checking`, result visibility, read-only impact
   overlays, explicit building decisions and Apply gating. **Apply still
   independently rebuilds/revalidates on the main thread**; any later change to
   that requires separate review.
6. The existing browser benchmark wraps `computeJunctionAsync`; its wrapper
   must pass through `cancel` and `suspend`, not accidentally disable P2.

## Acceptance evidence

- [x] Unit regression added: repeated computation cancels the prior active worker (not just UI).
- [x] Unit regression added: no backlog on rapid updates; latest result alone may settle the session.
- [ ] Stop, reset, selection switch, changed accepted project, and drag
  invalidation reject stale results while keeping Apply disabled (initial Node cases cover stop/reset/selection; add browser stress evidence).
- [x] Targeted Node tests cover worker crash, decode failure, send/clone error,
  timeout recovery, stale dispatches, invalidation and accepted-state isolation.
- [ ] Confirm compiled standalone parity, targeted Node/Chromium/Firefox tests,
  and fast CI. P2 browser integration is now in `scripts/c7-p2-browser-qa.mjs`
  and part of `npm run test:browser`.
- [ ] PR remains unmerged pending approval.

## P2 build and validation

The versioned development artifact is `0.2-dev.c7-p2`. The generation script continues to emit `index.html` and a byte-identical `dist/mappo-0.2-dev.c7-p2.html`. A temporary development-only workflow produces the checked-in distribution and is removed afterward; CI fast checks enforce parity.

## Deliberately deferred to P3

Performance median/p95 and frame-gap closeout on identical Small/Large Organic
fixtures; full C6/C7 cross-browser matrix and separate Apply stall analysis.

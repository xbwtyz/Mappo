# Mappo C7 — Issue #44 worker responsiveness plan

**Branch:** `feature/c7-p1-background-preview` (from main). **Schema:** 9 unchanged.
**Issue:** [#44](https://github.com/xbwtyz/Mappo/issues/44). **Baseline:** [C7 performance](C7_PERFORMANCE_BASELINE.md).

## P1: Off-main-thread junction preview (in progress)
- [x] Create feature branch and outline, leave main untouched.
- [x] Introduce reusable pure C7 worker calculation and clone-safe message protocol.
- [x] Introduce client adapter for a Blob Worker embedded in the compiled single-file HTML.
- [x] Bundle worker dependency graph separately and inject worker script into offline build.
- [x] Wire UI preview to async request/response, revision/fingerprint safeguards and synchronous fallback.
- [x] Add worker parity/race tests and benchmark instrumentation. Full CI browser validation remains pending.
- [x] Commit versioned standalone distribution and open [draft PR #45](https://github.com/xbwtyz/Mappo/pull/45). Owner review and merge approval pending.

**Request:** `{requestId,project,junctionId,point,decisions}`.
**Response:** `{requestId,result:{proposal,report,reconciliation,topology,reconciliationError,timings}}` or `{requestId,error}`.
The core proposal graph includes non-cloneable methods; only clone-safe fields cross to UI.
Worker preview must never mutate accepted city/history/recovery or authorize Apply.
Existing independent fresh Apply reconstruction and schema-9 round-trip remain intact.

## P2: Interrupt and coalesce superseded work
- [x] Terminate an actively computing worker on session invalidation or newer request.
  Lazy-create the replacement; never allow a queue of stale expensive calculations.
- [x] Cancel work on drag, changes to selection, reset, editor exit or switching to street/bend editing.
- [x] Handle worker errors, undecodable responses, structured-clone errors and timeouts;
  release idle workers on exit and recover on future drafts.
- [x] Prevent superseded microtasks from dispatching stale requests.
- [x] Preserve cancellation when browser benchmarks instrument the worker adapter.
- [ ] Verify race conditions: rapid nudges, drag, selection, exit/reopen, project change,
  newer worker failures, late replies, and accepted-state immutability.
- [ ] Verify syntax, versioned offline bundle, targeted Node tests and browser checks.
- [ ] Present P2 review against passing checks, with PR #45 still draft.

Detailed P2 implementation and acceptance: [C7_P2_CANCELLATION_PLAN.md](C7_P2_CANCELLATION_PLAN.md).

## P3: Performance and acceptance
- [ ] Compare identical Small/Large Organic fixtures, Chromium/Firefox and phone/desktop viewports, cold/warm medians/p95/frame gaps.
- [ ] Verify C6 street/bend/split/merge and C7 four-layout junctions, protected/named building decisions, Undo/Redo and schema 9 offline parity.
- [ ] Evaluate separate synchronous Apply stalls without weakening independent validation.
- [ ] Keep Issue #44 open until its acceptance criteria are actually met.

**Testing cadence:** [CI testing policy](../../CI_TEST_POLICY.md) separates fast development smoke checks from review-ready/full validation and conditional C7 benchmarking.

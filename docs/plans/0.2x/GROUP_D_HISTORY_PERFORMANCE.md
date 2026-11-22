# Group D — Edit History, Responsiveness and Scale

**Status:** Planning only. **Priority:** Medium for history; performance/scale **only upon evidence**.

| ID | Finding | Handling |
|---|---|---|
| [D01](issues/D01.md) | Scoped, session-only Undo/Redo; no universal interleaved history | Separate unified session history decision from persistent history design |
| [D02](issues/D02.md) | Residual 100–183 ms frame hitches and potential synchronous fallbacks | Keep original issues #44/#46 closed; new reproduction required for new bug |
| [D03](issues/D03.md) | Explicit graph/work and local block budget ceilings | Benchmark real supported cities before changing caps |

## D01 — Important trade-off

Current histories deliberately avoid replaying an older edit over unrelated accepted changes. A universal Undo stack is not just a UI dropdown: it needs a coherent transaction model across road, parcel, building, metadata, city regeneration and project import. Persistent history adds save-size, migration and recovery concerns. **Recommendation:** design a single-session global history first; treat across-restart history as a separate opt-in feature.

## D02 — Performance evidence boundary

H3 measured Large Organic preview readiness around 0.9–1.0 seconds and occasional ~100–183 ms main-thread frame gaps on its CI hardware. Most expensive preview computation used the worker. Original roughly one-second main-thread freezes [#44](https://github.com/xbwtyz/Mappo/issues/44) and [#46](https://github.com/xbwtyz/Mappo/issues/46) were closed after owner review. Do **not** relabel them as still-open defects. Only open a newly reproduced performance issue with a seed, exact operation, worker/fallback state, browser, device and trace. Heavy C7 performance benchmarking remains opt-in.

## D03 — Safety caps are safeguards

Limits such as 20,000 nodes, 40,000 roads, a six-million-work graph budget and a 32-block topology replacement limit may be overly restrictive for hypothetical extreme cities, but simply raising them risks hanging the browser. First measure actual sizes/workload and develop cancelable bounded algorithms where justified. This investigation may end with **no code change**.

## Acceptance principle

Performance and history changes must not weaken deterministic results, stale-draft checks, independent Apply validation, authored identity preservation or the offline build. Use measured same-runner comparisons, not speculative speedup claims.
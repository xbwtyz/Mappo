# B1R — Reconciliation performance research

> Historical research record. The [approved production plan](../0.2.24-adaptive-reconciliation-b1r.md) defines current scope, limits and acceptance gates.

See [research report](lare-research-report.md) for the experiment ledger and [demolition study](lare-demolition-study.md) for the separate demolition cost. No performance gate has been passed on the integrated production implementation.

## Measured observations

The first 160-case diagnostic replay used 59,128,627 work units, p95 preview 346.52 ms. Recorded stage totals include first parcel inventory 35,029,432 and second 18,398,582. Early geometry rejection and exact plot caching yielded little deterministic work benefit. Progressive candidates reduced work to 49,153,188; rank-first pruning to 56,660,964; combined to 40,275,361 at the original 1M/2048 caps. At larger budgets, the search expands further, so total work may rise despite improved acceptance. Timing comparisons between hosted runners are noisy and not controlled; no causal latency gain is claimed from cross-run wall times alone.

| 160-case configuration | Accepted | Total work | Preview p95 (ms) | Apply p95 (ms) | Largest iterator step per case p95 (ms) | CI |
|---|---:|---:|---:|---:|---:|---|
| Original 2M/4096 | 116 | 95.57M | 910.09 | 974.67 | 244.44 | [45349914532](https://github.com/xbwtyz/Mappo/actions/runs/45349914532) |
| Original 4M/8192 | 117 | 110.25M | 1334.93 | 1194.49 | 240.20 | [45349918971](https://github.com/xbwtyz/Mappo/actions/runs/45349918971) |
| Original 8M/16384 | 117 | 115.20M | 1009.69 | 866.34 | 159.87 | [45349924136](https://github.com/xbwtyz/Mappo/actions/runs/45349924136) |
| Original 16M/32768 | 117 | 115.20M | 992.34 | 848.69 | 160.96 | [45349928115](https://github.com/xbwtyz/Mappo/actions/runs/45349928115) |
| Original 4M/16384 | 117 | 115.20M | 875.84 | 762.86 | 153.49 | [45351283888](https://github.com/xbwtyz/Mappo/actions/runs/45351283888) |
| Diagnostic control | 117 | 115.20M | 968.26 | 848.29 | 157.96 | [45353441451](https://github.com/xbwtyz/Mappo/actions/runs/45353441451) |
| Strict candidate containment | 131 | 107.87M | 725.21 | 819.49 | 157.30 | [45354931673](https://github.com/xbwtyz/Mappo/actions/runs/45354931673) |
| Selective clearance | 131 | 109.01M | 1170.06 | 1290.95 | 233.51 | [45355805434](https://github.com/xbwtyz/Mappo/actions/runs/45355805434) |
| Combined clearance 2M | 127 | 59.46M | 551.21 | 656.83 | 204.49 | [45355789087](https://github.com/xbwtyz/Mappo/actions/runs/45355789087) |
| Combined clearance 4M | 131 | 104.57M | 1370.15 | 1479.39 | 220.39 | [45355798019](https://github.com/xbwtyz/Mappo/actions/runs/45355798019) |

Full selective 800: 597,586,817 work units, 1,527,865 expansions; preview median 226.03 ms, p95 1059.36, max 1826.95; Apply median 307.36 ms, p95 1193.36, max 2045.01 (only candidate-bearing movements); max iterator step per case median 178.14 ms, p95 310.32, max 740.15. P95 is nearest-rank over recorded finite values. P95 on the whole generated corpus is not the designated common-fixture performance test. Four smallest movement vectors had preview p95 386.35, 372.34, 373.73 and 371.69 ms respectively. Seven refused cases exhausted budget, all radial; two accepted cases retained an incumbent despite exhaustion.

## Production performance proposal, not implemented

Original milestone targets: lightweight preview p95 16.7ms, common complete p95 250ms, scheduled slice 8ms. Preserve original deterministic comparison semantics, no elapsed-time-dependent candidate selection. Provisional cumulative staged budgets 1M/2048, 2M/8192, 4M/16384; thresholds are proposed rather than validated. Resume rather than repeat inventory, search and compatibility work; keep an independently verified incumbent. Break long loops within parcel/plot/building generation, compatibility and finalization into bounded resumable steps; same deterministic synchronous consumption for independent Apply. Cancellation and revision checks must prevent stale preview writes. Explicitly distinguish work charged for final validation/impact from search. Compare identical input and candidate fingerprints across slice patterns; verify no lost accepted candidate and no unauthorized mutation. Profile controlled common fixtures in supported browsers and report real p50/p95/max, including long task and cancellation delays. No relaxed validation for latency.

Progressive generation and rank-first pruning remain candidate optimizations: some configurations changed objective quality, so adoption requires comparison against retained verified incumbents. No evidence supports default wider beam or inventories. More demolition trials are not a solution to UI blocking: they repeat expensive search and Apply; a future implementation needs its own shared bounded strategy budget, resumable work and explicit authorization.


## Deeper-removal timing — partial round

Three completed shards (planned, organic, radial; 48 cases), 697 trials, 1278789380 measured preview work units. Per-strategy p95 total trial time per case: deep largest 7161.05 ms, deep obstruction 8129.03 ms, clear-all 1928.54 ms. Preview work excludes fresh Apply and unmetered setup; elapsed trial time includes successful fresh Apply. Hosted timings are not controlled browser latency. Linear pending. See [demolition study](lare-demolition-study.md) for exact runs and limitations. No production latency gate passed.


## Deeper-removal complete timing round

65 movements, 919 trials, 1587425342 measured preview work units. Per-strategy trial-sequence p95: deep largest 7094.30 ms, deep obstruction 7487.11 ms, clear-all 1928.54 ms. Hosted-runner timings; work excludes fresh Apply and setup. No production performance gate passed. See demolition study for full outcomes.


## Terminal diagnostics and compact pilot

Terminal diagnostic run 45365153567 reproduced deterministic reduced-input work/expansion counts on all 22 cases; summed preview work 25258299. Compact pilot 45365642330 increased candidate generation and recovered seven of nine reduced-input cases, none on original input. On the identical nine reduced-input cases, preview work changed from 9728748 to 14784238; original-input compact work 19729544. Compact trial-sequence p95 3638.98 ms (hosted-runner observation, includes successful Apply). No production performance gate passed.


## Compact cross-morphology replay

22 matched reduced-input cases: original preview work 25258299, compact preview work 34753296, original-input compact work 43225915, compact trial-sequence p95 2370.36 ms, hosted timing only. Eleven reduced-input recoveries, zero original-input recoveries. Additional work is not evidence of improved production responsiveness. Single-building witness pilot completed; two oversized log records truncated, detailed aggregate performance deferred to chunked replay.


## Interleaved placement pilot

Eleven complete matched cases: original-input work 14972165 to 13364118, expansions 49020 to 27418; reduced-input work 18761198 to 22013687, expansions 57476 to 55445. No original-input acceptance gain; reduced-input score better/tied/worse 4/7/0. One control trace remains incomplete. No production performance gate passed.


## Building-aware parcel lookahead

Twelve matched witness cases, original-input work 16205909 to 24839382, expansions 36677 to 33378; reduced-input work 24749167 to 38380599. One original-input recovery required 3999978 work (near cap), one refusal reached work limit. All twelve reduced-input cases retained acceptance, scores better/tied/worse 0/11/1. Cost increase means this is not a production responsiveness pass.


## Rigid feasible-region fallback

Twelve matched cases: original-input work 24839382 to 24879850, expansions 33378 to 33376; reduced-input work 38380599 to 38414980. No incremental recovery or score gain. No production performance pass.


## Coordinated parcel round 3

Six matched resistant cases: reduced-input preview work 7769191 to 8602891, expansions 348 to 22194; original-input work 8067826 to 12537217. Six reduced-input recoveries, no original-input recoveries. No production performance pass.


## Final combined benchmark (800 exact matches)

Selective → combined: median preview 226.03→236.06 ms; p95 preview 1059.36→1840.48 ms; accepted Apply p95 1193.36→1990.08 ms; p95 max iterator step 310.32→270.34 ms; worst step 740.15→334.48 ms; total charged work 597586817→961593054. Work-limit refusals 7→33. Twenty new recoveries, two selective losses, no B1 losses. Hosted timing is not controlled browser proof. Both configurations miss responsiveness targets. Recommend progressive escalation, resumable kernels, bounded shared budgets, revision guards and validated incumbent retention, subject to owner review and exact corpus non-regression.

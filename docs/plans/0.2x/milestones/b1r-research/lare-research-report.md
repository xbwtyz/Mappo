# B1R — Local adaptive reconciliation research report

**Status:** detached research, November 24, 2026. This is not production acceptance or permission to merge PR #153. B1 is frozen at `e5f1cf83dcdcc75e52911aa717035955b40569d0`, 0.2.23-dev; B1R source target is 0.2.24-dev, Schema 10, portable/workspace 1. No demolition, regeneration, topology or identity exception is approved for production.

## Reproduction and evidence

The baseline generator `scripts/lare-baseline.mjs` requires a clean detached checkout of the frozen B1 SHA. It creates 20 projects (five per planned, organic, radial, linear morphology; five road groups and eight vectors per project), saves exact serialized project fingerprints and baseline results. The experimental harness `tests/lare-native-baseline-capture.test.js` runs a detached checkout at the exact experimental commit and applies the named experimental transformation. It runs fresh Apply, stored-project validation, independent preservation verification, and nonmutation checks; it asserts zero invalid acceptance and zero B1 regressions. Run-specific branch/config mappings are in each experiment commit. Reproduce locally using the harness's opt-in environment variables and matching configuration, or inspect the exact CI log. The archived evidence is described in [evidence/README.md](evidence/README.md). Generated input files were temporary; the archived source fingerprints permit regeneration verification, not a claim that full original project bytes were archived.

## Investigation chronology

All figures below for the initial planned-city experiments refer to the same 160 distinct movements. Native B1 accepted 91 of these; full B1 accepted 470/800. Each listed completed experiment used Fast Checks (not full review-ready CI), with 60 tests passed. These are empirical observations under bounded search, not mathematical feasibility proofs.

| Experiment | Accepted/160 | Deterministic work | Finding | Exact run |
|---|---:|---:|---|---|
| Initial B1R | 110 | — | +19 vs B1; 50 refused | [45345728654](https://github.com/xbwtyz/Mappo/actions/runs/45345728654) |
| Diagnostic replay | 110 | 59.13M | 42 work-limited, 6 crossings, 2 exhausted | [45345728654](https://github.com/xbwtyz/Mappo/actions/runs/45345728654) |
| Early geometry rejection | 110 | 59.01M | no acceptance benefit | [45346366389](https://github.com/xbwtyz/Mappo/actions/runs/45346366389) |
| Exact plot cache | 110 | 59.07M | no acceptance benefit | [45346823197](https://github.com/xbwtyz/Mappo/actions/runs/45346823197) |
| Progressive candidates | 114 | 49.15M | 4 additional recoveries; 3 worse scores among changed accepted candidates | [45347380932](https://github.com/xbwtyz/Mappo/actions/runs/45347380932) |
| Active neighborhood | 110 | 58.52M | no gains; 44 work refusals | [45348046758](https://github.com/xbwtyz/Mappo/actions/runs/45348046758) |
| Rank-first pruning | 110 | 56.66M | identical accepted fingerprints; 32,739 alternatives pruned | [45348829672](https://github.com/xbwtyz/Mappo/actions/runs/45348829672) |
| Progressive + rank-first | 114 | 40.28M | 31.88% lower work than diagnostic replay, same progressive fingerprints | [45349555983](https://github.com/xbwtyz/Mappo/actions/runs/45349555983) |
| Original 2M/4096 | 116 | 95.57M | +6 vs B1R | [45349914532](https://github.com/xbwtyz/Mappo/actions/runs/45349914532) |
| Original 4M/8192 | 117 | 110.25M | +7 vs B1R | [45349918971](https://github.com/xbwtyz/Mappo/actions/runs/45349918971) |
| Original 8M/16384 | 117 | 115.20M | zero budget refusals | [45349924136](https://github.com/xbwtyz/Mappo/actions/runs/45349924136) |
| Original 16M/32768 | 117 | 115.20M | identical to 8M | [45349928115](https://github.com/xbwtyz/Mappo/actions/runs/45349928115) |
| Combined 2M/4096 | 115 | 59.48M | fewer recoveries than original high-budget search | [45351272709](https://github.com/xbwtyz/Mappo/actions/runs/45351272709) |
| Combined 4M/8192 | 118 | 106.36M | best acceptance before containment correction | [45351277204](https://github.com/xbwtyz/Mappo/actions/runs/45351277204) |
| Combined 8M/16384 | 118 | 115.43M | same accepted set | [45351280679](https://github.com/xbwtyz/Mappo/actions/runs/45351280679) |
| Original 4M/16384 | 117 | 115.20M | identical to original 8M/16384 | [45351283888](https://github.com/xbwtyz/Mappo/actions/runs/45351283888) |
| Beam 16, original 8M | 117 | 144.12M | no gains | [45351287351](https://github.com/xbwtyz/Mappo/actions/runs/45351287351) |
| Beam 32, original 8M | 117 | 175.80M | no gains, more budget refusals | [45351292301](https://github.com/xbwtyz/Mappo/actions/runs/45351292301) |
| Inventories 48, original 8M | 117 | 157.43M | no gains | [45351297498](https://github.com/xbwtyz/Mappo/actions/runs/45351297498) |
| Inventories 96, original 8M | 117 | 340.32M | no gains | [45351312818](https://github.com/xbwtyz/Mappo/actions/runs/45351312818) |
| Refusal diagnostics 4M/16384 | 117 | 115.20M | 14 crossing-related finalization failures; 23 other search failures | [45353441451](https://github.com/xbwtyz/Mappo/actions/runs/45353441451) |
| Building-aware variable order | 117 | 117.36M | no gains | [45354088787](https://github.com/xbwtyz/Mappo/actions/runs/45354088787) |
| Numerical inset | 131 | 106.57M | all 14 crossing-related refusals recovered; 10 worse common scores | [45354080768](https://github.com/xbwtyz/Mappo/actions/runs/45354080768) |
| Interior placement fallback | 117 | 115.21M | no gains | [45354938996](https://github.com/xbwtyz/Mappo/actions/runs/45354938996) |
| Strict candidate containment | 131 | 107.87M | all 14 recovered, 0 worse common scores vs diagnostic control | [45354931673](https://github.com/xbwtyz/Mappo/actions/runs/45354931673) |
| Combined clearance 2M | 127 | 59.46M | four losses and 25 worse scores vs selective 4M | [45355789087](https://github.com/xbwtyz/Mappo/actions/runs/45355789087) |
| Combined clearance 4M | 131 | 104.57M | 12 worse common scores vs diagnostic control | [45355798019](https://github.com/xbwtyz/Mappo/actions/runs/45355798019) |
| Selective clearance 4M | 131 | 109.01M | 0 worse common scores vs control; 11 better vs strict-only | [45355805434](https://github.com/xbwtyz/Mappo/actions/runs/45355805434) |

The early diagnostic showed parcel inventories consumed the majority of work (first 35.03M, second 18.40M of recorded 59.13M across all 160); 25 of 42 work-limited cases reached zero expansions. Progressive generation shifted pressure toward expansions. Wider beam and inventories were evaluated under fixed limits, so the results do not establish that wider searches can never help. See [performance report](lare-performance-report.md).

### Numerical failure mechanism

Preliminary building containment used a cross-product tolerance while stored-project validation used a parametric proper-intersection predicate. Near-parallel boundary placements sometimes passed the former and failed the latter. The diagnostic recorded 56 sampled crossings across 14 cases; at least one cross product in each fell below the preliminary tolerance. A representative denominator was about 5.876e-8 with endpoint cross product about 1.99e-13. The stored validator is not weakened. The strict experiment rejects crossings during candidate generation; selective clearance retries an affected bounding-box sample with a rigid interior nudge capped at 1e-5 per local axis (and at a quarter of the available interval), retaining ordinary valid samples and exact-fit intervals. A separate bounded retry inventory is charged to the work budget. This is not a new geometric tolerance for persisted projects. Full clearance replaces ordinary interval bounds and was less attractive for objective quality.

Exact code commits: diagnostic [86b5be7](https://github.com/xbwtyz/Mappo/commit/86b5be7852638719c58441ff823ec1f23c5d7f6e), inset [422fd09](https://github.com/xbwtyz/Mappo/commit/422fd09b2194386f663a54144c2d0fba02c55351), strict [d78db4c](https://github.com/xbwtyz/Mappo/commit/d78db4c5821ee0e8f7abe19bfbcf98eacc620a91), selective [7505df1](https://github.com/xbwtyz/Mappo/commit/7505df19d638117cddfbd16e0ea89aacc6041402). Cross-morphology inset pilot recovered 14 additional movements across 120 distinct cases ([45355816698](https://github.com/xbwtyz/Mappo/actions/runs/45355816698)); later full selective replay supersedes it for acceptance reporting.

## Full selective-clearance corpus

Configuration: 4M work, 16,384 expansions, beam 8, 24 retained parcel/building candidates, 256 affected parcels, original 192 parcel attempts, selective building retry maximum 160, separate impact limit 6M and explicit independent preservation check at 1M/2048. No progressive or rank-first transformation in these five runs. The remaining-corpus commit is [13de2a5](https://github.com/xbwtyz/Mappo/commit/13de2a554db842bd84fa32e0086253ee2500d63a).

| Morphology | B1 | Selective | Recovered |
|---|---:|---:|---:|
| Planned | 121/200 | 164/200 | 43 |
| Organic | 123/200 | 155/200 | 32 |
| Radial | 100/200 | 144/200 | 44 |
| Linear | 126/200 | 144/200 | 18 |
| Total | 470/800 (58.75%) | 607/800 (75.875%) | 137 |

Five successful Fast Checks runs: [45355805434](https://github.com/xbwtyz/Mappo/actions/runs/45355805434), [45356711166](https://github.com/xbwtyz/Mappo/actions/runs/45356711166), [45356722091](https://github.com/xbwtyz/Mappo/actions/runs/45356722091), [45356731663](https://github.com/xbwtyz/Mappo/actions/runs/45356731663), [45356743813](https://github.com/xbwtyz/Mappo/actions/runs/45356743813). Verified all 800 distinct identities (project ID, project fingerprint, ordered road IDs, offset), no B1 loss or invalid accepted candidate.

| Offset | B1 accepted/100 | Selective accepted/100 |
|---|---:|---:|
| (0.05,0) | 94 | 100 |
| (0,0.05) | 83 | 95 |
| (0.5,-0.5) | 86 | 100 |
| (-0.5,0.5) | 83 | 95 |
| (2,0) | 71 | 89 |
| (0,-2) | 51 | 87 |
| (4,3) | 2 | 39 |
| (-8,-5) | 0 | 2 |

The four smallest vectors achieved 390/400; all ten refusals were topology issues. Of 193 total refusals, 159 search-exhausted, 7 budget-limited (all radial), 21 road crossings, 6 overlapping roads. Search exhaustion is not proof of impossibility.

## Current decisions and open work

The owner approved consolidation architecture (strict containment, selective clearance, provisional 4M/16,384, beam 8, inventories 24, adaptive budgets, resumable generation), but explicitly chose continued research before production implementation. A detailed consolidation P1–P5 plan was proposed, not separately approved for implementation. The owner approved detached demolition experiments only; see [demolition study](lare-demolition-study.md). Do not infer authorization to destroy buildings in production from experimental results.

Remaining production gates: retain B1 and separately review any loss of the 607 experimental acceptances; 800 frozen movements on integrated source; 90+ targeted scenarios; at least 40 independently witnessed *preservation-compatible* solvable prior refusals, at least 50% recovery; zero unauthorized writes; canonical Undo/Redo and portable save/reopen; offline Firefox/Chromium; measured common-fixture latency and cooperative slices; deterministic compiled parity; full exact-head six-runner CI/aggregate. Demolition witnesses are not preservation-compatible refusal witnesses. No merge, release, tag, Pages or B2 without separate approval.

## Research maintenance

After each research round update the relevant report, append verified exact-SHA/run evidence, preserve per-case records independently of Actions retention, reconcile totals by stable case identity, and record negative results as well as improvements. Never silently rewrite prior observations or call a detached experiment a production acceptance pass.

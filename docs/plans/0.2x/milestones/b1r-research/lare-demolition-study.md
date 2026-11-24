# B1R — Controlled demolition counterfactual study

**Status: experimental only.** Owner authorized detached research, not production demolition. No change to the existing B1R preservation contract, Schema 10 or portable/workspace format 1. The accepted original project is never edited by the research harness.

## Method

The selective-clearance engine accepted 607/800 frozen movements. Of 193 refusals, 27 were topological (21 crossings, six overlapping roads); the remaining 166 are the demographic of this study. Every test first repeats the nondestructive control and requires it to refuse. It independently derives eligible building IDs from the affected context: generated provenance, generated adaptive property, rigid permission, no dependent or unsupported structures. On a detached clone, remove only selected eligible building IDs, update owner building membership and generated provenance, validate the reduced project, and then run the existing selective-clearance solver (4M work/16,384 expansions, beam eight, inventories 24). Fresh Apply, portable roundtrip, independent preservation relative to the **reduced** project, full stored validation and survivor IDs are checked, and original/reduced inputs are checked for nonmutation. The study does not implement an atomic demolition transaction from the original project, demolition ledger, authorization UI, replacement, or Undo/Redo of deletion. The recorded zero invalid results refer to the experimental checks, not proof of a production demolition safety contract.

The four strategies are deterministic and stop at their first successful tested subset:

- Largest first: rank eligible buildings by descending area, progressively remove one through eight.
- Smallest first: ascending area, progressively remove one through eight.
- Most obstructive first: score direct impact issue count (1000 each), affected property (100), changed frontage (10), then descending area and stable ID. Progressively remove one through eight.
- Minimum demolition: same obstruction ranking but smaller area tie-break; test first eight individual buildings, then up to eight ranked pairs drawn from those eight. This is a bounded subset search, not a global optimum.

The original 23-case planned pilot is [b31bb53](https://github.com/xbwtyz/Mappo/commit/b31bb534b876c2385f5e15533a16a6fefcf32af8), runs [45359469086](https://github.com/xbwtyz/Mappo/actions/runs/45359469086), [45359479100](https://github.com/xbwtyz/Mappo/actions/runs/45359479100), [45359488552](https://github.com/xbwtyz/Mappo/actions/runs/45359488552), [45359497512](https://github.com/xbwtyz/Mappo/actions/runs/45359497512). The remaining 143 cases are [5908677](https://github.com/xbwtyz/Mappo/commit/5908677d9e11aa6da8a233f93c47cb5241da23bd), runs [45360258968](https://github.com/xbwtyz/Mappo/actions/runs/45360258968), [45360267848](https://github.com/xbwtyz/Mappo/actions/runs/45360267848), [45360277532](https://github.com/xbwtyz/Mappo/actions/runs/45360277532), [45360287581](https://github.com/xbwtyz/Mappo/actions/runs/45360287581), [45360309144](https://github.com/xbwtyz/Mappo/actions/runs/45360309144), [45360320310](https://github.com/xbwtyz/Mappo/actions/runs/45360320310), [45360329933](https://github.com/xbwtyz/Mappo/actions/runs/45360329933), [45360341067](https://github.com/xbwtyz/Mappo/actions/runs/45360341067). All 12 runs passed 60/60 Fast Checks. Archive includes all per-trial results, not just winners. See [evidence](evidence/README.md).

## Full 166-case comparison

| Strategy | Recovered | Buildings removed in successes | Area removed in successes | Trials | Work units | Total trial time p95 per case (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Largest | 59 | 250 | 120373.17 | 1106 | 2035856381 | 6485.12 |
| Smallest | 11 | 50 | 3628.69 | 1290 | 2316438237 | 6402.03 |
| Obstructive | 85 | 354 | 114092.59 | 1002 | 1827791995 | 6804.56 |
| Minimum | 34 | 37 | 10565.50 | 2260 | 4154709811 | 12563.21 |

Area is the sum of recorded building area in Mappo coordinate units squared, not real-world area. Time includes the sequence of trials after the control and setup, and successful fresh Apply; cross-run timings are not controlled. Work totals sum recorded preview work, excluding independent Apply and unmetered harness setup. Across 664 strategy records and 5658 subset trials, 101 unique movements recovered (60.84% of 166); 90 by the union of minimum and obstructive. Best observed per movement (fewest removed buildings, then lowest area) totals 343 removed buildings across 101 separate counterfactuals, not a cumulative real-city demolition count. Distribution: 36 single, 13 double, 5 triple, 12 four, 13 five, 9 six, 5 seven, 8 eight. The sum of the best-observed area is 119350.75. The four strategies are complementary; a first-success hybrid is not guaranteed to reproduce their union or minimize loss. Replaying their first successes in priority order minimum/obstructive/largest/smallest would hypothetically remove 364 buildings, but that is offline log analysis, not a tested engine.

| Morphology | B1 accepted/200 | Selective accepted/200 | Additional observed demolition recoveries | Union accepted/200 |
|---|---:|---:|---:|---:|
| Planned | 121 | 164 | 21 | 185 |
| Organic | 123 | 155 | 21 | 176 |
| Radial | 100 | 144 | 36 | 180 |
| Linear | 126 | 144 | 23 | 167 |
| Total | 470 | 607 | 101 | 708/800 (88.5%) |

| Offset | Non-topological refusals tested | Demolition recoveries |
|---|---:|---:|
| (2,0) | 10 | 10 |
| (0,-2) | 10 | 8 |
| (4,3) | 54 | 45 |
| (-8,-5) | 92 | 38 |

No additional recovery is attributed to the 27 topology refusals. The remaining 65 non-topological refusals are unproven, not impossible.

## Diagnostic-guided hybrid pilot

Exact commit [b85e679](https://github.com/xbwtyz/Mappo/commit/b85e679fd2c76545818b7e6cd400acf8b255a7fd), [45361879898](https://github.com/xbwtyz/Mappo/actions/runs/45361879898), 60/60 Fast Checks. The pilot uses captured terminal dead-end diagnostics from the prior 4M/16384 diagnostic replay (20 building hints, three parcel hints). These are clues, not proof of causation. Rank eligible buildings using that hint plus the obstruction score; test up to five singletons, up to three pairs, then progressive obstruction-first removal through eight; dedupe subsets and cap at 16 distinct trials. No production live diagnostic integration.

| Strategy on same 23 cases | Recovered | Removed | Trials |
|---|---:|---:|---:|
| Largest | 10 | 51 | 155 |
| Smallest | 3 | 17 | 177 |
| Obstructive | 12 | 58 | 146 |
| Minimum | 9 | 10 | 268 |
| Hybrid | 17 | 35 | 159 |

Hybrid reproduces the entire previous 17-case union, adds no distinct recovery, but improves demolition count versus the earlier best observed outcome in five cases and worsens one. Eleven of 17 require just one removal. Work 259401404; trial time p95 8286.97ms. No invalid results; 6 unresolved. Full-corpus hybrid generalization remains untested.

## Active deeper-removal experiment

Exact commit [b05c009](https://github.com/xbwtyz/Mappo/commit/b05c009c48927d55f99fe48faf0165c33662c525). Four shards cover 65 cases not solved by any of the four original strategies: planned 9 ([45362362651](https://github.com/xbwtyz/Mappo/actions/runs/45362362651)), organic 19 ([45362373616](https://github.com/xbwtyz/Mappo/actions/runs/45362373616)), radial 20 ([45362385877](https://github.com/xbwtyz/Mappo/actions/runs/45362385877)), linear 17 ([45362395263](https://github.com/xbwtyz/Mappo/actions/runs/45362395263)). Test original rankings with removal depths 9–16 and one all-eligible-removal counterfactual. All-removal is diagnostic only, not a proposed user-facing default. At the documentation checkpoint, results are pending verification. A refusal even without eligible buildings narrows the investigation but does not prove impossibility; protected buildings, parcels, access, budget and supported search constraints remain.

## Prospective production direction (not authorized)

Preserve first, then only if explicitly permitted explore targeted generated-building deletion. Compare deletion count, occupied area, surviving relocation and other objective costs. Preserve original records, authorization, stable survivor identity, topology, protected/authored/linked/unknown entities, exact rollback and portable integrity. Require an independent original-to-candidate gate that authorizes only the exact removal set plus permitted ownership/reference updates, explicit preview of removed records, atomic Apply/Undo/Redo, cancellation, bounded shared work across demolition subsets, and no automatic replacement unless separately approved. Determine whether deletion is a separate policy/milestone before changing the approved B1R scope. Full targeted and browser acceptance is outstanding.

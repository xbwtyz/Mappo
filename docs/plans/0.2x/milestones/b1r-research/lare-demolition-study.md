# B1R — Controlled demolition counterfactual study

> Historical research record. The [approved production plan](../0.2.24-adaptive-reconciliation-b1r.md) defines current scope, limits and acceptance gates.

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


### Deeper-removal verified results — partial round

Exact experiment commit b05c009c48927d55f99fe48faf0165c33662c525. Planned, organic and radial runs listed above each passed 60/60 Fast Checks, zero reported invalid outcomes. Linear (17 cases) still running at this checkpoint. All 48 distinct completed identities matched against the 664 archived original strategy records (166 cases, 101 prior successes); zero overlap with prior wins or outside-manifest cases.

| Morphology | Tested | Deep largest | Deep obstruction | Clear all | Distinct recovered |
|---|---:|---:|---:|---:|---:|
| Planned | 9 | 1 | 2 | 4 | 4 |
| Organic | 19 | 4 | 9 | 10 | 10 |
| Radial | 20 | 2 | 12 | 17 | 17 |
| Total | 48 | 7 | 23 | 31 | 31 |

| Strategy | Recovered | Buildings removed in successes | Area removed | Trials | Preview work | Total trial time p95 (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Deep largest | 7 | 89 | 23276.69 | 361 | 688800171 | 7161.05 |
| Deep obstruction | 23 | 272 | 60030.78 | 288 | 536385159 | 8129.03 |
| Clear all | 31 | 1032 | 183098.04 | 48 | 53604050 | 1928.54 |

The two bounded deep strategies collectively recovered 23 cases; eight additional cases recovered only by clear-all. Best observed outcome per new movement (fewest removals, then area): 647 removed buildings and 123789.20 area across 31 independent counterfactuals. Area is Mappo units squared. The 144 strategy records contain 697 trials and 1278789380 measured preview work units. Clear-all still refused 17/48 cases, all search-exhausted; eight had zero expansions. All 17 used below 4M work and 16,384 expansions. Clear-all removes eligible generated buildings, not necessarily all structures; protected buildings, parcel/plot/access constraints and search limitations remain. These observations motivate terminal parcel/plot candidate diagnostics rather than merely increasing budgets. No proof of infeasibility.

Updated demonstrated union: 739/800 (92.375%), with 34 non-topological cases lacking a demonstrated solution (17 completed failures, 17 pending linear cases) and 27 topology refusals. Excluding clear-all-only additions gives 731/800 (91.375%) observed union. Neither is integrated production acceptance. No runtime changes or demolition authorization.


### Deeper-removal complete round

Linear run [45362395263](https://github.com/xbwtyz/Mappo/actions/runs/45362395263), job 138338141994, exact experiment commit b05c009c48927d55f99fe48faf0165c33662c525, passed 60/60 Fast Checks. 17 movements, 51 strategy records, 222 trials; 12 distinct recovered, 10 by bounded deep strategies, two clear-all-only. No invalid outcomes. Linear identities verified against all 664 prior original demolition records: none outside original manifest or among prior wins. Combined four shards cover all 65 remaining original refusals, with 195 records and 919 trials.

| Morphology | Tested | Deep largest | Deep obstruction | Clear all | Distinct recovered |
|---|---:|---:|---:|---:|---:|
| Planned | 9 | 1 | 2 | 4 | 4 |
| Organic | 19 | 4 | 9 | 10 | 10 |
| Radial | 20 | 2 | 12 | 17 | 17 |
| Linear | 17 | 5 | 8 | 12 | 12 |
| Total | 65 | 12 | 31 | 43 | 43 |

| Strategy | Recovered | Buildings removed in successes | Area removed | Trials | Preview work | Trial time p95 (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Deep largest | 12 | 147 | 41246.39 | 469 | 860797320 | 7094.30 |
| Deep obstruction | 31 | 367 | 81068.81 | 385 | 658842948 | 7487.11 |
| Clear all | 43 | 1359 | 246942.70 | 65 | 67785074 | 1928.54 |

The two deep strategies recovered 33 distinct movements; ten additional cases recovered only by clear-all. Best observed across new recoveries (fewest buildings, then area): 822 removals, 163850.12 area across 43 independent counterfactuals. Work totals 1587425342, preview only. Union 751/800 (93.875%), or 741/800 (92.625%) excluding clear-all-only additions. By morphology: planned 189/200, organic 186/200, radial 197/200, linear 179/200. 22 non-topological cases remain unresolved, plus 27 topology cases. All 22 clear-all refusals are search-exhausted below both configured caps; nine with zero expansions. 19 have offset (-8,-5), two (4,3), one (0,-2). Clear-all removes only eligible generated buildings, not all constraints; no feasibility proof. Next research: instrument terminal inventory and compatibility failures on these 22, with original-input controls. No production integration, schema or demolition authorization.


## Preservation-focused witness selection and active parcel research

Reanalyzed all 687 archived original and hybrid strategy records (166 distinct cases, 101 recovered). Choosing the best observed outcome per identity by removed-building count then area, including the hybrid pilot, gives removal-count distribution: 1:39, 2:15, 3:5, 4:11, 5:11, 6:9, 7:5, 8:6. This refines the earlier original-four-strategy distribution without adding any new recovery. Single-building witnesses: planned 12, organic 11, radial 9, linear 7; 54 of the 101 have observed one- or two-building counterfactual solutions. The 39 exact identity/removal/candidate-fingerprint witnesses are frozen in [manifest at a318dc3](https://github.com/xbwtyz/Mappo/blob/a318dc35753d482c249fe5db3b73ad8ca562be26/scripts/lare-single-building-witness-manifest.json), derived from the permanent archived run records. A single removal is a useful diagnostic perturbation, not proof that the original building is the sole geometric cause or that nondestructive recovery exists.

Active isolated research (outcomes pending):

- [Terminal parcel diagnostics, run 45365153567](https://github.com/xbwtyz/Mappo/actions/runs/45365153567), commit 3e5d863784829f509f8b8bf9395cf3a466f69240. All 22 clear-all-resistant identities, original and reduced project diagnostics; no decision changes.
- [Compact joint parcel pilot, run 45365642330](https://github.com/xbwtyz/Mappo/actions/runs/45365642330), commit fcfcb7900f3c1531e14e424a1c13f90758036d9a. Nine organic cases from the resistant cohort; up to 54 extra joint affine samples within the same work/expansion caps and retained inventory, unchanged validators; original-input and reduced-input trials. Acceptance, objective quality and cost remain unverified.
- [Single-building witness pilot, run 45365975725](https://github.com/xbwtyz/Mappo/actions/runs/45365975725), commit a318dc35753d482c249fe5db3b73ad8ca562be26. Twelve planned cases, compare original refusals against exact single-building removal witnesses, record terminal inventories, conflicts, work and expansions; require fresh Apply, surviving identity, independent preservation, original nonmutation and archived candidate fingerprint. No new removal policy or candidate algorithm in this diagnostic pilot.

The 751/800 experimental union remains unchanged. Archive completed outcomes and failures before advancing these hypotheses to production decisions. No production source, schema or authorization changes.


## Terminal parcel diagnostics — completed

[Run 45365153567](https://github.com/xbwtyz/Mappo/actions/runs/45365153567), job 138344843550, exact commit 3e5d863784829f509f8b8bf9395cf3a466f69240; 60/60 Fast Checks, 22/22 original and clear-all diagnostic replays, no recovery or reported invalid outcome. Exact frozen identities, reduced-input work and expansion counts match the prior 22 clear-all refusals. Nine zero-expansion cases had empty retained parcel inventories; twelve other cases stopped at parcel stage 1 or 2 with forward-check/overlap conflicts; one organic-3 case reached all 20 parcel stages with zero validated arrangements (7384 expansions). The latter's final reported issue is road-setback, PROP-00092, BLK-0049/RD-0233, old/new distance both 8.080749215358827 and old/new requirement 8.7. This is a lead for a separate contract audit, not authority to exempt existing violations. Empty-inventory rejection counters across both arrangement tiers: 1796 block-setback, 650 block-containment, 14 frontage-setback, 2 frontage-span, plus 380 duplicate attempts; repeated tiers/cases are not independent samples. The findings separate geometric inventory, compatibility, and finalization limitations. No change to validators.

## Compact joint parcel pilot — completed

[Run 45365642330](https://github.com/xbwtyz/Mappo/actions/runs/45365642330), job 138346538289, exact commit fcfcb7900f3c1531e14e424a1c13f90758036d9a; 60/60 Fast Checks. Nine organic cases matched by frozen identity and exact clear-all removal sets against the preceding diagnostic run. Seven of nine recovered only on the reduced input (four of five empty-inventory cases and all three early compatibility failures); zero of nine original-input recoveries. Two still refused: organic-3 PROP-00142 empty inventory and organic-3 PROP-00092 final road-setback. Seven successes removed 172 eligible buildings across independent counterfactuals, area 36543.26250501166. Original and reduced independent validators remain operative. The additional family changes the candidate pool under the existing budget and retention cap; this is not proof of broad non-regression. Demonstrated experimental union now 758/800 (94.75%), with 15 unresolved non-topological and 27 topology refusals. The preservation-only count stays 607/800, and the union excluding clear-all-only additions stays 741/800. No production integration or demolition authorization. Next: extend the compact experiment to the remaining 13 resistant cases and compare a less-destructive single-building witness cohort.


## Compact joint deformation — completed cross-morphology replay

Exact expansion commit 3995ebd062d321d01693a8356be7bc5c3f16c9f7: [planned 45366278402](https://github.com/xbwtyz/Mappo/actions/runs/45366278402), [radial 45366283090](https://github.com/xbwtyz/Mappo/actions/runs/45366283090), [linear 45366287308](https://github.com/xbwtyz/Mappo/actions/runs/45366287308), all 60/60 Fast Checks. Combined with organic pilot: planned 2/5, organic 7/9, radial 1/3, linear 1/5, total 11/22 reduced-input recoveries and zero original-input recoveries. All 22 identities and exact removal sets match terminal diagnostic cohort. Five of nine empty-inventory failures and six of twelve early compatibility failures recovered; final setback case unchanged. All eleven successful reduced-input cases have a terminal building greedy dead end on original input. Best observed clear-all counterfactuals removed 290 buildings, area 59656.86390465475, across eleven independent movements. Union 762/800 (95.25%), including destructive counterfactuals; preservation-only 607/800, excluding clear-all-only additions 741/800. Remaining eleven non-topological refusals: four empty parcel inventories, six parcel compatibility, one final setback. No proof of infeasibility or production acceptance.

## Single-building witness pilot — completed, detailed archive partial

[Run 45365975725](https://github.com/xbwtyz/Mappo/actions/runs/45365975725), job 138347659665, exact commit a318dc35753d482c249fe5db3b73ad8ca562be26. 60/60 Fast Checks, 12/12 exact archived single-removal witnesses reproduced, no reported invalid outcomes, 12 removed buildings across 12 independent counterfactuals, summed area 3341.435610217434. No new distinct recoveries. GitHub truncated two individual JSON log lines at about 65KB; ten intact records verify exact witness fingerprints. Among these ten, nine original-input greedy terminal building IDs match the removed witness; six report an empty inventory for that exact building. One terminal ID differs, illustrating that removal can affect neighboring placements. These are diagnostic clues, not proof of impossibility. Retain intact records and truncated raw evidence explicitly labeled incomplete; rerun with bounded log chunks to recover full traces. Next detached hypothesis: checking building feasibility while selecting parcels, rather than only after selecting all parcel geometry. No production changes.


## Interleaved placement pilot — completed

[Chunked control 45367006559](https://github.com/xbwtyz/Mappo/actions/runs/45367006559), job 138351208390, exact commit 85c6fe2aa8e665894adbb3ea8f795803fe27f2ae; [interleaved 45367059266](https://github.com/xbwtyz/Mappo/actions/runs/45367059266), job 138351390240, exact commit 67103d87b3e563fcda81b6ffd561e629dc6fcfdc. Both 60/60 Fast Checks, 12/12 reduced-input witnesses accepted, zero original-input recoveries and zero reported invalid outcomes. Interleaving alone did not solve the preservation bottleneck. Chunked control recovered eleven complete records; one planned-3 chunk was truncated by the log transport despite bounded chunks. All twelve interleaved records reconstruct; eleven matched pairs support numerical comparison. Lexicographic reduced-input score improved 4, tied 7, worsened 0; no new distinct recoveries. Original-input preview work 14972165 to 13364118, expansions 49020 to 27418; reduced-input preview work 18761198 to 22013687, expansions 57476 to 55445. Experimental union unchanged 762/800, preservation-only 607/800. Next: screen parcel choices against conservative building feasibility before pruning, with unchanged validators and explicit budget accounting. Retain missing evidence as incomplete, not reconstructed guesses.


## Building-aware parcel selection — completed round 1

[Run 45367799995](https://github.com/xbwtyz/Mappo/actions/runs/45367799995), job 138353964638, exact commit 2a90d8d99cad8004dbc9661b2c93b5752c3cb6cc, 60/60 Fast Checks. All twelve identities match the interleaved witness pilot; all twelve reduced-input witnesses still succeed; one original-input recovery, planned-2 RD-0162/RD-0235 offset (-8,-5), previously witnessed by removing BLD-00138. Verified fresh Apply, stored validation, independent preservation and unchanged building identities, candidate fingerprint 07de7e75c6205285c85db2fa35a18fb38df38e416bc3e5121349fc295a9ca9c3. Original-input work 3999978, expansions 6163. Probe uses largest rigid building, shared actual candidate inventory cache, after parcel compatibility, with unchanged limits and validators. This is a sampled feasibility heuristic, not proof of impossible geometry. Eleven remaining original-input refusals: ten exhausted and one work limit. Compared with interleaving, reduced-input lexicographic score better/tied/worse 0/11/1. Original-input work 16205909 to 24839382; reduced-input work 24749167 to 38380599. Demonstrated preservation-only union 608/800 (76%), combined union remains 762/800. No broad non-regression or performance claim. Archive all twelve compact result summaries and eleven complete base64 payload chunk sets; one payload incomplete due to transport truncation. Payload hashes emitted for future verification. No production authorization.


## Rigid feasible-region fallback — completed round 2

[Run 45368589135](https://github.com/xbwtyz/Mappo/actions/runs/45368589135), job 138356658199, exact commit a27a468163eae9bb47b03d2cedba4216279cadf3; 60/60 Fast Checks. Twelve exact matched witness cases, one original-input recovery (same fingerprint as building-aware round 1), twelve reduced-input recoveries, identical reduced-input objective scores in all twelve and 12/12 identical reduced candidate fingerprints. Zero additional recoveries or reported invalid outcomes. Bounded fallback computes a convex translation region when established building candidates are empty, up to 24 orientations/48 additional rigid transforms/4 accepted candidates; original containment, occupancy, preservation and final validators unchanged. Original work 24839382 to 24879850; reduced work 38380599 to 38414980. This pilot does not justify production adoption of the fallback; leave it isolated unless broad evidence changes the conclusion. Twelve complete chunk sets; hashes emitted, not independently verified. Preservation union 608/800, combined union 762/800 unchanged. Next round: coordinated neighboring parcel alternatives on six remaining compatibility cases, with original/reduced controls.


## Coordinated neighboring parcel deformation — completed round 3

Exact commit d3af286a89ce53fc313f417f6f48def389fb260a, [planned 45369701418](https://github.com/xbwtyz/Mappo/actions/runs/45369701418), job 138360472924; [linear 45369705005](https://github.com/xbwtyz/Mappo/actions/runs/45369705005), job 138360485419. Both 60/60 Fast Checks. All six identities and reduced removal sets exactly match remaining compact compatibility refusals. Diagnostic-guided common separator candidates, three positions, up to 72 additional attempts per targeted parcel, existing validation and budgets unchanged. Planned PROP-00300/PROP-00301 and linear PROP-00035/PROP-00038: all six reduced-input cases recovered, zero original-input recoveries, no reported invalid outcomes. Across six independent counterfactuals, 140 buildings removed, area 24199.052731592754. This establishes geometric witnesses, not authorization for deletion, generalizable pair discovery or production non-regression. Combined experimental union 768/800 (96%), preservation-only 608/800 (76%). Remaining five non-topological refusals: four empty inventories, one final road setback. Reduced preview work 7769191 to 8602891, expansions 348 to 22194; original-input work 8067826 to 12537217. Next: audit the existing setback conflict without changing validators, then combined benchmark.


## Setback contract audit — completed round 4

[Run 45370355699](https://github.com/xbwtyz/Mappo/actions/runs/45370355699), job 138362761658, exact commit 030bc6dc8f3fa49c25c52818a286c7f762cc6e2f, 60/60 Fast Checks. Original and reduced inputs reproduce organic-3 RD-0167/RD-0170/RD-0188/RD-0232 offset (0,-2), no acceptance changes. Independent actual source/candidate geometry measurement for PROP-00092 / RD-0233: original distance 9.959298255558103, proposed 8.080749215358827, requirement 8.7 both; genuine newly introduced setback shortfall 0.619250784641172. Property unchanged, road changed, parent BLK-0049 unchanged, road not a boundary of that block, property not active and not in local policy inventory. Equal reported old/new distances were misleading because finalizer calls inspectRoadDependencies(next,next,...). Do not exempt or weaken setback validation. Future proposal may include clearance-driven nearby-property context expansion, subject to preservation/ownership, bounded scope and explicit architecture approval; correct diagnostic reference semantics separately. Original/reduced preview work and expansion counts exactly reproduce compact pilot. Combined experimental union remains 768/800, preservation union 608/800; five unresolved non-topological cases (four empty inventories, one valid setback refusal), 27 topology refusals. No production changes.

Round 5 benchmark selection: selective numerical containment/clearance plus compact joint deformation, interleaved order and shared-cache largest-rigid-building feasibility lookahead, same 4M work / 16384 expansions / beam8 / 24 retained inventories. Exclude rigid-region fallback (no measured benefit), case-specific cooperative separator oracle (not generalized), demolition and setback exemptions. Benchmark a single combined preservation-only configuration on all 800 frozen identities, measure against B1 and archived selective, including regressions, objective quality and work. A union of earlier witnesses is not equivalent to one configuration's acceptance.


## Final preservation benchmark and research closure

See [research report](lare-research-report.md) for exact round 5 analysis. Combined solver 625/800; preservation union 627/800; combined union including destructive counterfactuals 768/800. The twenty additional preservation successes are not among the five remaining unproven non-topological cases. Two selective successes lost to work limit in the combined configuration. Five-round research complete. No permission to demolish, weaken validation, or integrate production strategies is inferred.

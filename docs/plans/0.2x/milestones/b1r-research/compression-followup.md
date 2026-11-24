# B1R compression research — detached follow-up

Status: experimental, preservation only. Production B1R remains unchanged. No uploaded save is stored in this branch.

## Frozen hosted baseline

[Run 45497937451](https://github.com/xbwtyz/Mappo/actions/runs/45497937451) on `9435e4e791970f3fad8aff60cb109d7f8e85bec6`: 61/61 Node tests passed; full Fast Checks passed in 1 min 21 sec. Synthetic generated medium organic city, seed mappo-001, regular/irregular properties; RD-0184/RD-0186 translated by (-3.005274072121821,-37.39896113564458) times nine scales. 18 distinct cases, each repeated; 2 accepted (scale .025, both layouts), 16 search-exhausted; all repeated outcomes matched. Graph and face checks passed for all. All six larger-magnitude cases at scales 1,.75,.5 (both layouts) and four at -.5,-1 consumed zero search expansions; no overall work cap reached. Scale .125 reached 5670/5672 expansions without an accepted arrangement. Input nonmutation and independent preservation validation checked.

## Round 2

Compare two detached source-copy variants on the same 18 cases: expanded full-frontage candidates ranked as one family, and the same generation with frontage-position/depth diversity families. No production or compiled source changes. Use existing Fast Checks; keep all validators, the 24-candidate cap and operation limits. Report recovered cases, regressions, work/expansions, candidate fingerprints, independent validation and deterministic repeat of accepted cases. A green research run is not production acceptance. Neither widening search nor pairwise compatibility establishes a complete preservation witness. Full frozen 800-case replay remains a later gate if a useful strategy emerges.

## Round 2 results — completed

[Run 45499099722](https://github.com/xbwtyz/Mappo/actions/runs/45499099722) on `ecceeed95a891c37374df410432225cc578858a3` passed 61/61 Node tests in 1 min 28 sec (Fast Checks). Both wide-ranked and wide-diverse accepted only the two existing successes (2/18 each), zero new recoveries, zero losses or invalid accepted candidates. Full positive movement now reached 232/138 expansions for regular/irregular geometry versus zero baseline, and both retained original successful fingerprints. Some reverse movements and the irregular .125 wide-diverse case reached a strategy work limit. Expanded candidate coverage alone is not a sufficient solution.

## Round 3 — detached block decomposition

Compare block-local beam search and deterministic bounded depth-first backtracking on wide-diverse enhanced rigid candidate inventories. Keep original strict/selective and fixed-building behavior, candidate cap and validators. Each block may use at most 2048 search expansions within the existing shared strategy and operation limits. Report empty parcel inventories, deepest assignment, blocked variable, local proposals and final union outcome. Local proposals are not accepted city edits; only the existing whole-project finalizer and independent preservation validation may produce a full witness. The experiment tests one proposal per block, so union failure or local exhaustion does not prove impossibility. Repeat accepted candidates and preserve existing successes; no production changes or demolition.

## Round 3 results — completed

[Run 45499827638](https://github.com/xbwtyz/Mappo/actions/runs/45499827638) on `629f88fcfa9b0c72e2cc0a2bbf8300a3bad880c4`: 61/61 tests passed in 1 min 29 sec. Block-beam and block-backtrack each accepted 2/18 (no recovered, regressed or invalid cases). On irregular .125, backtrack produced five local proposals; BLK-0063 (PROP-00123) and BLK-0066 (BLD-00156) reached 2048 expansions. On -.25, six of eight blocks produced proposals for both layouts, but BLK-0073 exhausted its alternatives and BLK-0074 hit its cap. No full union reached validation. Local proposals are not verified whole-city candidates.

## Round 4 — property bundles

Cache one non-overlapping building arrangement per parcel candidate and search compatible bundles across the block. Compare original rigid placement inventory vs extra interior grid points; same 160 attempted placements per building (existing clearance retry rules unchanged), 24 retained candidates and shared operation limits. Building domains ordered smallest first. Each bundle bounded to 256 expansions inside the 2048 block cap. Caches are scoped to one arrangement. Retain original whole-project finalizer and repeat/independent preservation checks. One local witness per parcel can miss alternatives needed by whole-city validation; capped bundle failures are not impossibility proofs. Interior sampling may consume the existing attempt cap earlier and reduce angular coverage; measure rather than assume improvement. No production changes.

## Round 4 results — completed

[Run 45500896482](https://github.com/xbwtyz/Mappo/actions/runs/45500896482) on `e029d65695ce9b8b27897e5cfe8490d4f398bd2f`: 61/61 tests passed in 1 min 7 sec. Both bundle strategies accepted 2/18, with zero recoveries, regressions or invalid accepted candidates. Bundle-lazy produced six of seven local proposals on +.125 for both property layouts (BLK-0066 recovered locally; BLK-0063 still capped). On irregular -.25 it produced seven of eight proposals; BLK-0073 remained exhausted at PROP-00166. Extra interior sampling recovered no additional local proposals and generally cost more work. No full union reached validation.

## Round 5 — constraint propagation

Use the lazy building bundles and wide-diverse parcel inventory; select the remaining property with the fewest available alternatives (minimum remaining values). Cache exact pairwise parcel overlap outcomes, charge cache reads and keep the same 2048 block, 256 bundle and shared work limits. Compare forward filtering after each assignment with iterative pairwise arc consistency before choosing a property. Both use original parcel and building geometry validators and the original whole-project finalizer; no global constraints are waived. Record candidate prunes, pair tests, cache hits, arc passes, local results and whole-city outcomes. Arc consistency is not a complete feasibility proof and can consume work up front; a capped or exhausted finite inventory is not a proof of geometric impossibility. No production changes, demolition or saved city upload.

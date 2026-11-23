# C7 browser responsiveness baseline (before optimization)

**Tested commit:** [b9862b5e39041df6ac9c69d5f1e0cf71f6135b27](https://github.com/xbwtyz/Mappo/commit/b9862b5e39041df6ac9c69d5f1e0cf71f6135b27) on `feature/mappo-0-2c-c7-finalization`.

**Evidence:** [Passing C7 benchmark run #44645147376](https://github.com/xbwtyz/Mappo/actions/runs/44645147376), artifact `c7-benchmark-44645147376` (raw per-case `performance.json`).

**Runner:** Ubuntu Linux, Intel Xeon 6975P-C, 4 logical CPUs, ~15.3 GiB RAM, Node 22.23.5. Headless Playwright 1.56.1, Chromium 141 and Firefox. Viewports 1440×900 and 390×844. These are synthetic runner measurements, not physical-device timings.

**Fixtures:** Organic, seed `c2-organic`. Small: N-0139 Y+15; Large: N-0145, N-0239 and N-0332, each X+8. Each run begins from the same accepted project. Cold and warm runs included. The benchmark also exercises an invalid draft, rapid superseded drafts, Apply/Undo/Redo and accepted-project isolation. All cases passed. Small had 167 nodes and 148 properties; Large contains 332 nodes and 943 properties.

| Browser/viewport | Size | n | Median preview (ms) | p95 preview (ms) | Median A3 analysis (ms) | Median C7 reflow (ms) | Median unchanged redraw (ms) | Worst frame gap (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chromium/desktop | Small | 2 | 332 | 358 | 27 | 90 | 2 | 17 |
| Chromium/desktop | Large | 6 | 930 | 1009 | 112 | 570 | 9 | 29 |
| Chromium/phone | Small | 2 | 325 | 351 | 25 | 94 | 2 | 17 |
| Chromium/phone | Large | 6 | 908 | 1008 | 103 | 551 | 9 | 29 |
| Firefox/desktop | Small | 2 | 333 | 350 | 24 | 87 | 3 | 149 |
| Firefox/desktop | Large | 6 | 1109 | 1275 | 147 | 702 | 12 | 1050 |
| Firefox/phone | Small | 2 | 321 | 335 | 21 | 88 | 3 | 150 |
| Firefox/phone | Large | 6 | 1106 | 1301 | 152 | 696 | 12 | 1083 |

Notes: The measured preview time includes the editor's 180 ms input debounce and browser rendering. The Firefox frame gap confirms an event-loop stall during synchronous reconciliation. Even if repeated redraw cost is reduced, this does not solve the ~700 ms core C7 calculation. The Apply operation independently validates/rebuilds, with Large median ~880–1235 ms across browsers and viewports; this revalidation is required for safety.

**Interpretation:** Preview geometry re-extraction is a demonstrable minor inefficiency (large-map unchanged redraw median 9–12 ms). The actual dominant cost is **C7 reconciliation**, not painting or rendering the existing impact report. Cache immutable display geometry as a low-risk optimization. Do **not** claim it resolves the large-city responsiveness gate. An event-loop-friendly approach to expensive C7 calculation requires a separate scoped design, instrumentation and regression verification without weakening Apply or author protections.

**C7 acceptance status:** Automated benchmark and original C7/C6 browser suites pass at this baseline. Physical touch and actual screen-reader walkthroughs remain unperformed and must be witnessed. Performance optimization and before/after proof remain open.

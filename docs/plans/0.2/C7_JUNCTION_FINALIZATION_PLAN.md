# C7 junction adaptation finalization

C7 closes the remaining road-versus-junction behavior gap in 0.2C. A junction drag uses the same local adaptation, crossing normalization, building choices, and atomic Apply as a street drag. The original junction work was completed in [PR #43](https://github.com/xbwtyz/Mappo/pull/43). [P7](https://github.com/xbwtyz/Mappo/pull/50) is the final performance pass planned for 0.2C. The fuller preview and replacement-report redesign follow in [0.2D](MILESTONE_0_2D_ROAD_UX_PLAN.md).

## Evidence already recorded

- [Implementation CI passed](https://github.com/xbwtyz/Mappo/actions/runs/44636866244) for commit `31ea513`. Local verification included 395 Node tests and eight Chromium/Firefox road viewport checks.
- The four-layout acceptance test covers significant junction edits, local development changes, Apply, Undo, Redo, and exact portable reopen. Radial and Organic cases include crossings. A named building case requires a user choice before Apply.
- Three sampled shifts on a Large Organic map with 332 nodes and 943 properties produced valid previews in approximately 1.6–2.8 seconds in Node during other workloads. This was an early baseline observation. The later [browser baseline](C7_PERFORMANCE_BASELINE.md) and [P7 results](C7_P7_INPUT_RESPONSIVENESS.md#results-and-disposition) supersede it for the handoff.

## Acceptance record

### 1. Measure and improve large-city responsiveness

- [x] Establish a browser baseline on the C7 standalone in Chromium and Firefox. Use Small and Large Organic maps with seed `c2-organic`. For the Large fixture, test X +8 at junctions `N-0145`, `N-0239`, and `N-0332`. Include a rejected draft and a rapid sequence of nudges or drags. Begin each independent run from the same accepted project.
- [x] Record map size, viewport, browser, machine, cold/warm runs, release-to-preview and Apply times, and visible input stalls. Measure delay before work starts, reconciliation, rendering, and Apply validation separately where possible. Report median and tail timings with the sample size.
- [x] Profile slow cases. Review duplicate impact/reconciliation work, repeated graph or geometry construction, and rendering of large reports. Fix the measured bottleneck with bounded work and exact inputs. Keep Apply's independent rebuild, stale-draft checks, and full validator intact.
- [x] Repeat the same tasks after the fix. Confirm the latest draft wins during rapid input. A slow or superseded draft must keep Apply disabled and preserve accepted geometry, history, and recovery.
- [x] Review remaining stalls against the interaction users actually see. The proposed usability goals are an immediate drag preview, prompt checking feedback on release, and no frozen controls during longer calculations. Record any latency tradeoffs before release review.

### 2. Verify physical touch and assistive technology — owner sign-off recorded

- [x] On physical touch hardware, drag a street, a junction, and a bend. Verify target placement, finger release, cancel, and pan with a draft open. Confirm the Apply explanation and conflict controls remain reachable while scrolling the panel.
- [x] Using keyboard only, select and nudge a junction, read its blocked state, enter and exit building choices, and Apply and Undo a valid edit. Verify visible focus and usable scrolling with the panel expanded and minimized.
- [x] With a screen reader, confirm that checking, blocked, and ready statuses are announced without repeated chatter. Activate **Resolve conflict** from a minimized panel, confirm focus lands on the first choice, and verify controls are labeled and can be exited.
- [ ] Record per-device/browser/input-method evidence and any reproducible issues if provided.
  **Acceptance note (2026-11-19):** The project owner explicitly signed off this
  physical accessibility gate. No device, browser or screen-reader run details
  were supplied, so these checked items represent **owner acceptance**, not
  independently verified individual test results. See [the manual worksheet](C7_PHYSICAL_QA.md).

### 3. Run final 0.2C acceptance

| Layout | Seed | Junction move |
| --- | --- | --- |
| Planned | `c2-planned` | `N-0105`, X +12 |
| Radial | `c2-radial` | `N-0101`, Y +15, with a normalized crossing |
| Organic | `c2-organic` | `N-0139`, Y +15, with a normalized crossing |
| Linear | `c2-linear` | `N-0118`, Y +8 |

- [x] On Small developed maps, rerun the four junction cases through preview, Apply, Undo, Redo, and portable reload. Verify the intended position, modified incident streets, local development, unrelated records, and one accepted transaction.
- [x] Rerun the [C6 street, bend, split, and merge cases](C6_ROAD_EDITOR_ACCEPTANCE.md) alongside the junction cases. For author protection, name `BLD-00048` in Small Radial, run the `N-0101` move, and verify that only a validated, explicitly chosen placement enables Apply. Check a protected boundary or infrastructure case and an older schema-9 save.
- [x] Run the full Node and Chromium/Firefox viewport suites on the final candidate. Rebuild the offline standalone and verify root parity. Record CI and manual results against the exact commit reviewed.
- [x] Record the evidence for the 0.2C handoff. [P7 CI](https://github.com/xbwtyz/Mappo/actions/runs/44671837906) passed on runtime commit `f3bf860`. Review disposition and residual stalls are recorded in the [C7 closeout](C7_CLOSEOUT_REVIEW.md). The placement and replacement-report usability work continues in 0.2D.

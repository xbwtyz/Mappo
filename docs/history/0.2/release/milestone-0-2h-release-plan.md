# Mappo 0.2H — Release hardening implementation plan

**Current outcome:** H1–H5 completed; [PR #91](https://github.com/xbwtyz/Mappo/pull/91) merged; [exact-main CI](https://github.com/xbwtyz/Mappo/actions/runs/44960254289) passed; [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0) published. **Historical baseline:** G4, runtime `0.2-dev.g3g`, package `0.2.0-dev.g3g`, project schema 9 and format 1. The original checklists below retain their pre-publication chronology.

**Goal:** Finish the existing 2D designer as a dependable offline 0.2.0 release without weakening preservation rules, forcing onboarding, adding phone support, or silently publishing on a merge. All work remains modular. Any production or schema change is individually justified and verified.

## H1 — Release workflow readiness (merged in PR #88)

- [x] Replace the historical 0.1.0 `workflow_run` publisher with a **manual-only** `workflow_dispatch` stable 0.2.0 release workflow. A successful main CI must never publish automatically.
- [x] Require manual **PUBLISH-0.2.0** confirmation and execution from `main` in the canonical repository.
- [x] Fail closed unless both `APP_VERSION` and `package.json` equal the final stable `0.2.0` (not dev), release notes `docs/releases/v0.2.0.md` exist, and the matching tracked standalone exists. **These H5 inputs are intentionally absent in H1/H2.**
- [x] Require a successful **Mappo CI** push run on exactly the checked-out main SHA, then independently rebuild/execute the complete Node suite and verify byte-identical tracked HTML.
- [x] Recheck main hasn't moved before publishing. Refuse existing tag/release instead of rewriting history; target only the exact SHA with the versioned `mappo-0.2.0.html` asset.
- [x] Full [PR #88 CI](https://github.com/xbwtyz/Mappo/actions/runs/44955921101) passed the guard tests and manual-only YAML without publishing.
- [x] Owner approved H1/H2 PR #88 merge; no tag, release or Pages deployment.

**Release authority remains explicit:** G4 approval and H1/H2 merge approval are *not* authorization to publish v0.2.0.

## H2 — Save format and migration audit (merged in PR #88)

- [x] Preserve format **1** and project schema **9** unchanged; no new migrations or generator-based reconstruction.
- [x] Add direct frozen-file Node tests for two historical schema-1 sources plus schemas **2–8**, checking every saved geometry array, IDs, metadata and modern save/load/save round-trip.
- [x] Check schema-9 authored building names and unrecognized extension/workspace fields still survive serialization.
- [x] Check malformed, incompatible future format/project/workspace versions and broken endpoints reject without changing accepted work.
- [x] Add desktop real-browser Project-menu open checks in Chromium/Firefox for native schema **1, 4, and 8** files, exported schema-9 reopen, and rejection of a future file without accepted-city mutation. G4 already covered browser schema 2.
- [x] All 459 Node tests and Chromium/Firefox historical save import/export/reopen tests passed before H1/H2 merge, with production runtime untouched.

Do not delete or rewrite frozen fixture files. Preserve unsupported newer saves rather than attempting destructive migration; browser recovery is an additional backup, not a replacement for portable downloads.

## H3 — Responsiveness and issue disposition (merged PR #89)

The [H3 desktop performance audit](h3-performance-audit.md) reproduces Large Organic `c2-organic` junction edits in Firefox and Chromium with the original C7 benchmark. Worker computation remains approximately 0.6–0.7 seconds; the preview takes roughly 0.93–1.02 seconds total. Worst observed UI-frame gaps were 133 ms Chromium and 183 ms Firefox, **not** the earlier ~1-second frozen frame. Fresh Apply finishes in 0.79–0.87 seconds but the click handler's worst measured time was only 39 ms. These observations are from a shared Intel CI runner, n=6 Large previews per browser; they are not physical-device performance guarantees.

- [x] Preview median/p95, main-thread frame/input gaps and Apply click/finish time measured and compared to historical P7.
- [x] Worker path, latest-draft cancellation, accepted-state preservation, independent Apply, atomic commit and Undo/Redo verified.
- [x] No measured material regression justifying speculative runtime changes or weakening validation. One-off benchmark CI trigger removed.
- [x] Owner approved closure of the original freezes and blocking reports; [#44](https://github.com/xbwtyz/Mappo/issues/44) and [#46](https://github.com/xbwtyz/Mappo/issues/46) are closed with evidence and remaining caveats. Reopen new narrowly reproduced real-user stalls as new work, not benchmark chasing.
- [x] PR #89 passed [full final six-runner CI](https://github.com/xbwtyz/Mappo/actions/runs/44957313588) and received separate owner merge approval.
- [x] [#79](https://github.com/xbwtyz/Mappo/issues/79) dead-end deletion remains separate, unmodified engine work.

## H4 — Final integrated release QA (completed pre-release cycle)

The [H4 release acceptance report](h4-release-qa-report.md) is the authoritative final test matrix on the existing `0.2-dev.g3g` app. H4 does **not** promote it to the stable `0.2.0` version; that remains a separately approved H5 commit. Full existing Node and browser suites remain required.

- [x] All **459 Node tests** and all four browser QA suites passed the H4 implementation run [#44958095092](https://github.com/xbwtyz/Mappo/actions/runs/44958095092), with the combined gate green. This sentence records H4-era evidence; H5 subsequently passed and published v0.2.0.
- [x] G4 desktop matrix (1366×768 / 1440×900 / 5120×1440) and cross-editor accepted/draft, scoped history and failed Apply regression passed in both browsers.
- [x] H2 frozen schema **1–8** and schema-9 compatibility, unchanged geometry/IDs and actual Project-menu export/reopen passed both browsers.
- [x] H4 native browser database recovery passed **Chromium and Firefox**: current/backup after reload, explicit latest/previous restore, authored identities and exported portable file reopening.
- [x] Real `file://` startup and zero external HTTP checks passed in both browsers, and root/versioned compiled HTML bytes remained identical.
- [x] Desktop/browser policy and #79, transient frame stalls and fallback ordinary-road Apply limitations are recorded in [H4 release report](h4-release-qa-report.md).
- [x] H4 report includes successful CI and artifacts, 459-test result and release-readiness assessment.
- [x] Owner separately approved and merged H4 PR #90. No tag, stable release or Pages publishing occurred.

## H5 — Owner-approved 0.2.0 release candidate / publication

[H5 candidate checklist and final CI evidence](h5-release-candidate-report.md). This phase freezes the already-tested 2D editor; no new feature work or schema migration.

- [x] H5 committed aligned `0.2.0` versions and compiled `index.html`/`dist/mappo-0.2.0.html`; older distributions retained. [PR #91](https://github.com/xbwtyz/Mappo/pull/91) was explicitly approved and merged.
- [x] Final [0.2.0 release notes](../../../releases/v0.2.0.md) document changes, compatibility and known limitations.
- [x] [Exact-main CI](https://github.com/xbwtyz/Mappo/actions/runs/44960254289) passed; merge and publication received separate explicit owner approvals.
- [x] After approval, guarded `release.yml` published [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0). GitHub Pages remains a **different**, manual workflow.
- [x] Published v0.2.0 release/standalone asset and final-main CI are linked above; v0.1.0 remains archived. Pages deployment must not be inferred from this release and requires its own authorization.

## Phase acceptance and user experience

H1/H2 are **infrastructure and compatibility QA**, not feature development: no new controls, new interactions, application source changes, schema bump, or public-site updates. The 0.2 City Designer that passed G4 should behave identically. Developers gain a safe release process and regression evidence that actual archived cities survive modern file loading.

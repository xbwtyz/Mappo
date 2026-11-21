# Mappo 0.2H — Release hardening implementation plan

**Status:** H1/H2 merged in PR #88, H3 benchmark and disposition completed on PR #89 (merge awaiting approval); H4/H5 pending. **Baseline:** merged 0.2G G4 PR #87, runtime `0.2-dev.g3g`, package `0.2.0-dev.g3g`, project schema 9, portable format 1. Current stable GitHub Release: **v0.1.0**.

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

## H3 — Responsiveness and issue disposition (completed measurement; PR #89 awaits merge)

The [H3 desktop performance audit](H3_PERFORMANCE_AUDIT.md) reproduces Large Organic `c2-organic` junction edits in Firefox and Chromium with the original C7 benchmark. Worker computation remains approximately 0.6–0.7 seconds; the preview takes roughly 0.93–1.02 seconds total. Worst observed UI-frame gaps were 133 ms Chromium and 183 ms Firefox, **not** the earlier ~1-second frozen frame. Fresh Apply finishes in 0.79–0.87 seconds but the click handler's worst measured time was only 39 ms. These observations are from a shared Intel CI runner, n=6 Large previews per browser; they are not physical-device performance guarantees.

- [x] Preview median/p95, main-thread frame/input gaps and Apply click/finish time measured and compared to historical P7.
- [x] Worker path, latest-draft cancellation, accepted-state preservation, independent Apply, atomic commit and Undo/Redo verified.
- [x] No measured material regression justifying speculative runtime changes or weakening validation. One-off benchmark CI trigger removed.
- [ ] Owner reviews issue dispositions: [#44](https://github.com/xbwtyz/Mappo/issues/44) remains open for residual 100–183 ms stalls; [#46](https://github.com/xbwtyz/Mappo/issues/46) is a candidate for closure for the **primary junction worker path only** (other road/fallback paths can be synchronous).
- [ ] Final PR-head CI green and separate merge approval.
- [x] [#79](https://github.com/xbwtyz/Mappo/issues/79) dead-end deletion remains separate, unmodified engine work.

## H4 — Final integrated release QA

- [ ] Complete all existing Node/Chromium/Firefox desktop + road/property/integration tests on the proposed release candidate; verify supported laptop, desktop and ultrawide workflows.
- [ ] Verify current/archived saves, export, offline `file://`, recovery and failed Apply isolation in both browsers.
- [ ] Freeze documented open limitations, release support policy, full integration evidence and reproducible benchmark caveats.
- [ ] Confirm compiled standalone has zero external runtime dependencies and exact root/distribution byte parity.

## H5 — Owner-approved 0.2.0 release candidate / publication

- [ ] Separately approve an H5 branch updating **both** app/package versions to `0.2.0` and compiled `index.html` and `dist/mappo-0.2.0.html`; preserve older dist assets.
- [ ] Write reviewed `docs/releases/v0.2.0.md` with changes, compatibility policy and known limitations.
- [ ] CI green on exact final `main` SHA; explicit separate approval for merge and **another explicit approval for publication**.
- [ ] Only after approval, manually dispatch the guarded `release.yml` workflow with `PUBLISH-0.2.0`. GitHub Pages is a **different**, manual workflow and is not published by the GitHub Release action.
- [ ] Verify GitHub Release tag/assets, `main`, workflow logs, archived v0.1.0 preservation and optional Pages publication only if authorized.

## Phase acceptance and user experience

H1/H2 are **infrastructure and compatibility QA**, not feature development: no new controls, new interactions, application source changes, schema bump, or public-site updates. The 0.2 City Designer that passed G4 should behave identically. Developers gain a safe release process and regression evidence that actual archived cities survive modern file loading.

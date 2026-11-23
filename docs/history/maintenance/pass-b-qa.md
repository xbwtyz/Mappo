# Mappo Pass B — CI Housekeeping Verification

**Branch:** `chore/ci-housekeeping` · **Base:** `main` at `645fcdd2ded4ed4224c79deca88b4887eaec3222`.

## Approved items

All nine Pass B items (B1–B9) are approved. This branch introduces the consolidated CI workflow, dynamic standalone validation, both browser QA suites, downloadable artifacts, minimal validation permissions, expanded local-file ignores, named test commands and a PR review template. It removes the three completed milestone-specific workflows **only after first successful replacement validation**.

## Proven first unified CI run

[Mappo CI run #44272377893](https://github.com/xbwtyz/Mappo/actions/runs/44272377893) on commit `a4ef723ef1a00a286bc232d84ddcfe1009f4c873`:

- **205/205 Node tests passed; 0 failed.**
- **8/8 general browser smoke checks** passed across Chromium and Firefox on desktop (1440×900), ultrawide (5120×1440), tablet (768×1024) and phone (390×844).
- **8/8 property/building browser checks** passed on the same matrix; total **16/16**.
- Generated HTML present and tracked; `index.html` and `dist/mappo-0.1-dev.3fd.html` compared byte-for-byte and `git diff` confirmed no generated drift.
- Browser screenshots: artifact `mappo-browser-44272377893-1`.
- HTML files: artifact `mappo-0.1-dev.3fd-44272377893-1`.
- CI job completed successfully; both artifact upload steps succeeded.

## Protection and scope

- The validation workflow `.github/workflows/ci.yml` uses `contents: read` only; no automatic commit or push.
- The separate `.github/workflows/pages.yml` is **unchanged**. Publishing behavior stays as it was.
- Removed from this branch after the successful first run: `.github/workflows/milestone-3f-check.yml`, `.github/workflows/phase4-check.yml`, and `.github/workflows/phase7-check.yml`.
- No application source in `src/`, `styles/`, `scripts/`, `tests/`, no schema or runtime dependency additions, and no changes to `index.html` or `dist/`.
- `package.json` adds test command aliases, preserving `build`, `test`, and `check`.
- `.gitignore` retains historic builds, fixtures, and documentation images.
- New CI runs on development branches, PRs, and `main`; final PR verification should also pass before merge.

**Not included:** changes to Pages deployment, deleting old branches/historical distributions, or altering Mappo user-facing features. The [Pass A documentation PR](https://github.com/xbwtyz/Mappo/pull/3) remains separate; if it merges, its Developer Guide's old CI workflow link should be reconciled to `docs/CI.md` during integration.

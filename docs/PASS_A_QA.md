# Pass A Documentation Cleanup — QA and Change Record

**Branch:** `chore/repo-housekeeping` · **Base:** `main` at `645fcdd2ded4ed4224c79deca88b4887eaec3222`.

## Approved scope

All nine Pass A tasks (A1–A9) were approved: concise root README; user/developer guides; reference organization; historical milestone archive; docs index; roadmap; relative-link audit; screenshot gallery.

## Validation performed

- **146 relative Markdown links checked across 33 Markdown files before this QA note was added**: 0 missing local paths. Checked README, current guides, indexes, redirect stubs, technical contracts, archived plans and QA.
- All six existing milestone screenshots remain at their original paths and bytes; the gallery and README point to those images. No screenshot binary was modified.
- GitHub comparison showed **33 documentation-only changed files** in the implementation set (including content moves and root forwarding files), with **no changes under `src/`, `tests/`, `styles/`, `scripts/`, `dist/`, `.github/`**, nor to `index.html`, `index.template.html`, or `package.json`.
- Current build commands were checked against `package.json`, `scripts/build.mjs`, and `src/core/version.js` in the audited release; documentation now references the active `0.1-dev.3fd` build.
- Historical documents were retained in `docs/history/`, with link rebasing after the move and short forwarding documents for `QA.md`, `PROJECT_FORMAT.md`, `WORKSPACE_UI.md`, and `MILESTONE_3F_PLAN.md`. Old GitHub links to *other* moved root paths will not remain valid on the future `main`; their historical content remains addressable via Git history, and all in-repository Markdown links were updated.
- No build/test workflow was changed or triggered by this documentation-only branch. **No fresh runtime test suite result is claimed for Pass A.** The existing [3F-D CI evidence](https://github.com/xbwtyz/Mappo/actions/runs/44265027575) remains the last recorded application verification.

## Merge discipline

Nothing is merged by this documentation work. PR review and explicit approval are required before moving this branch into `main`. The GitHub Pages path filters in the existing workflow do not deploy documentation-only commits.

## Deferred to other separately reviewed passes

Consolidating CI workflows, changing `.gitignore`, pruning branches, and archiving/removing standalone historical HTML builds are **not** part of Pass A.

# Mappo — Build Retention Policy

**Pass C approval:** C3 approved, C5–C7 denied.  
**Historical Pass C baseline:** `main` at `92c54cc7c03ad8a4ea4a560f0f58bc1e79d911d2`, `0.1-dev.3fd`, 39 versioned standalone builds. **Current PR #92 branch inventory (November 21, 2026):** 104 tracked `dist/mappo-*.html` checkpoints, including `mappo-0.2.0.html`. This does not change the retention decision.

## Rules in force

1. **Retain the 39 original Pass C files and all subsequent tracked `dist/mappo-*.html` builds (104 on this branch).** Do not delete, rename, overwrite, move or rewrite historical HTML as routine cleanup. Each version may be linked externally, referenced in historical docs, or used as a regression fixture.
2. **Keep `index.html` and `dist/mappo-<APP_VERSION>.html` byte-for-byte identical** for the active version, with the version sourced from `src/core/version.js` and aligned with `package.json`. Use the existing deterministic build.
3. **Preserve `tests/fixtures/` and `dist/mappo-0.1-dev.3e6.html` in particular**: historical saves test migration, while `3e6` is an explicit regression test reference. Do not assume arbitrary previous builds are unused.
4. **Keep `.github/workflows/pages.yml` unchanged.** Its existing historical build-count requirement and `main` deployment filters remain; documentation-only changes must not be used to silently change publishing behavior.
5. **Create new versioned standalone artifacts at approved development milestones** rather than overwriting an older version. Do not discard snapshots just because a newer file exists.
6. **Use `archive/pre-3g-history` as a preservation anchor.** Its commit `92c54cc7c03ad8a4ea4a560f0f58bc1e79d911d2` contains the pre-3G source and all 39 HTML files. Treat this ref as archival: do not rebase, force-update, delete, or move it during normal development. The Git reference alone is not immutable branch protection; additional repository settings/independent backups would require separate approval/action.

## Future release retention review

Before any **future separately approved** pruning, prepare an explicit filename-by-filename keep/retire proposal. Verify direct documentation references, CI and historical test dependencies, external Pages URL impacts, archived hashes, save/schema compatibility, release artifacts, and reversibility. Obtain explicit approval for each proposed change and revise Pages constraints only with approval.

**Current decision: retain everything, including all 104 tracked distributions.** C5 (removing redundant builds), C6 (changing Pages rules) and C7 (changing version links) are denied. C2 (creating a curated public Build History Catalog) is undecided.

## Verification

[Inventory audit](PASS_C_INVENTORY_AUDIT.md) · [Archive snapshot](https://github.com/xbwtyz/Mappo/tree/archive/pre-3g-history) · [Branch review](BRANCH_CLEANUP_REVIEW.md).

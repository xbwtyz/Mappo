# Pass C — Completed Branch Review and Manual Cleanup

> **Branch-listing observation, November 21, 2026:** `chore/ci-housekeeping`, `chore/repo-housekeeping` and `feature/building-inspector-3f` are still listed. The four `feature/ui-phase-4` through `feature/ui-phase-7` names were **not present** in the current branch listing. This does not establish who deleted them or change the seven-name **historical** C9 audit below. No branch deletion or other ref update is authorized by this documentation cleanup; re-verify ancestry and references before any future action.

**C8 approved. C9 approved with GitHub UI deletion to be performed by the repository owner.**

Comparison baseline: [`main` at `92c54cc7c03ad8a4ea4a560f0f58bc1e79d911d2`](https://github.com/xbwtyz/Mappo/commit/92c54cc7c03ad8a4ea4a560f0f58bc1e79d911d2). Each of the **seven** legacy branches below is an ancestor of `main` with **zero branch-only commits**. No deletion was performed.

## Branch-by-branch approval checklist

| Delete manually? | Branch | Verified head SHA | Branch-only commits | Notes |
| --- | --- | --- | ---: | --- |
| [ ] | `chore/ci-housekeeping` | `2b6dd300dd842c087f76e9e2e556e40600f04cd9` | 0 | PR #4 |
| [ ] | `chore/repo-housekeeping` | `97d61d81950a5d7c334d841c6cb9aa107c34c442` | 0 | PR #3 |
| [ ] | `feature/building-inspector-3f` | `48d7006ccf8868cd492ee0c27f7f385f782c175c` | 0 | PR #2 |
| [ ] | `feature/ui-phase-4` | `649eb5e18cbc586347206de09ff6a5cd89322feb` | 0 | UI milestone |
| [ ] | `feature/ui-phase-5` | `64efbef443357e8e51108cbafe7fb877abed3b43` | 0 | UI milestone |
| [ ] | `feature/ui-phase-6` | `bd35572ed7e912ee1eedca55b05a178a184295e3` | 0 | UI milestone |
| [ ] | `feature/ui-phase-7` | `981fe2d785b5d4482cdefd330b7b2416b0390b8a` | 0 | PR #1 |

The source commits and previously merged PRs remain in `main` history. Deleting a branch removes its **branch ref**, not the merged commits. For `chore/ci-housekeeping`, the PR was merged from its subsequent merge-integration commit; the existing original branch head remains an ancestor.

## Manual GitHub instructions — after the Pass C PR is reviewed

1. Open [Mappo branches](https://github.com/xbwtyz/Mappo/branches) in GitHub.
2. Confirm `chore/release-housekeeping` has been merged into `main` and any current work has an approved continuation branch.
3. For each of the **seven exact names** above, recheck that its head is still fully included in `main`. In the branch list, choose **Delete branch** / the trash icon. Complete deletion only for the entries that still match the approved list.
4. **Do not delete** `main`, `archive/pre-3g-history`, or any newly created feature branch. Leave the release-housekeeping branch until its PR has merged and its status has been reviewed separately.

The connected GitHub tools available for Pass C cannot delete branch refs; **C9 is documented and verified but remains a manual action**, not an executed deletion. If GitHub reports a branch changed or diverged since this audit, skip it and re-audit.

## Snapshot protection

- [`archive/pre-3g-history`](https://github.com/xbwtyz/Mappo/tree/archive/pre-3g-history) is a new snapshot branch at `92c54cc7c03ad8a4ea4a560f0f58bc1e79d911d2`.
- All 39 `dist/` HTML blob SHAs match `main`; source, Pages workflow and compatibility fixtures are preserved.
- The snapshot branch is a normal branch ref, not inherently immutable or automatically protected. Treat it as retained historical evidence.

[Inventory audit](PASS_C_INVENTORY_AUDIT.md) · [Retention policy](BUILD_RETENTION_POLICY.md).

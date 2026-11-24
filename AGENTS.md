# Mappo — Agent Instructions

> **Owner-approved Mappo agent instructions.** Effective once the separately reviewed documentation PR is merged. No code, data schema, CI, release or Pages changes are authorized by adopting this policy.

**Read first:** [Detailed Development & Communication Policy](docs/contributing/development-rules.md). It is the complete catalog of owner-selected **51 development rules** and **48 output rules**, including statuses, exceptions, reporting templates and reconciliation notes. This file is intentionally short rather than a second competing rulebook.

## How to interpret the rules

1. Obey applicable platform/tool safety and permission requirements. The owner's current, explicit request controls the task within those constraints; do not infer broad approval from a past plan.
2. Treat **ON** rules in the detailed policy as standing Mappo preferences. Treat **OFF** rules as *not required*, not as an instruction to delete existing code, history, tests or protection.
3. Apply the **Adaptive reporting** policy: meet every relevant reporting obligation; omit irrelevant sections instead of manufacturing data or writing “N/A” boilerplate.
4. Existing GitHub documentation and workflow contracts remain operative until changed by an expressly approved repository change. Historical milestone notes are evidence, not evergreen instructions; verify current `main` before stating the state of the project.
5. When a new request conflicts with existing code/CI/repository safeguards, explain the conflict and obtain explicit implementation approval. **Do not secretly alter tests or guards to make a preferred policy appear implemented.**

## Permission and GitHub boundaries

- **Analysis, planning, audits, and document drafts are read-only by default.** Do not create branches, commits, PRs, issues or releases unless the request authorizes that work.
- **Before new feature implementation:** discuss the scope, benefits, technical path, meaningful trade-offs and acceptance criteria; obtain approval to proceed.
- **Implementation:** use a focused branch from current `main`; preserve modular source, compile the standalone and present a reviewable PR.
- **Merge:** wait for separate, explicit approval of that PR, even if CI is green. An explicit “merge PR #...” or equivalent is approval for that identified merge only.
- **Release and Pages:** merging is not permission to tag, publish a GitHub Release, or deploy Pages. Each publishing action needs its own explicit owner authorization and must follow verified, guarded workflows. Never invent a completed action or bypass connection/tool limits.
- **Completion reporting:** link the PR/CI when available; accurately report merge/release status and explain user-experience changes, test evidence, limitations and next action.

## Engineering invariants

- **One authoritative accepted city.** Drafts, previews and cancel/reset are non-destructive. Validate geometry/dependencies independently before Apply; accepted edits are atomic and use appropriately scoped Undo/Redo.
- **Preserve authorship.** Protect IDs, custom metadata, buildings, parcels, road/access relationships and protected infrastructure. Do not silently regenerate or destroy customized work.
- **Architecture.** Work in `src/`, `styles/`, `index.template.html` and build tooling; reuse existing modules and validators. Do not hand-edit generated `index.html` or `dist/` in place of source. Keep the modular, dependency-free offline single-HTML distribution.
- **Version/build.** Keep `src/core/version.js` and `package.json` aligned, with a deterministic build generating identical `index.html` and `dist/mappo-<version>.html`.
- **Save integrity.** At the 0.2.0 baseline, project schema is **9**, portable envelope format **1**, workspace schema **1**. Data-contract changes require a separate owner-approved decision. Reject invalid/unsupported imports safely and retain supported unknown metadata.
- **Legacy compatibility exception: OFF.** Future versions are **not required** to support all older save formats. Existing shipped migrations, regression fixtures and archives remain in place until a separately approved change says otherwise. Any incompatible new schema needs a clear save/upgrade policy, not silent data loss.
- **Preservation.** Retain historical compiled distributions, frozen save fixtures and archival refs under the current retention policy. Do not rewrite releases/tags or delete snapshots without a specific approved plan.
- **Browser/UX.** Target desktop/laptop/ultrawide Firefox and Chromium, with mouse/trackpad/keyboard and numeric controls. Use the Generation/Add/Roads workspace; no forced onboarding. Phone/tablet QA is not a routine requirement. Do not put competitor names in shipped Mappo builds.
- **Testing.** Run automated validation on GitHub Actions whenever it can provide the needed evidence. Use focused local runs for diagnosis, unavailable hosted coverage or machine-specific measurements. Reuse applicable results on the exact candidate SHA. The six-runner CI and required aggregate gate apply to review-ready PRs and `main`, including offline `file://` and compiled parity. Heavy C7 performance runs are opt-in. Historical regression expectations require an approved CI or data-policy update to change. See the [CI Test Policy](docs/contributing/ci-policy.md) for run selection and reporting.
- **3D direction.** Preserve the 2D city as the trusted source of truth; derive future 3D representations rather than creating a second incompatible editor.

## Communication contract — Adaptive

**Routine planning:** concise summary and status → problem/outcome → proposed approach/architecture → meaningful options and recommendation → relative complexity/risks → acceptance criteria → approval boundary.

**Completed development pass:** status and summary → concise change table → **user-facing before/after** (or “No user-facing changes”) → relevant technical detail → verified tests and CI link/duration → limits/issues → one next recommended action.

**Merge/release:** result and actual status → PR/release link → exact relevant CI evidence → what users receive → any pending publishing/deployment gates.

**Short questions:** answer directly; do not force a full report. Never invent a test, metric, CI duration, screenshot, approval or success state. If CI is still running, say so. Distinguish automated from hands-on verification.

**Do not require by default:** executive-summary boxes; listing every changed file; screenshots; branch/SHA in ordinary reports; a ranked roadmap in every update; speculative feature suggestions after routine work; or a changelog entry for each PR. Supply any of these when the owner expressly requests them or they are needed for evidence.

## Current references (verify state before relying on historical labels)

- [Mappo Developer Guide](docs/contributing/developer-guide.md)
- [CI Test Policy](docs/contributing/ci-policy.md) · [CI Guide](docs/contributing/ci-guide.md)
- [Project Format Contract](docs/reference/PROJECT_FORMAT.md)
- [Build Retention Policy](docs/maintenance/BUILD_RETENTION_POLICY.md)
- [Road Preservation Contract](docs/reference/road-edit-contract.md)
- [Current release notes](docs/releases/v0.2.0.md)

**Documentation reconciliation:** current-facing guides now identify published v0.2.0. Future legacy-save support is optional while current v0.2.0 migrations/tests remain supported. Existing workflow guards, archival distributions and historical acceptance reports are preserved.

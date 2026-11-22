# Mappo 0.2.x — Issue Review and GitHub Filing Guide

> **Discussion workflow:** Review the drafts with the owner. **Do not create or update GitHub Issues until the specific text and scope are approved.** The existing [Issue #79](https://github.com/xbwtyz/Mappo/issues/79) is the one exception to the new-issue numbering: use it directly for A01, not a duplicate. Its four architecture decisions are **owner-approved** (A/A/A/A); its [updated description](ISSUE_79_UPDATE_DRAFT.md) is **owner-approved for posting** to the existing issue. Other issue drafts still require separate review and approval.

## One-issue review checklist

1. **Reproduction:** Is this currently observable in v0.2.0 or only a documented restriction? Include city seed, morphology, accepted project data, relevant IDs and exact browser steps when possible.
2. **User impact:** What desirable action is currently unavailable? Explain the expected workflow without inventing new UI panels.
3. **Scope:** Define positive examples and hard negative boundaries. A protective validator is not a defect just because it blocks something unsafe.
4. **Architecture:** Identify the owning source modules, expected cross-system effects and whether a new data model/schema is necessary.
5. **Preservation:** State exact authored data and protected features that must survive; spell out when owner consent is needed.
6. **Tests:** Require deterministic positive/negative fixtures, no-mutation Cancel, atomic Apply, Undo/Redo, safe save/reopen and Firefox/Chromium desktop acceptance where applicable.
7. **Dependencies:** Note previously approved issues/milestones to avoid competing engines and duplicate work.
8. **Decision:** Owner approves the final GitHub Issue body and target only after reviewing the choices. Issue creation is **not** coding approval.

## Recommended issue labels (proposal, not created)

- `area:roads`, `area:parcels`, `area:buildings`, `area:history`, `area:performance`, `area:files`, `area:export`.
- `type:bug`, `type:limitation`, `type:enhancement`, `type:investigation`.
- `status:needs-design`, `status:ready-for-implementation`.

Only assign existing repository labels if verified; do not silently create a new label taxonomy as part of filing.

## Issue templates

All 18 individual drafts are in [`issues/`](issues/). Each includes current behavior, proposed target, evidence/reproduction, acceptance criteria, dependencies, explicit open decisions and preservation gates. A01 is an update proposal for Issue #79, with a full [replacement text draft](ISSUE_79_UPDATE_DRAFT.md); D02 is conditional and should not become a new bug without a fresh reproduction.

## Mappo implementation protocol

Planning discussion and drafts are read-only by default. After issues are approved and filed, any implementation requires separate approval for a scoped branch and engineering plan. No automatic merge after green CI; no automatic release or Pages deploy from merging. Always link full CI evidence and present before/after user experience once implementation is complete.
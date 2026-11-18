# Milestone 3F-C — Identity editing checkpoint QA

Branch: `feature/building-inspector-3f`. Build: `0.1-dev.3fc`.
Status: verified, including the 3F-C browser-interaction stabilization follow-up.

## Behavior

Properties remain the primary selected site. Properties and child buildings each support optional `customName` and `customUse` metadata, independently, without changes to generated usage/type or accepted geometry. The expandable editor provides explicit Apply, Discard draft, preset uses and Other free text. Blank values remove overrides; input is normalized and limited to 80 characters per field.

Identity history is independent, metadata-only, bounded to 20 applied edits, and protected against stale metadata. Contextual Undo respects active tools and native text editing. Per-record pending drafts survive inspection/navigation. Full rebuild/new street seed requires confirmation when identities or drafts would be lost; cancellation and failed generation preserve edits, while successful replacement resets session identity state. No customization is transferred by reused generated IDs.

Accepted fields round-trip through schema-9 project files and recovery storage, with atomic validation. Workspace schema remains 1. Identity history, pending drafts, and property/building selection remain session-only until the separately planned 3F-D review. Drafts must be applied before saving a project copy preserves them.

## Verification

- Local `npm run check`: **202/202 passed** before final warning-copy clarification; CI repeats the complete check on the committed checkpoint.
- Targeted identity workflow checks after that clarification: **8/8 passed**.
- Live Chrome, compiled standalone preview: inspected a courtyard property; verified pending versus applied name/use, independent child building identity, scoped Undo, regeneration confirmation, cancellation and retained parent identity. Screenshot below.
- CI will run the existing 8-case standalone smoke matrix and expanded 8-case property/building/identity matrix, in Chromium and Firefox at 1440×900, 5120×1440, 768×1024 and 390×844.
- Regression coverage includes immutable metadata-only scope; no-op/clear/validation; independent history; existing local district operations; bounded and stale undo; explicit Apply; per-record draft navigation/discard; saved-file round-trip and malformed-file atomic rejection; reset semantics; new-seed deferral and failed-generation retention.

![Applied property identity](../../images/mappo-3fc-property.jpg)

## Limits

Browser viewport tests emulate layout and mouse/keyboard interaction; they do not prove physical touchscreen or screen-reader behavior. No identity-driven building generation, footprint editing, automatic inheritance, simulation or map text labels were added. No main merge, release tag or Pages publication is authorized for this checkpoint.

## Final 3F-C stabilization CI

- Commit [`852e54e`](https://github.com/xbwtyz/Mappo/commit/852e54e4b9fd6e7196b9dda1fbe016afa357a56e) makes project-open success messages durable after immediate browser recovery, including a visible warning on recovery-write failures.
- Responsive Inspector overlays intentionally cover map controls; the browser test now closes the Inspector before exercising contextual toolbar Undo, preserving test coverage without attempting to click through the overlay.
- [GitHub Actions run 44263780267](https://github.com/xbwtyz/Mappo/actions/runs/44263780267) passed **203/203 Node tests**, exact committed root/standalone build verification, **8/8 existing smoke checks** and **8/8 property/building interaction checks** across Chromium and Firefox (desktop, ultrawide, tablet, phone).
- The stabilization commit leaves city schema **9**, UI schema **1**, and the `0.1-dev.3fc` offline standalone distribution compatible. Checkpoint 3F-D builds on this verified baseline.

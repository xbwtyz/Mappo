## Summary and approval boundary

Describe approved scope, desired outcome and PR status. Approval to implement does not authorize merging, releasing or deploying Pages.

## Scope and change review

- [ ] Changes remain within the specifically approved scope.
- [ ] For implementation work, edit modular source rather than hand-editing compiled HTML.
- [ ] For runtime/version changes, ensure `src/core/version.js` and `package.json` agree and that rebuilt `index.html` equals `dist/mappo-<version>.html`.
- [ ] Preserve authored IDs, project integrity, safe loading, portable saves and appropriately scoped Undo/Redo.
- [ ] Update relevant documentation and acceptance records without rewriting historical evidence.

## Verification

- [ ] Report targeted checks and full **Mappo CI / Build, Node tests and browser QA** status for the exact review-ready commit, or explain pending/unrun checks.
- [ ] Link GitHub Actions runs when available; separate automated browser QA from hands-on verification.
- [ ] Give verified test counts, failures/resolutions and measured CI duration when available.
- [ ] Show performance comparisons only if relevant and measured; screenshots are optional unless requested.
- [ ] For runtime changes, verify the offline `file://` build and compiled parity.
- [ ] Maintain currently shipped schema-9 migrations and regression fixtures absent a separately approved data/CI policy change.

## User experience: before and after

Describe changed behavior and practical benefit. If the work is documentation or infrastructure only, say **No user-facing application changes**.

## Risks, limitations and next action

List relevant limitations, links to affected issues and one recommended next action. Merging needs separate explicit approval; a merge does not authorize tagging, publishing a release or deploying Pages. Release and Pages workflows are independent and manual/guarded.

[Agent instructions](../AGENTS.md) · [Development rules](../docs/DEVELOPMENT_RULES.md) · [CI policy](../docs/CI_TEST_POLICY.md)

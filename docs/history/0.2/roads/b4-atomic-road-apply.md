# 0.2B / B4 — Atomic road Apply and Undo/Redo

B4 is the first operation that can accept a road edit. It is scoped to *supported ordinary junction movement* with B1 unambiguous face correspondence and a fully reconciled, validated B2 candidate. B3 remains a non-destructive preview until Apply.

## Acceptance gate
1. User initiates Apply from a settled, eligible preview. Project identity, source fingerprint, preview revision and file revision must all match.
2. Recompute B2 on the current accepted project; reject if its candidate is missing, incomplete or differs from the displayed candidate.
3. Verify exact allowed delta: only the selected junction X/Y, matched block areas, property geometry fields, plot boundaries and open-space areas. All object IDs, metadata, roads, buildings, access, ownership, defenses, water, terrain and unrelated fields must be unchanged.
4. Recheck A1 graph, A2 face coverage and full schema-9 project validity.
5. Perform format-1/schema-9 portable encode/decode; reject altered project or workspace.
6. Exit transient road mode and replace accepted project exactly once. Record one coupled history transaction and call normal `workspaceChanged()` once to advance file revision and recovery scheduling.
7. On any pre-commit validation failure, leave accepted project, revision and history completely unchanged; show the reason.

## History and interactions
- A successful Apply returns to the ordinary City workspace and enables **Undo road**, which restores the entire preceding project (not only the junction), then **Redo road**.
- History is bounded to six coupled project snapshots, session-only, never included in portable/recovery files.
- A later unrelated accepted change invalidates compatibility for old road undo/redo rather than having Undo overwrite unrelated work. Rebuilding or opening a different project clears road history.
- The standard scoped Undo command recognizes a compatible prior road edit outside any competing edit mode. Road history buttons remain available after normal tab navigation.
- Undo/Redo validate and format-roundtrip the complete target before a one-step accepted-state replacement and normal single-revision recovery notification.
- Preview Reset/Cancel and input selection remain entirely non-destructive.

## Explicit limits
- B4 is **not** freeform road movement. Split/merge identity ambiguity, protected or unproven geometry, unresolved building conflicts, and B2-supported-shape limits continue to block Apply.
- No project schema migration, building relocation, road creation/deletion or special-edge editing. Those require later milestones.
- UI eligibility is advisory. Only the fresh B4 application gate is authoritative.

## Verification
- Core tests: stale project/revision/fingerprint, unresolved B2, rejected candidates, accepted-field whitelist, portable round-trip and failure injection.
- Coupled history: all linked entities, Undo/Redo, exact restore, new history invalidates redo, unrelated changes disable stale history.
- UI/integration tests: disabled and eligible Apply, no preview writes, exactly one file revision per accepted transaction, Cancel/Reset and file reopen invalidate stale transactions.
- GitHub CI: full Node suite; Chromium and Firefox at desktop/ultrawide/tablet/phone; `index.html` byte-exact with `dist/mappo-0.2-dev.b4.html`.
- One final B4 commit and one PR. Merge only after green CI and separate owner approval.

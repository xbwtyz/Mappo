# Mappo 0.2.x — Planning Decisions and Open Questions

> **Working log**, updated after the owner approved D-021-1 through D-021-4. **Approved architectural choices do not authorize code, schema, merge or releases; the owner separately approved publishing these planning docs and updating Issue #79.** Unassigned future versions and other design recommendations remain proposals.

| ID | Decision | Current status | Recommended default / next review |
|---|---|---|---|
| DX-001 | Use 0.2.x for current engine limitations, not unrelated feature expansion | **Owner approved** | Keep separate feature roadmap for 3D, civic sites, Minecraft, etc. |
| DX-002 | Issue #79 is the first engine limitation to fix, as v0.2.1 | **Owner approved** | Do not duplicate Issue #79 |
| DX-003 | Group the reviewed 17 limitations into five areas | **Owner approved for planning** | Use 18 candidate issue drafts because E01 splits into two separate domains |
| DX-004 | Create GitHub Issues for each reviewed limitation | **Planning intent; each issue text pending approval** | Review candidate text individually first |
| DX-005 | Create planning docs on a GitHub branch | **Owner approved** | Publish the documentation-only pack on a review branch; do not merge without separate approval |
| D-021-1 | A — Ordinary connected interior terminal stubs arising from supported road deletion only | **Owner approved — A** | Do not expand to all terminal-road operations, disconnected networks, protected road edits or general branching |
| D-021-2 | A — Reserve the dead-end street corridor and setbacks; do **not** grant newly eligible frontage/access | **Owner approved — A** | Maintain existing proven access; any new dead-end frontage/generation is a separately reviewed future scope |
| D-021-3 | A — Only verified generated, untouched development may adapt locally; protect customized and unknown-provenance records | **Owner approved — A** | Unresolvable authored conflicts block Apply with actionable explanation; no automatic custom restructuring or loss |
| D-021-4 | A — One implementation PR containing internal P1–P4 checkpoints | **Owner approved — A** | Branch and implementation still require explicit authorization; pause for separate approval if schema/design expands |
| DB-001 | General property geometry: convex N-gons or simple concave polygons first? | Open | Choose exact subset before B01 engineering |
| DB-002 | Child parcel road frontage and ownership of internal lots | Open | Preserve current direct access rule until a full alternative is validated |
| DA-002 | Should disconnected road networks ever be accepted? | Open | Retain rejection unless compelling user cases |
| DC-001 | Detached building pieces vs separate linked building records | Open | Favor existing independent identities until proven insufficient |
| DD-001 | Unified session history vs persistent edit history | Open | Decide separately; session stack first if pursued |
| DE-001 | Which PNG bounds/resolution should whole-city export use? | Open | Survey bounds with user-selectable output dimensions; verify memory limits |

## Next discussion

D-021-1 through D-021-4 are **settled**. The [Issue #79 replacement](ISSUE_79_UPDATE_DRAFT.md) is approved for posting to the existing issue. Obtain a separate explicit instruction before coding. P1 retains technical investigations into face/corridor representation and deterministic reproducer, **not** a reopening of the four chosen product decisions. Then discuss A03/A06 and B01 issue candidates.
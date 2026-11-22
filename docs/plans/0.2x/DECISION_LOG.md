# Mappo 0.2.x — Planning Decisions and Open Questions

> **Working log, reconciled November 22, 2026.** 0.2.7 B04 is merged after separate approval; 0.2.8 B05 D-028-1–6 architecture and P1–P5 implementation were explicitly owner-approved. [PR #118](https://github.com/xbwtyz/Mappo/pull/118) remains review-only and unmerged. No schema, tag, Release or Pages approval is implied.

| ID | Decision | Current status | Recommended default / next review |
|---|---|---|---|
| DX-001 | Use 0.2.x for current engine limitations, not unrelated feature expansion | **Owner approved** | Keep separate feature roadmap for 3D, civic sites, Minecraft, etc. |
| DX-002 | Issue #79 is the first engine limitation to fix, as v0.2.1 | **Owner approved** | Do not duplicate Issue #79 |
| DX-003 | Group the reviewed 17 limitations into five areas | **Owner approved for planning** | Use 18 candidate issue drafts because E01 splits into two separate domains |
| DX-004 | Create GitHub Issues for each reviewed limitation | **Owner approved; 17 tracking issues #94–#110 published** | Refine scope and acceptance before implementing; #79 updated rather than duplicated |
| DX-005 | Create planning docs on a GitHub branch | **Owner approved publication and merge of PR #93** | Retain version 0.2.0; no application, schema, release or Pages change |
| D-021-1 | A — Ordinary connected interior terminal stubs arising from supported road deletion only | **Owner approved — A** | Do not expand to all terminal-road operations, disconnected networks, protected road edits or general branching |
| D-021-2 | A — Reserve the dead-end street corridor and setbacks; do **not** grant newly eligible frontage/access | **Owner approved — A** | Maintain existing proven access; any new dead-end frontage/generation is a separately reviewed future scope |
| D-021-3 | A — Only verified generated, untouched development may adapt locally; protect customized and unknown-provenance records | **Owner approved — A** | Unresolvable authored conflicts block Apply with actionable explanation; no automatic custom restructuring or loss |
| D-021-4 | A — One implementation PR containing internal P1–P4 checkpoints | **Owner approved — A** | Branch and implementation still require explicit authorization; pause for separate approval if schema/design expands |
| DB-001 | General property geometry: convex N-gons or simple concave polygons first? | Resolved for B01 in 0.2.4 | Supports bounded simple convex/concave parent polygons; individual plot shapes remain convex in schema 9 |
| DB-002 | Child parcel road frontage and ownership of internal lots | Partially resolved for B04, broader access remains open | Internal plots allowed without granting physical road access; direct property frontage and cross-road semantics remain separately constrained |
| D-027-1 | A — Convex individual plots incl. triangles/multi-corner geometry, concave parents allowed | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-027-2 | B — Multiple compatible split/merge operations drafted before one atomic Apply | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-027-3 | A — Straight angled cut segments, no curves or multi-bend polyline cut | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-027-4 | A — User-selected retained plot ID, full source/retirement lineage | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-027-5 | B — Existing buildings unchanged; recompute exact plot membership | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-027-6 | B — Internal plots permitted without newly granted road access | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-027-7 | A — Schema 9 and portable envelope 1 unchanged | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-027-8 | A — Reuse Property Geometry Inspector and map, no separate workspace | **Owner approved, PR #117 merged** | B04 complete and verified on main |
| D-028-1 | Adapt verified generated geometry automatically; consent for authored/unknown sources | **Owner approved; implementation in open PR #118** | Merge and release still require separate approval |
| D-028-2 | Keep, Reshape, Transfer, Retire only where candidate is independently valid | **Owner approved; implementation in open PR #118** | Merge and release still require separate approval |
| D-028-3 | Preserve building, plot, identity and metadata; destructive outcomes require explicit consent | **Owner approved; implementation in open PR #118** | Merge and release still require separate approval |
| D-028-4 | Reuse existing Roads workspace and impact review rather than introducing a new workspace | **Owner approved; implementation in open PR #118** | Merge and release still require separate approval |
| D-028-5 | One atomic accepted Apply and one scoped Undo/Redo transaction | **Owner approved; implementation in open PR #118** | Merge and release still require separate approval |
| D-028-6 | Retain schema 9; separate approval for any change | **Owner approved; implementation in open PR #118** | Merge and release still require separate approval |
| DA-002 | Should disconnected road networks ever be accepted? | Open | Retain rejection unless compelling user cases |
| DC-001 | Detached building pieces vs separate linked building records | Open | Favor existing independent identities until proven insufficient |
| DD-001 | Unified session history vs persistent edit history | Open | Decide separately; session stack first if pursued |
| DE-001 | Which PNG bounds/resolution should whole-city export use? | Open | Survey bounds with user-selectable output dimensions; verify memory limits |

## Next discussion

Review the [B05 PR #118](https://github.com/xbwtyz/Mappo/pull/118) CI and scope, obtain separate owner merge approval, and verify post-merge main CI. Group C C02 ([Issue #105](https://github.com/xbwtyz/Mappo/issues/105)) before C01 ([Issue #104](https://github.com/xbwtyz/Mappo/issues/104)) is the recommended next review sequence; no code is authorized for either.

# Mappo 0.2.6 — B03 Irregular Property Merging

**Status: In progress on feature branch; P1 geometry foundation only.** Implementation authorization granted; **no merge, tag, release, schema change or Pages permission**.

## Owner-approved architecture
D-026-1=A (same-block/district, one shared continuous straight segment including partial edges); D-026-2=A (simple connected convex/concave union, 3–12 vertices); **D-026-3=B (multiple frontage roads)**; D-026-4=A (plots stay unchanged); **D-026-5=B (automatic entrance/building adjustment or relocation when needed, with authorship protections)**; D-026-6=A (primary identity and secondary lineage); D-026-7=A (extend E3, schema 9 if provably safe, five checkpoints, one PR).

## P1–P5 implementation plan and review gates
- [ ] **P1 — Union and multiple-road compatibility**: deterministic graph union supporting partial-edge and concave shapes, area and topology proof, representative mixed-road fixtures; audit all frontage consumers. If schema 9 cannot express multi-road safely, stop and request explicit schema-contract approval.
- [ ] **P2 — Plot and building adaptation**: preserve every plot boundary, ID and compatible metadata; deterministic route/entrance fixes and bounded relocation proposals when needed; keep all building IDs and authored fields, require approval for protected changes; block unsolvable cases.
- [ ] **P3 — Atomic E3 transaction**: primary ID, secondary full lineage, all retained ownership and verified access, protected consent, exact scoped Undo/Redo, independent project and portable save checks, no preview mutation.
- [ ] **P4 — User interface**: extend existing Inspector and map ghost; show relevant roads, unchanged/moved buildings and route effects; expose specific blockers and individual protected-change consent. Keep Reset/Cancel/keyboard functionality.
- [ ] **P5 — CI/build/PR**: focused geometry and integration tests, desktop Firefox/Chromium, same-schema save/reopen, cross-editor regression, full six-runner CI and aggregate gate, byte-identical generated root/dist 0.2.6-dev HTML, one unmerged PR.

## Scope and safety
- Exactly two connected same-block/district properties; no gaps, holes, corner-only links, multi-part or cross-block merge.
- Preserve plot geometry even when a building relocates; no generated plot reconstruction.
- No silent building deletion or regeneration; authorized relocation must preserve the source building record and courtyard geometry.
- Represent one authoritative frontage in schema 9 and derive additional verified frontage exposure, only after downstream validation proves safe.
- Reuse shared polygon, building access/transform and E3 history routines. No global history expansion or automatic schema 10.
- Target desktop/laptop Firefox and Chromium; no routine mobile CI or heavyweight C7 benchmarking.
- Separate owner approval required before merging, releasing, tagging or publishing.

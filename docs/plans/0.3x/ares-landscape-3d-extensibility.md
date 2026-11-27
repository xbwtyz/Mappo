# ARES Discussion 5 — landscape, elevation and future 3D extensibility

Owner explicitly approved LS-01–15 on 2026-11-26 Pacific. Planning only; ARES implementation remains on hold. This supplements the existing [ARES-L01–L10 landscape contract](ares-spatial-constraints.md), [ARES plan](ares-approved-plan.md), UAEF, AP, IS, UX and SAFE-01–15 without weakening or replacing them. Schema 11 and portable/workspace formats 1 remain current. Stage on the planning branch; consolidate at an authorized checkpoint from verified main without replacing newer W4 evidence.

## Approved decisions

| ID | Decision |
| --- | --- |
| LS-01 | Protected landscape authority |
| LS-02 | Cross-engine cooperation |
| LS-03 | Elevation-ready coordinate architecture |
| LS-04 | Interchangeable elevation providers |
| LS-05 | Elevation-aware road constraint interfaces |
| LS-06 | Future grade-separated topology |
| LS-07 | Specialized bridge adapters |
| LS-08 | Future tunnel support |
| LS-09 | Derived 3D building geometry |
| LS-10 | Water elevation extensibility |
| LS-11 | Separate terrain deformation authority |
| LS-12 | Extensible spatial indexing |
| LS-13 | Derived meshes and regional caching |
| LS-14 | Future asset and export integration |
| LS-15 | Separate schema approval |

## Authority and current capabilities

At merged W4 source 0c068b4a42389164618aac8f42e2f018cc9edaed, existing water validators allow one river, one coast, up to eight lakes and eight river bridges, subject to composition, connectivity and crossing rules. Accepted rivers require at least one bridge. Terrain supports six mountain ranges and twelve passes; three stored ridge heights per mountain do not constitute a continuous physical elevation surface. Canonical building regions/components/courtyards are Schema 10 geometry; Schema 11 adds identity allocation rather than general Z geometry. Consult docs/reference/TERRAIN.md and existing water, terrain, schema and identity modules for authoritative current semantics.

Protect landscape geometry and existing crossings/anchors during ordinary road edits. UAEF mediates explicitly authorized cross-engine proposals, not accepted mutations or automatic permission escalation. Preserve exact selected intent or refuse; neighboring alternatives must remain within authorized scope. Future terrain deformation requires separate authority, independent verification and atomic review/Apply/Undo/Redo.

## Extensibility direction

Retain existing X/Y coordinates and prepare optional elevation-aware interfaces with explicit units, coordinate frames, datum and capability flags. Missing elevation is unknown, not zero. Design interchangeable read-only elevation providers for future heightfields, procedural surfaces or imported sources. Prepare interfaces for gradient, clearance, vertical curvature, cut/fill, embankments and retaining walls without implementing these features now.

Continue enforcing existing planar road topology. Future grade-separated crossings must distinguish geometric overlap from graph connectivity and require separate topology/schema design. Bridge adapters reuse current crossing validators; tunnels, viaducts and underground constraints are future capabilities, not permission to bypass current water/terrain restrictions. Prepare optional future water levels, river gradients and waterfalls without changing current water semantics.

Derive eventual 3D building geometry from authoritative regions, components and courtyards. Keep one authoritative accepted city, with 2D and future 3D views derived from it; any future 3D authoring must use the same verified transaction authority. Prepare extensible spatial query interfaces and future regional cache invalidation; derived meshes are disposable, not a second persisted city. Stable typed references and explicit coordinate conventions prepare future asset/export adapters. Actual meshing, 3D editor, exporters, imported assets, continuous terrain, tunnels, grade-separated topology and landscape authoring are out of ARES scope. No new persistent elevation fields, runtime plugins, external asset execution or schema changes without separate approval.

## Qualification

Integrate the approved direction into existing P1–P9 and ARES-L01–L10 without adding speculative runtime subsystems. P1–P2 establish explicit capabilities and provider/evidence contracts using real supported models. Subsequent phases preserve landscape constraints during search, topology and ownership reconciliation. P7–P8 verify cross-provider coordination, stale invalidation after landscape edits, and honest unsupported-capability diagnostics. P9 includes mixed supported landscapes, protected bridges/passes and defenses, no accidental crossings, no unauthorized landscape mutations and a detached synthetic vertical constraint registerable without rewriting coordinator/search core. Synthetic vertical fixtures do not count as live 3D support or inflate recovery rates. Preserve existing regression coverage, minimum 10,000-scenario qualification, recovery thresholds, exact-head/main CI and owner acceptance. Concrete elevation surface algorithms, topology representation, cache policies and future export formats remain separate design decisions.

## Approval boundary

No runtime implementation, new permissions, schema, CI policy, release, tagging or deployment authorization. Complete Discussion 6, consolidate approved planning documents against verified main, and obtain renewed explicit implementation approval before beginning ARES. W4 is merged and exact-main CI run 45945892157 passed 22/22 mandatory jobs at 0c068b4a42389164618aac8f42e2f018cc9edaed; this is historical qualification evidence, not ARES implementation authority.

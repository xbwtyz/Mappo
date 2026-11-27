# ARES Discussion 2 — adaptation permissions and preservation priorities
Owner explicitly approved AP-01–12 on 2026-11-26 Pacific. Planning only. ARES implementation hold remains; no new runtime permissions, schema change, merge or publishing authorization. Supplements the [ARES plan](ares-approved-plan.md), [UAEF architecture](uaef-approved-architecture.md) and [landscape constraints](ares-spatial-constraints.md). Existing SAFE-01–15 remain binding.

## Approved decisions
| ID | Decision |
| --- | --- |
| AP-01 | Strict, Adaptive and Restructure modes |
| AP-02 | Adaptive default editing mode |
| AP-03 | Dynamic, obstruction-driven expansion |
| AP-04 | User-configurable bounded adaptation scope |
| AP-05 | Typed preservation priority hierarchy |
| AP-06 | Authored content protected unless explicitly authorized |
| AP-07 | Prepare architecture for object locking now; implement separately |
| AP-08 | Prioritize preserving major roads |
| AP-09 | Extensible preservation preference profiles |
| AP-10 | Explicit permission only for destructive escalation |
| AP-11 | Preserve original neighborhood character where feasible |
| AP-12 | Exact requested position or clear refusal |

## Mode and authority contract
Strict retains the existing topology-preserving path and historical regression expectations. Adaptive permits bounded neighboring road geometry adjustment and dependency-driven scope expansion in accordance with visible mode authority, without new intersections or road removal. Restructure can consider intersection creation, splits/merges and block restructuring; consequential road removal and destruction still require separately explicit permissions. Adaptive is the intended default when ARES is activated, not a change to current live defaults. Make its authority visible; do not infer authority to change protected infrastructure, authored content, locks, water/terrain, or to demolish, regenerate, change frontage or scale beyond the existing explicit permissions. Mode choice cannot silently grant unrelated concessions. Retain existing defaults-off for separate concessions, exact Review/Apply and atomic history. No automatic transition to a more permissive mode after refusal. Any authored-content override or protected infrastructure editing mechanism not already supported requires a separate approved policy/interface; this approval does not activate such a mechanism.

## Scope and preservation
Start with the exact selected road intent and its swept/final clearance/dependencies. Expand only along verified obstructions or dependencies within a user-selected maximum scope and engine safety/work/affected-object limits. Distinguish observable from writable scope; reading or discovering a blocker does not authorize changing it. Define concrete scope units, defaults, bounds and user controls during detailed P2/P8 design; do not invent a fixed radius or permit unbounded citywide mutations. Report scope-limited refusal and preserve external anchors and unaffected records.

Hard requirements take precedence over all ranking: valid geometry/domain rules, explicit permissions, protected/locked content and exact selected positions must simultaneously hold. If conflicting, refuse rather than sacrifice either. Within eligible verified alternatives, typed priorities favor preserving protected infrastructure and authored content (hard protection where applicable), major roads over minor roads/alleys, and minimize disruption of generated properties/plots/buildings. The approved hierarchy is a preservation direction, not permission to retire lower-priority objects. Use existing authoritative road classifications and provenance where available; unknown classification or authorship must not silently lower protection. If data needed for a feature is unavailable, document the limitation and seek separate schema/policy approval if needed.

Design typed protection flags/capabilities for future independent position, dimensions, demolition and identity/metadata locks. No persistent lock fields, locking UI or new lock editing in ARES without a separately approved feature/schema decision. Existing protection remains enforceable.

## Ranking and reconstruction
Expose an extensible deterministic preference-profile contract so verified candidates may favor street layout, buildings, property boundaries, least total change or usable development space. Safety and authority are hard gates before scoring; retain a verified incumbent, stable tie-breaks and independently computed consequence evidence. Specific scoring weights, profile defaults and multiple-solution UI are deferred to remaining discussions and detailed qualification. Preserve original neighborhood character where feasible under explicit regeneration authority, using available compatible original morphology, density, frontage, use, scale and metadata; never invent authored metadata or guarantee identical replacements. Restored original IDs and regenerated new IDs remain distinguishable. Reconstruction does not expand demolition or regeneration permission, and must not compromise geometry, ownership, identity allocation or exact intent. Unsupported character attributes remain future capabilities, not claimed current behavior.

## Phase integration and tests
P1 structured mode/permission/scope/lock diagnostics and typed contracts. P2 bounded dependency expansion and outside-scope protection evidence. P3 deterministic eligible-candidate ranking/profile seam and research; no unapproved score/permission policy. P4 neighbor geometry respects mode, hierarchy and exact selected positions. P5 separately authorized topology operations with protected anchors and identity lineage. P6 ownership and character-preserving reconstruction under explicit authority. P7 coordinator integrates modes, scope, protection and profiles without escalation. P8 visible Adaptive default, user scope control, explicit consequential permissions, actionable refusal and exact review; accessible controls. P9 include independently feasible cases and negative controls for each mode, scope boundaries and widening, major/minor streets, authored/unknown provenance, protected landscape and hypothetical detached future lock constraints, exact requested positions, stable profile rankings, preservation of character where measurable, stale review and undo/redo/save. Existing strict locked results, qualification targets and complete CI remain mandatory. Future lock persistence and authored/protected override remain separate approvals. No implementation until the renewed ARES go-ahead.

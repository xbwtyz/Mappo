# Mappo 0.2F — Advanced 2D Building Design

> **Status (2026-11-20): revised design proposed for owner review.** Prerequisite 0.2E E1–E5 is **merged** into `main` through [PR #66](https://github.com/xbwtyz/Mappo/pull/66). This document is a **design proposal**, not authorization to implement, merge, release, migrate schema or publish. The stable release remains `0.1.0`; the current development build is `0.2-dev.e5`.
>
> **Authority:** [0.2 master roadmap](README.md) · [0.2E integration acceptance](E5_ACCEPTANCE_REPORT.md) · [developer guide](../../development.md). Review this proposal and choose the explicit design defaults below **before starting F1 code**.

**Implementation update:** F1 pure footprint primitives and focused acceptance are proposed on a separate implementation PR (pending final CI and separate merge permission). See [F1 footprint acceptance](F1_FOOTPRINT_ACCEPTANCE.md). F2 direct editor tools are not implemented by F1.

## 1. Product goal and boundaries

Make Mappo an intentional **2D building-footprint designer**: select an existing building, add/remove or move exterior vertices, shape connected wings, and define rectangular or editable courtyard voids; see the changed footprint and constraints immediately; accept one validated, reversible edit. Allow clear building-use choices **without replacing geometry or overwriting customized identity**. Work with buildings on E1-created, E2-split, E3-merged and E4-redivided properties.

**Normal interaction:** select a building in the existing property-first Inspector or map → **Edit building** → choose **Shape**, **Vertices**, **Edges**, or **Courtyard** within that existing editor → adjust with direct mouse/touch handles or numeric fields → inspect in-place feedback → **Apply**, **Reset** or **Cancel**. No second building editor, automatic replacement of the footprint, modal workflow, forced tutorials, wizard or new project-format requirement.

**Initial F scope:** two-dimensional footprints and open-air courtyards only. Exterior polygon geometry may be concave if simple, positive-area, non-self-intersecting and representable by the existing `footprint` plus `holes` data. A connected wing becomes part of **one** building's outer ring, not a separate child building. Standalone detached wings, roof meshes/floors/interiors, height, 3D, arbitrary self-crossing polygons, boolean polygon unions and automatic relocation of unrelated objects are out of scope.

## 2. What already exists: specific reuse contract

| Existing implementation | Already implemented | F responsibility / important caution |
| --- | --- | --- |
| `src/editor/building.js` | `BuildingEditSession`: select, focus, move, rotate, resize, draft gestures, reset | **Extend this one session** with geometric draft operations; preserve existing transformation shortcuts and selection behavior |
| `src/core/building-transform.js` | `previewBuildingGeometry` transforms **all** footprint and hole vertices, recalculates area and orientation | Reuse move/rotation/scale on edited geometry; do not add duplicate transform engine |
| `src/editor/building-structures.js` | `BUILDING_PRESETS_3H`: rectangle, L, T, courtyard; `BUILDING_TYPES_3H`: house, shop, workshop, inn, warehouse, guildhall, temple; placement and replacement workflow | F1 should deliver new **control and shape vocabulary**, not duplicate the four existing presets; **existing replacement spec falls back to rectangle** when `source.shape` is unfamiliar—custom geometry must not be silently replaced |
| `src/core/building-validation.js` | `shapeWellFormed`, `shapeContained`, `shapesOverlapInterior`, `inspectBuildingGeometry`, with courtyard and neighbor validation | Extend the **shared** validation path for direct edits, hole boundary/collision and geometric degeneracy; no parallel validators |
| `src/editor/building-application.js` | `deriveOccupiedPlots`, `reattachFrontage`, `prepareBuildingCandidate`, full-project schema-9 and portable round-trip acceptance | Reuse actual footprint-minus-holes plot occupancy; never infer membership from centroid or just the original plot |
| `src/editor/building-history.js` | `BuildingGeometryHistory` captures footprint, holes, area, orientation, plot IDs, door and access path | Reuse session-scoped accepted geometry Undo/Redo; one edit should enter exactly one entry |
| `src/editor/building-structure-history.js` | Separate property-scoped history of add/replace/delete | F must not introduce a third history stack or falsely promise globally interleaved Undo |
| `src/data/project-validation.js` | Building `shape`, `type`, `footprint`, `holes`, frontage and plot-ID validation; schema 9 | Keep schema 9 and format 1; preserve unknown safe metadata and existing `shape`/use values |
| 0.2C–E | Road-first neighborhood adaptation; E1–E4 property and plot identity operations; E5 integrated acceptance | Prove edited buildings survive subsequent permissible land/road changes or expose precise blockers; never quietly regenerate authored geometry |

**Preservation policy:** A change to a building's **use** is not permission to change its footprint; a change to its **footprint** is not permission to rewrite its `id`, `propertyId`, `name/customName`, `customUse`, original `shape`, `type`, unknown safe fields, or unrelated buildings. If a legacy value cannot be represented in a new control, show **Custom / unchanged** and preserve it rather than coercing it to the default. Do not reinterpret `shape` as authoritative evidence of actual polygon geometry for manually edited footprints.

## 3. Proposed interaction and geometry rules (review defaults)

1. **Edit in place; no hidden draft mutation.** One selected building per geometry session. An exterior/hole vertex drag changes a local copy only. Debounced or throttled *read-only* preview checks may run during gestures; expensive whole-project checks run after the gesture and immediately before Apply. Apply must recheck accepted revision/identity.
2. **Vertex operations:** move a vertex, insert a vertex on a chosen straight edge, delete a vertex while retaining >=3 exterior vertices and at least three vertices in each hole, all with keyboard/touch equivalents. Reject zero-length edges, self-crossings, invalid winding, overlapping holes, and detached/too-thin regions. The first F2 release uses **one topological change (insert/delete vertex or hole add/remove) per Apply** to simplify identity and history; unlimited coordinate movements within that draft are allowed.
3. **Wing authoring:** offer a constrained **connected rectangular wing** that attaches along a chosen exterior edge and produces **one validated outer ring** (no overlap or disconnected component). Preview the resulting outline and show blockers; do not auto-destroy an existing custom façade or unknown annotation. Width/depth adjustment uses existing numeric precision and map handles.
4. **Courtyard authoring:** extend the existing `holes` array. Initially add/remove or reposition/resize **one rectangular hole** entirely inside a valid footprint; keep existing arbitrary compatible holes unchanged. Hole vertex-edit operations follow the same shared validator; do not invent nested holes/islands or an untested boolean solver. A courtyard reduces occupied area; membership and access must reflect the cutout.
5. **Meaningful feedback:** show live footprint area, hole area, net occupied area, property/plot membership, entrance and frontage path impact, and specific locatable blockers. Preview is *not* Apply-ready if the entrance/access cannot be reconciled. Keep building ID and authored metadata visible.
6. **Door and access:** preserve the current entrance where it remains on a valid exterior wall with a verified route. Otherwise offer a **previewed reattach** using `reattachFrontage`; if none is valid, block Apply and show why. No silent door relocation or access route through an occupied footprint, courtyard, neighboring building or protected property.
7. **Property and neighbor safety:** all geometry must remain within its accepted property, respect existing collision/setback/access validation and recompute `plotIds` against actual footprint minus holes. No automatic property reshaping or building relocation; a multi-plot building remains legal when membership is proven.
8. **Transactional behavior:** Apply one cloned whole-project candidate, independent schema-9 validator and portable encode/decode comparison, one revision/history entry, and exact scoped Undo/Redo. Reset, cancel, invalid gesture, stale revision and selection changes make **zero** accepted changes. Loading/regeneration clears incompatible session histories and previews.
9. **Keyboard/mobile:** sizable pointer targets, accessible selection, Escape to cancel an in-progress gesture, focus restored to the proper editor control, numeric edit parity and no overlapping drawers/hidden Apply button at phone viewport. No mandatory user interactions beyond ordinary editing choices.

## 4. Implementation plan: four cycles, separately accepted

### F1 — Footprint primitives and additive shapes

**Goal:** provide geometric operations *without* duplicating four existing 3H presets.

- [ ] Map and document source-of-truth fields for existing geometry and shape labels; decide whether a custom-edited shape keeps the prior label or adopts an explicit **custom** marker, ensuring old saves and renderer remain compatible.
- [ ] Implement pure, testable shape operations: edge vertex insertion, deletion, constrained rectangular edge-attached wing, and rectangular courtyard creation on a cloned footprint. Reuse positive-winding and overlap checks; no new persisted wing-object model.
- [ ] Add **one or two** clearly differentiated useful examples (e.g. U-shaped outline and an adjustable wing), rather than accumulating near-duplicate presets. Make all existing four presets render identically before/after.
- [ ] Prove the resulting shape remains editable by `previewBuildingGeometry`, survives full validation and schema-9 portable saves; unknown shape/type labels are preserved.
- [ ] **Gate:** deterministic Node tests for shape primitives, concave-but-simple geometry, winding, area/hole calculation, symmetry, zero-area/slivers, overlap, legacy buildings, and no source mutation.

**Implementation scope:** core pure geometry helper(s) plus a narrow extension of the existing building editor and renderer. No F1 structural migration or broad UI redesign.

### F2 — Direct vertex, edge, wing and courtyard editing

**Goal:** an actual user-visible geometry editor, not just extra presets.

- [ ] Add vertex and edge handles to **existing** `BuildingEditSession`; support mouse/touch, insert/move/delete, precise numeric adjustments, keyboard focus and reset, while preserving move/rotate/resize modes.
- [ ] Add connected-wing and courtyard controls using F1 primitives; display consequences and blockers in the current Inspector; allow one topological change per Apply initially.
- [ ] Extend shared `inspectBuildingGeometry` and `prepareBuildingCandidate` to accept an optional **draft footprint + holes** without fabricating a second source of accepted geometry; preserve existing transform callers.
- [ ] Recalculate net area, plot membership, entrance/access and any dependent roof footprint when actually represented by existing data. If the current roof is rendered directly from `footprint`, do not invent independent roof geometry.
- [ ] Ensure **custom vertices are never reduced to a rectangle** by selecting Replace or changing a preset. Require a deliberate, explicit **Replace geometry** action with a visual before/after preview before any destructive preset substitution.
- [ ] **Gate:** real Chromium and Firefox desktop/phone editing; vertex drag, tap targets, holes, wing placement, stale drafts, invalid crossings, Undo/Redo, no pointer interception, and full save/reopen. Negative cases must leave accepted bytes unchanged.

### F3 — Functional uses and classification

**Goal:** make building use clear and extensible, without rewriting building identity or geometry.

- [ ] Audit the current `type` field, `customUse`, and seven existing `BUILDING_TYPES_3H` choices. Prefer **reusing `type`** as the functional category and `customUse` as human-authored descriptive text rather than introducing a competing `category` property.
- [ ] Initial type list remains the seven existing values; offer **Custom / keep existing** for unknown generated/legacy values. Only expand the vocabulary where renderer, save validation, Inspector and generation can remain compatible.
- [ ] Make changing functional type a **metadata-only accepted edit** with distinct confirmation/Undo policy from geometry history; no footprint regeneration, orientation changes, hidden preset switch, or building ID reassignment.
- [ ] Preserve `customName`, `customUse`, original description and unknown safe fields; distinguish user-facing type, custom description and procedural shape label.
- [ ] **Gate:** classifications on existing, generated, newly drawn, replaced and unknown legacy buildings; exact metadata save/reopen; category-only changes leave every footprint, hole, entrance, plot ID and road reference byte-equivalent.

### F4 — Cross-editor acceptance, performance and release readiness

**Goal:** close 0.2F without expanding it into 0.2H release hardening.

- [ ] Test new geometry on **E1-created, E2-split, E3-merged, and E4-redivided** properties, legal buildings spanning multiple plots, and road-edit reflow conflicts. Protect customized/unknown fields.
- [ ] Test a sequence: create/replace building → direct vertex/wing/hole edit → category-only change → scoped geometry Undo/Redo → portable save/reopen; verify that incompatible interleaved histories are deliberately blocked instead of silently applied.
- [ ] Full Node regression and existing Playwright suites in **Chromium and Firefox**, 1440×900 desktop and 390×844 phone/touch; no forced clicks, blocked drawers, hidden controls or browser errors.
- [ ] Bench Small and Large cities: preview/gesture response, independent validation, Apply and Undo/Redo on the same GitHub runner with repeatable fixtures; record p50/p95 and **compare like for like** with pre-F if suitable baseline exists. Track large-city issue [#44](https://github.com/xbwtyz/Mappo/issues/44) separately; do not make unsupported speedup claims.
- [ ] Compile `dist/mappo-0.2-dev.f4.html` and root `index.html` as **byte-identical offline outputs**. Confirm schema 9 and format 1, old-file compatibility, documentation, limitations and zero temporary workflows.
- [ ] Publish an F4 acceptance report with CI links, precise feature coverage, negative tests and unresolved limitations. **Do not merge, tag or publish without separate approval**.

## 5. Architecture and compatibility gates

- **Reuse first:** `src/editor/building.js` and current 3G/3H workflows are the primary editor. Add narrowly scoped pure geometry helpers under `src/core` if needed; extend shared validator/Apply and existing map/Inspector binding. One source of truth for coordinates and a single compiled HTML app.
- **No schema-10 assumption:** current project schema **9**, portable format 1; existing `footprint`, `holes`, `shape`, `type`, `plotIds`, `entrance`, `accessPath` are the baseline. Any unavoidable new required field needs a separate documented migration decision **before implementation**.
- **No loss of authorship:** preserve building identity and unknown fields, prohibit implicit custom-shape replacement, make door/route changes visible, and never silently move neighbors, roads, lots or district infrastructure.
- **No new global history promise:** use the existing geometry-history and structural-history owners, and define how metadata-only changes interact; block incompatible cross-editor replay.
- **Version and merge:** plan F1–F4 as reviewable sequential cycles on fresh branches from updated `main`, each with tests, compiled standalone and PR; seek explicit approval before each merge. Design approval alone does not approve implementation or merging.
- **No mandatory onboarding or owner testing:** replace weak UI flows with ordinary in-app explanations and automated tests. Optional manual visual checks are informative, not required to accept a passing build.
- **Release sequencing:** F completion is **not** Mappo 0.2. Optional civic editing (0.2G) and release hardening (0.2H) remain independently decided. 3D, Minecraft export and any new renderer are deferred.

## 6. Decisions to approve before F1 implementation

| Decision | Recommended default | Reason |
| --- | --- | --- |
| Shape model | Keep one exterior polygon plus `holes`, schema 9 | Already supported and independently validated |
| F1 vocabulary | Add a connected rectangular wing, adjustable rectangular courtyard and useful U example | Differentiates F from existing rectangle/L/T/courtyard presets |
| F2 first direct edits | Move/insert/delete vertices, one topology change per Apply, numeric/keyboard and touch | Coherent atomic history with manageable acceptance tests |
| Custom geometry and Replace | Preserve custom shape; explicit destructive replacement preview only | Current 3H fallback to rectangle makes accidental loss possible |
| Entrance/access | Keep if valid, otherwise show proposed reattach or block; never silently reroute | Protects trusted frontage and user-defined entries |
| Use/category | Reuse `type` and `customUse`; don't add competing `category` field | Retains compatibility and minimizes redundancy |
| History | Existing scoped geometry/structure history; category-only metadata policy separately specified | No misleading universal Undo claim |
| Cycle order | F1 primitives → F2 direct UI → F3 type editing → F4 integration | Each cycle adds one clear capability, supported by previous gates |

**Approval boundary:** This document may be reviewed and merged as planning-only documentation. Implement F1 only after the owner explicitly approves the decisions and authorizes a separate implementation branch; require independent authorization for later PR merges.

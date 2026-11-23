# Mappo project persistence contract

## Independent versions

`src/core/version.js` owns the app and project-data schema versions. The standalone builder checks the app version against `package.json`, fills the HTML version placeholders and derives the distribution filename. Save-container versions and migration rules live in `src/data/migrations.js`.

The published **v0.2.0** build uses container format **1**, project-data schema **9** and workspace schema **1**. These are independent of the original generator version. The `0.1-dev.ui7d` Phase 7 build cited in historical sections was an earlier snapshot.

A native file ends in `.mappo.json` and is UTF-8 JSON with this envelope:

```json
{
  "format": "mappo-project",
  "formatVersion": 1,
  "documentId": "persistent-document-identity",
  "createdAt": "2026-11-17T09:00:00.000Z",
  "savedAt": "2026-11-17T09:00:00.000Z",
  "appVersion": "0.2.0",
  "project": {},
  "workspace": {},
  "extensions": {}
}
```

The empty objects illustrate envelope locations; they are not a valid complete city. A file requires the structures described below.

## Authoritative city data

`project` stores the complete model: accepted outline, settings, survey metadata, street nodes, roads, block polygons, civic square, base plots, properties, buildings, courtyard holes, access metadata, open space, districts, walls, gates, towers, water features, bridges and reserved water faces. IDs and references are saved directly. Loading never calls the procedural generator or infers buildings from a seed.

C4 stores accepted street bends as ordinary nodes and roads in project schema 9. Newly inserted bend nodes use the reserved `N-BEND-` ID prefix. The editor treats them as movable handles while exactly two ordinary segments of the same class meet there. Other junctions end the editable path. Coordinates, road references and building changes remain authoritative in the saved city. Pending bend positions and snapping are session state.


Names, notes and unknown JSON fields on records are retained. `project.generatorVersion` describes the original generator; loading and exporting does not rewrite it to the current app version.

Schemas 2–9 share these geometry contracts: polygon coordinates are ordinary finite JSON numbers. Polygons use a counterclockwise outer boundary. Building holes are separate counterclockwise polygons inside the footprint. Base plots are convex; properties and building footprints may be concave. A property’s plots partition its area. Buildings reference only the plots their actual footprint occupies. Attached rows may share walls, with no positive-area footprint overlap.

The current reader additionally validates fortification clearance, gate connectivity, tower placement and defense history, plus district coverage, connected membership, block inheritance, names/colors and saved district undo history. It validates structure, unique IDs, references, street planarity/connectivity, block coverage, street-width setbacks, polygon containment, plot ownership/area, roof geometry and rendering fields. It rejects incomplete or inconsistent core geometry before changing the open city.

## Workspace and unfinished edits

`workspace` stores:

- `schemaVersion: 1`.
- `editor`: draft boundary, draft center, closed/dirty state, editing mode, error flag and up to 40 undo snapshots.
- `controls`: draft seed, density, street pattern and selected starting outline.
- `view`: camera position/zoom and layer visibility.

An unfinished or crossed draft can be saved. It is separate from the validated generated city, so it can be reopened for correction. An active freehand gesture reopens as a point-editable draft rather than resuming pointer capture. Only known editor data is restored into the editor instance; imported history cannot replace callbacks or methods.

The optional `workspace.districtEditor` stores selected district/block IDs, pending district controls and up to 20 district undo snapshots. History snapshots store district records and their block memberships; membership on properties and buildings is derived when undo is applied. Undoing a first district generation can restore a migrated unassigned city, including opaque older district annotations.

District layer flags are additive optional fields in workspace schema 1. Older files without them display their original map until the user turns layers on. New native cities default to district colors, borders and labels enabled.

The optional `workspace.fortificationEditor` stores up to 10 snapshots of walls, gates, towers and fortification state, plus pending controls. Restoring an undo snapshot validates its defenses against the current unchanged city before applying it. The optional `workspace.view.layers.fortifications` flag controls display separately from the model enable flag. Optional `workspace.panels` stores boolean `districts` and `fortifications` open states, plus optional boolean `water`. These additive fields retain workspace schema 1.

The optional `workspace.waterEditor` stores a versioned water definition, pending water seed/width controls, selection, editing mode, dirty flag and up to 20 previous definitions. Draft river geometry and crossings may be unsuitable for generation; structural limits and finite coordinates are still required. A draft is never substituted for accepted city data on load. Water undo restores a draft, even after city regeneration; Generate city is required to apply that draft.

Viewport dimensions and active pointer capture are transient. New native saves restore camera coordinates and zoom; migrated raw projects initially fit the current viewport.

## Forward evolution

Unknown envelope, record, extension and workspace fields are preserved as JSON. Reserved district/wall records are retained even before the current renderer understands their presentation. References to district IDs, when present, must resolve.

**Current release behavior:** v0.2.0 migrates historical project schemas **1–8** into schema 9. The owner has turned **mandatory compatibility with every old save OFF for future releases**. That does not remove current migrations, fixtures or tests. A future breaking change needs separate approval of supported versions, safe rejection/backup guidance, validation and CI changes; see [Development Rules](../contributing/development-rules.md).

Future developers should:
1. Preserve compatible unknown fields during supported saves and loads.
2. Increment the relevant schema/format when an approved incompatible representation changes.
3. Provide pure, tested migrations **for the older schemas the new release chooses to support**, not necessarily every historical version.
4. Never regenerate an imported authored city as an unapproved migration shortcut.
5. Retain frozen fixtures under the archive policy; review any proposed test-policy changes separately.
6. Extend validators and safe rejection for the new supported contract, including clear upgrade/backup instructions.

A newer unsupported container, project schema or workspace schema is rejected with a compatible-build message. The reader does not guess how to downgrade it. Compatible unknown fields are preserved; arbitrary future formats are not promised to be readable by old apps.

Raw schema-1 projects captured from the released 3A.2 and 3B builds are supported. The first migration adds missing empty property/plot/open-space collections where appropriate and advances schema 1 to 2; the district migration advances it to schema 3, the fortification migration advances it to schema 4, the water migration advances it to schema 5, the coast compatibility migration advances it to schema 6, then the composition migration advances it to schema 7. It preserves original geometry, IDs and generator metadata. Those earlier HTML builds did not have a save button; raw JSON compatibility supports existing model snapshots.

## District schema 3

`city.districtState` has `version: 1` and `status: "assigned"` or `"unassigned"`. Assigned cities contain neighborhood records with stable `id`, `dataVersion: 1`, `kind: "neighborhood"`, `name`, six-digit hex `color`, `blockIds` and an optional JSON `extensions` object. Generator metadata records the district seed, algorithm and requested/actual count.

Each block belongs to exactly one assigned district. A district contains unique blocks connected by shared street edges; sharing only a junction does not count. Properties and buildings carry the same `districtId` as their containing block. Borders, label placement and inspector counts are derived from blocks rather than duplicated as authoritative geometry.

Migration from project schema 2 adds an **unassigned** district state and preserves all existing geometry and annotations. Old opaque district records and membership fields are retained without activating an inferred layout. Generating districts is explicit for an imported old project. The migration does not call a generator. The older schema-1 migration runs before this migration when needed.

Current assigned district records are validated strictly. Unknown compatible extension fields survive rename/recolor and block reassignment. Incompatible district kinds or data versions require an updated reader. `tests/fixtures/save-3b1-format1-schema2.json` is a frozen native file captured from the released 3B.1 HTML and is tested for geometry-preserving migration.

## Fortification schema 4

`city.fortificationState` has `version: 1`, `status: "unbuilt" | "built"` and boolean `enabled`. Built state records algorithm, independent seed, requested/actual gate counts, tower spacing and clearance. The current builder is `outer-perimeter-v1`.

- `city.walls`: one built perimeter record with stable ID, `dataVersion: 1`, `kind: "perimeter"`, a counterclockwise simple closed `path` (without a repeated closing point), stroke `width`, `edgeWidth` and extensions.
- `city.gates`: `dataVersion: 1`, `kind: "street-gate"`, stable ID, `wallId`, arc distance along the closed wall, opening width, post radius and saved center. `connection` stores the real `cityNodeId`, approach width and ordered points from that junction through the opening to the exterior.
- `city.towers`: `dataVersion: 1`, `kind: "round"`, stable ID, `wallId`, arc distance, saved center, radius and corner/interval role.

Geometry is authoritative. Openings, posts and solid wall sections are derived from the saved wall and gate arc locations; load never rebuilds defenses from settings. Wall centerlines enclose the city with at least 16 survey units of boundary clearance. Validation checks rendered widths, street clearance, actual gate exits, unobstructed gate corridors, anchored towers and overlap. Gate approaches remain separate from the original road graph and reference real junctions explicitly.

Disabling preserves records and metadata; hiding changes only the workspace layer. Re-enabling with unchanged settings retains the same records. Explicit rebuilding replaces defense records while leaving city geometry and districts intact. Compatible unknown fields survive save/load, toggling and undo; rebuilding does not promise to map old per-record annotations onto newly generated defenses.

Migration from schema 3 adds missing gate/tower collections and an **unbuilt, disabled** state. Existing wall annotations, city geometry, IDs, district membership and generator metadata are retained. No defense or city generator runs during migration. Opaque inactive legacy records remain available until an explicit build replaces them. `tests/fixtures/save-3c-format1-schema3.json` is a frozen native project captured from the released 3C HTML.

Built records have strict kind/version checks; unsupported future forms require a compatible reader. See [`FORTIFICATIONS.md`](./FORTIFICATIONS.md) before extending representation or adding generators.

## Water schema 5

`city.waterState` records `version: 1`, `status: "dry" | "river"`, independent `seed` and `algorithm: "ribbon-v1"`. Schema-5 records support zero or one river; the schema-6 extension also accepts one coast.

| Collection | Authoritative content |
| --- | --- |
| `city.waterFeatures` | Stable ID, `dataVersion: 1`, `kind: "river"`, ordered `path`, constant cross-stream `width`, saved water `polygon`, reserved bank `corridor`, extensions |
| `city.bridges` | Stable ID, `dataVersion: 1`, `kind: "bridge"`, `waterId`, normalized source-to-mouth coordinate `t`, deck `width: 9`, extensions |
| `city.waterFaces` | Stable ID, `waterId`, shared node `vertices` and area; wet faces partition the reserved corridor inside the city |

The river ribbon has a constant width along the lateral axis perpendicular to its source-to-mouth frame. A 9-unit lateral bank reserve places waterfront road centerlines beyond the actual water. River control points progress monotonically along the frame, with bounded adjacent slopes to keep banks usable. Endpoints lie outside the city; the accepted corridor cannot intersect the square.

Street arrangement construction includes the banks and bridge approach lines before extracting faces. Blocks and square cover land; water faces cover the remaining corridor. Together they cover the entire original boundary exactly. The old face/road shared-node, planarity and positive-area contracts continue to apply. Water faces are excluded from building population and district membership.

`road.bank` marks waterfront streets. `road.waterBoundary` marks virtual arrangement edges on the outer city boundary across water; these close water faces and are excluded from rendering and traversable-street connectivity. `road.bridgeId` links actual water-crossing road segments to a bridge. A bridge creates a normal crossing of the local river segment, with straight primary approaches clipped against the city and plaza. Every bank must connect through real streets and accepted bridges, without relying on virtual water-boundary edges.

Walls optionally store `waterOpenings: [{start, end, waterId}]`, measured along their closed perimeter. These independently validated openings remove solid sections where the river and its safety buffer meet the wall. Street gates and towers must clear them. Compatible additional fields on opening records are retained.

All river polygons, node/road/face geometry and bridge definitions are saved directly. Validation checks their agreement without replacing them. River/bridge geometry is never regenerated during file loading. Editing the draft or rerolling water does not mutate accepted city data. Applying water explicitly regenerates streets, population, districts and enabled defenses.

Migration from schema 4 adds empty water/bridge/face collections and a dry state, retaining all existing city, district and defense geometry and metadata. The frozen native fixture `tests/fixtures/save-3d-format1-schema4.json` was captured from the released 3D standalone HTML. Older schemas run the earlier migrations first. Unknown compatible fields are preserved; unsupported water/bridge kinds or versions require a compatible reader.

## Coast schema 6

A coastal city uses `city.waterState: {version: 1, status: "coast", seed, algorithm: "shore-v1"}`. The existing collection accepts a single `kind: "coast"` feature with `dataVersion: 1`, stable ID, ordered `path`, `waterSide: "left" | "right"`, finite `seaDepth` of 100–20,000 units, saved ocean `polygon`, saved bank `corridor` and compatible extensions. Optional `direction` records a north/east/south/west generator preference, not an authoritative geometric direction after editing.

Left/right is relative to the source-to-endpoint frame. The polygon follows the shoreline and closes toward the selected ocean side using the saved sea depth. The corridor extends nine cross-frame units onto land for the waterfront road. Both endpoints must extend beyond the entire city in the longitudinal frame, and the ocean closure must stay beyond it. Loops, backward course segments and excessively sharp adjacent slopes are rejected. The shape adapter is independent of street generation and rendering.

Coasts use the same land/wet face partition, `bank` streets and hidden virtual `waterBoundary` edges as rivers. They contain no bridges. A shoreline-only planar arrangement checks there is exactly one connected land region before street generation; the complete city also validates actual traversable street connectivity. The square, all properties and buildings stay on land. Wall water openings remove submerged outer-perimeter sections; towers and street gates remain dry.

Workspace schema stays 1. The shared course editor retains its historical `mode: "river"` enum for editing either river or shoreline points. Optional `workspace.waterEditor.controls.coastDirection` saves the pending generator direction separately from the current shoreline. Side swaps edit only the draft; a temporarily submerged square or otherwise invalid draft can still be saved. Unknown compatible workspace and feature fields remain preserved.

Migration 5→6 advances only `project.schemaVersion`. It never changes existing water, bridges, streets, buildings, defenses, districts, history or view. `tests/fixtures/save-3e-format1-schema5.json` is a frozen native river project captured from the released 3E HTML. Schema 6 admitted one river **or** one coast. Schema 7 extends that contract as described below.

## Water composition schema 7

`city.waterFeatures` accepts up to two features: one `river` and one `coast`. Each retains its own ID, exact geometry and compatible metadata. New generated records include `generation: {seed, algorithm}` for per-feature provenance; older records need no added fields. New IDs use kind-specific prefixes, while imported IDs are retained. Regenerating one kind preserves the other record; removing a river removes only bridges referencing it.

Existing `waterState` version-1 dry/river/coast states remain valid. A combined city uses `status: "mixed"`, `algorithm: "union-v1"` and the existing bounded seed metadata. Per-feature generation metadata and independent workspace seed controls carry each generator's settings; the legacy root seed is not a replacement for those controls.

Land calculations use the union of all bank corridors. Streets are clipped against every corridor. Bank edges inside another water feature are removed before street arrangement construction, including at river mouths. Wet faces cover the union once and use `waterIds` to name every feature contributing positive area to that face. Old single-feature `waterId` records remain readable unchanged. Face area, planarity, positive winding and original-outline coverage checks still apply.

Bridge records continue referencing a specific river ID. Crossings and their rendered width must clear the coast, and traversable roads must connect all banks. A shoreline-only graph helps propose additional inland bridges when concave geography creates more land regions. New river proposals can orient toward an existing coast; proposing a coast preserves existing river and bridge records and tries placements keeping them dry.

Wall openings merge overlapping corridor cuts. New combined openings carry `waterIds`; single-feature openings retain their existing `waterId` representation. Rendering fills all bank reserves before filling the water union and draws only exposed shore edges, avoiding a road, bank strip or shoreline across the river mouth.

Workspace schema stays 1. Optional `waterEditor.activeWaterId` identifies which feature's points are being edited. Optional `controls.coastSeed` is independent from `controls.seed` (the river seed), `width` and `coastDirection`. Existing single-feature saves map their legacy seed to the appropriate section. Water undo remains chronological across both feature editors and preserves snapshots of the complete water definition.

Migration 6→7 advances only the project schema. Geometry, IDs, district/defense data, existing water states, drafts and history remain unchanged. `tests/fixtures/save-3e1-format1-schema6.json` is a native coastal save captured from the released 3E.1 HTML and tested for exact migration and subsequent river addition.

## Guided river editing in 3E.3

The data schema remains **7**: accepted geometry uses the existing ribbon, point-order and bank-slope contracts. The editor now guides river handle positions to those contracts during gestures. It may move neighboring river points to ease a bend, keeps longitudinal order, and extends an endpoint outside city land when needed. New point insertion snaps to the course and avoids duplicate handles.

A pure course-editing helper (now shared in `core/water-editing.js`, with the river API retained) returns adjusted draft points; it does not alter accepted city geometry, the coast, bridge location records or record metadata. Gesture cancellation restores the prior draft and complete bounded undo history. Explicit Tidy river bends and Generate city can repair an older invalid river draft, recording the change in water undo. File decoding and workspace restoration never tidy a draft. New river proposals pass the same feature and complete-definition validation before being offered.

## Guided coastline editing in 3E.4

The schema remains **7**, with unchanged accepted coast, river, bank-slope and point-order contracts. `core/water-editing.js` now handles both river and coastline guidance; `core/river-editing.js` retains its public river wrapper. Coast dragging keeps handles in order and eases tight bends without changing the chosen water side, river data, bridge records or compatible metadata.

Unlike a river, a coast must cover the full city in its longitudinal frame. Guided endpoints extend past the city projection when needed; the saved ocean `seaDepth` can grow within its existing allowed range to keep its closure beyond city land and shoreline bends. Endpoint guidance prevents an accidental reversal of the course within a gesture. Point insertion snaps to the course and avoids duplicates.

Explicit Tidy shoreline bends repairs a coast draft. Generate city tidies both supported water features atomically with one water-history snapshot, then runs the existing placement and street validators. Loading and decoding never tidy or regenerate saved data. New coast proposals are guided and checked with the shared feature and complete-definition validators before being presented.

## Browser recovery

Recovery stores two snapshots: current and previous. IndexedDB uses a single atomic transaction for both; if IndexedDB is blocked, localStorage uses a single atomic replacement of the complete two-snapshot record. Failed writes retain the previously committed record. Unchanged content does not rotate the backup merely because its save timestamp changed.

Writes within a page are queued. IndexedDB checks the last observed recovery token inside the write transaction, preventing an out-of-date tab from silently overwriting another tab’s update. The localStorage fallback checks the token too, but browsers do not provide a transaction spanning separate cross-tab localStorage reads and writes; keep one actively editing tab when using that fallback.

A valid previous snapshot remains available if the latest project payload is corrupt. An unsupported newer current snapshot is preserved rather than overwritten by an older build.

At startup, existing recovery is offered before new autosaves can replace it. The user can restore it or explicitly continue the current city. Recovery stays paused during that choice. File imports are parsed, migrated and validated into a staged preview; only Open project replaces the workspace. The outgoing workspace is also recovered when storage is available. Failed application attempts restore the outgoing state.

Browser storage can be blocked, cleared, scoped to a different file/origin, or exhausted. Recovery is a convenience, not the portable archive. Download `.mappo.json` files for project versions, backups, other browsers and newer standalone HTML builds. A requested download is reported as requested; the app cannot confirm the user’s filesystem write.

## Bounds and error handling

The current reader accepts at most **20 MiB** of UTF-8 JSON. It limits nesting, records, polygon complexity and validation work to avoid unbounded input. These limits are implementation safeguards and can be raised deliberately in a future reader.

Malformed JSON, HTML selected as a project, invalid IDs, non-finite coordinates, unsafe object keys and unsupported versions produce a visible error. No imported HTML, script or metadata is executed. The current project remains open if parsing or validation fails.

## Schema 8: independent lakes

The feature limit is ten: at most eight lakes, one river and one coast, plus up to eight river bridges. A single lake uses water state `status: "lake"`, `algorithm: "lake-v1"`; any multi-feature composition uses `mixed` / `union-v1`. Each lake stores a stable ID, version 1, name, center, closed 3–32 point shoreline, exact polygon/bank corridor and per-feature generation metadata. The closing point is implicit. Wet faces retain either their legacy single-feature `waterId` or exact multi-feature contributor `waterIds`.

The optional water editor mode `lake-move` and controls `lakeSeed`, `lakeRadius`, `lakeId` preserve whole-lake movement, pending generation settings and the selected lake independently of river/coast selection. Invalid unfinished lake geometry remains saveable within structural bounds; accepted city shorelines must satisfy lake and full topology validation. The 7 → 8 migration increments the schema only. Native schema-7 river/coast fixtures verify that city and workspace data stay byte-for-byte equivalent as JSON values.

## Schema 9: optional mountain terrain

New cities store `terrainFeatures`, `terrainPasses`, and `terrainFaces`. Older cities may omit these collections and retain their exact geometry. The 8 → 9 migration changes only the schema. A frozen native 3E.5 file verifies preservation of water, geometry and workspace drafts. Terrain feature version 1 stores a mountain ID/name, center, closed footprint, three positioned ridge peaks with heights, exact polygon/corridor, generation metadata and compatible extensions. Passes reference their owning terrain ID and normalized ridge location. Reserved faces store exact sorted `terrainIds` contributors. Walls may include exact `terrainOpenings`.

The optional `workspace.terrainEditor` stores independent terrain definitions, active ID, point/pass selection, dirty state, mode (`pan`, `shape`, `ridge`, `move`, `pass`, `addpass`), up to twenty undo definitions and pending string controls (`seed`, `size`, `height`, `placement`). `workspace.panels.terrain` stores the panel state. Unknown compatible fields and controls merge on export, matching the other editors. Loaded geometry and drafts are never regenerated or guided. Current limits are six ranges, twelve passes and 256 reserved mountain faces.

## UI overhaul Phase 1

The workspace shell adds runtime-only navigation, panel visibility/pinning and inspector selection. It does not add fields to project schema 9 or workspace schema 1. Geometry, draft controls and editor histories retain their existing save contracts. Loading an existing water/terrain editing mode reveals Landscape; a restored district selection can open its inspector, while an active outline tool reveals City. Persisting shell preferences is deferred to the approved later UI phase and will require explicit workspace validation and compatibility tests.

UI Phase 2 (`0.1-dev.ui2`) changes control placement without adding schema fields. Project loading/recovery still stages a validated document and requires Open project. The existing camera, all seven visibility fields and pending generation inputs round-trip through their original workspace fields; new menu and generation-disclosure visibility is runtime-only.


## UI overhaul Phase 3 — optional landscape reference

`workspace.view.landscapeSelection` is an additive optional `null` or `{kind: "water" | "terrain", id: string}` reference, with a nonempty ID up to 128 characters. Compatible extra fields are retained. New captures write the selected landscape reference or null; creation-form references are runtime-only. The accepted project schema remains 9, workspace schema 1 and envelope format 1.

On load, resolution uses restored water/terrain draft records. A missing record clears landscape selection safely; it does not reject or regenerate the accepted city. Older saves without this field use their existing active-editor-mode/district fallback. Existing raw selected-feature controls, IDs, geometry and scoped histories retain their contracts. The running editor caches raw inputs per feature when switching selections, but unselected caches, filters, creation presentation and complete shell preferences await Phase 6 persistence.

## UI overhaul Phase 4A — district inspector organization

The selected district remains `workspace.districtEditor.selectedDistrictId`, with the optional selected block, existing pending single-selection controls and district history unchanged. A keyed district list and right-hand inspector are UI adapters, not new persistent geometry or workspace fields. Accepted city schema remains 9, workspace schema remains 1, and file container version remains 1. Defense editing is unchanged in Phase 4A.

## UI overhaul Phase 4B — defense workflow presentation

The Defenses section now provides a live description of pending settings and explicit scoped **Update defenses**/**Undo defense edit** actions. The preview is derived from accepted `fortificationState` plus existing unsaved `fortificationEditor.controls`; it introduces no new persisted field. File restore assigns the saved controls and refreshes the preview without generating geometry. All previous save, disabled-wall, history, migration and validation contracts remain in force; city schema 9, workspace schema 1 and container version 1 remain unchanged.

## UI overhaul Phase 4C — combined local workflows

The existing project document stores the complete authoritative city, district editor snapshot/history and defense editor snapshot/history in their unchanged fields. Combined local updates are validated independently, preserve unaffected city geometry, and can be undone in either editor without rewriting the other's records. Loading the saved city directly restores both accepted datasets and editor histories without invoking street or feature generation. The only added behavior is scrolling the matched neighborhood list row into view on map selection. Schema/container versions remain unchanged.

## Phase 5A pending-state presentation

Pending city and local edit counts are derived at runtime from existing accepted project records, editor drafts and pending form fields. They are never stored or used to regenerate geometry. Saving and loading still use project schema 9, workspace schema 1 and container format 1.

## Phase 5B–5D workspace feedback

Contextual Undo labels, validation error indicators and per-section scroll positions are runtime-only UI state. Undo invokes the existing editor histories and the existing project/save system stores these unmodified histories as before. Section scroll memory resets on project load; portable persistence of the workspace shell is reserved for Phase 6. No project, workspace or envelope schema additions were made (9/1/1).

## Phase 6D additive workspace presentation fields (schema remains 1)

`workspace.ui` is optional in every project and recovery snapshot. It includes a known active section (`city`, `landscape`, `districts`, `defenses`), panel collapse/pinning booleans, a nullable `{kind,id}` inspector selection, nonnegative bounded scroll positions, known disclosure open flags, a landscape filter and bounded per-feature raw input entries, plus per-district unfinished name/color drafts. All known fields are type-checked before restoration; unknown compatible nested properties survive re-saving. Historical files without `workspace.ui` load using the previous active-mode/selection fallbacks. Geometry/IDs remain authoritative in `project`, with no rebuild during file load or recovery. Project schema 9, workspace schema 1, container version 1 are unchanged.

## Phase 7: no save-format migration

The `0.1-dev.ui7d` review candidate retains container format 1, project schema 9 and workspace schema 1. Version bumps to the application, its compiled HTML and metadata do not transform a loaded city. Automated Phase 7B project/recovery round trips compare exact serialized city geometry; Phase 7D adds a real-browser portable project download, staged file selection and reopen check. Existing files without the optional `workspace.ui` remain compatible; unsupported newer schemas still reject atomically. Full browser checks and manual limitations are reported in `PHASE7_QA.md`.


## C01 compound-building groups (optional project schema 9 extension)

Each existing building remains one independent simple exterior polygon plus valid courtyard holes, owned by one property. A property may optionally have `buildingCompounds`, a list of property-owned group records:

```json
{"id":"CMP-MAN-0001","name":"Castle complex","memberBuildingIds":["BLD-00001","BLD-00002"]}
```

The list is absent on ungrouped properties. The validator requires a unique `CMP-MAN-`-prefixed group ID, name of 1–80 characters, 2–32 distinct member IDs, each member on the owning property and not in another group. Up to 128 groups per property may be stored. No secondary `building.compoundId` field is introduced. Individual building identity, metadata, footprint, holes, actual plots, entrance and frontage remain authoritative; grouped move/rotation/scale must validate and save atomically.

This additive schema-9 extension does **not** guarantee that older Mappo versions respect group semantics while editing. For safe compound edits use Mappo 0.2.10 or later. Unsupported cross-property transfer or member deletion must fail validation rather than silently breaking a group; explicit unlink/dissolve first. Unknown compatible fields are copied on group edits and project round-trips. No 3D meshes, arbitrary unions, island holes or through-building access are promised.


## D01 0.2.11 accepted edit history is session-only

The 0.2.11 shared history ledger is **not included in project JSON**, recovery documents or the portable envelope. Saved city data stays at project schema **9** and format **1**. Undo/Redo targets only this open editing session. Generate/rebuild, open/import, or recover resets it explicitly. Older stored project files are not changed by D01; exporting a project never adds history snapshots. The ledger is limited to 20 transactions and 64 MiB estimated payload and can prune older steps with user-visible status.

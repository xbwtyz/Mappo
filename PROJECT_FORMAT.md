# Mappo project persistence contract

## Independent versions

`src/core/version.js` owns the app and project-data schema versions. The standalone builder checks the app version against `package.json`, fills the HTML version placeholders and derives the distribution filename. Save-container versions and migration rules live in `src/data/migrations.js`.

The current release is **0.1-dev.3e**. Its container format is **1**, project-data schema is **5**, and workspace schema is **1**. These numbers are independent of the generator version that originally produced a city.

A native file ends in `.mappo.json` and is UTF-8 JSON with this envelope:

```json
{
  "format": "mappo-project",
  "formatVersion": 1,
  "documentId": "persistent-document-identity",
  "createdAt": "2026-11-17T09:00:00.000Z",
  "savedAt": "2026-11-17T09:00:00.000Z",
  "appVersion": "0.1-dev.3e",
  "project": {},
  "workspace": {},
  "extensions": {}
}
```

The empty objects illustrate envelope locations; they are not a valid complete city. A file requires the structures described below.

## Authoritative city data

`project` stores the complete model: accepted outline, settings, survey metadata, street nodes, roads, block polygons, civic square, base plots, properties, buildings, courtyard holes, access metadata, open space, districts, walls, gates, towers, water features, bridges and reserved water faces. IDs and references are saved directly. Loading never calls the procedural generator or infers buildings from a seed.

Names, notes and unknown JSON fields on records are retained. `project.generatorVersion` describes the original generator; loading and exporting does not rewrite it to the current app version.

Schemas 2–5 share these geometry contracts: polygon coordinates are ordinary finite JSON numbers. Polygons use a counterclockwise outer boundary. Building holes are separate counterclockwise polygons inside the footprint. Base plots are convex; properties and building footprints may be concave. A property’s plots partition its area. Buildings reference only the plots their actual footprint occupies. Attached rows may share walls, with no positive-area footprint overlap.

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

Future developers should:

1. Add fields without dropping unknown fields during serialization.
2. Increment the project schema when changing a core invariant or incompatible representation.
3. Add an explicit pure migration from each supported older schema.
4. Keep migrations independent of the generator. Never regenerate an imported city as a migration shortcut.
5. Retain frozen historical fixtures and add a fixture for each newly shipped format.
6. Extend validators and readers alongside the new schema; update the workspace or container version only when their respective contracts change.

A newer unsupported container, project schema or workspace schema is rejected with a compatible-build message. The reader does not guess how to downgrade it. Compatible unknown fields are preserved; arbitrary future formats are not promised to be readable by old apps.

Raw schema-1 projects captured from the released 3A.2 and 3B builds are supported. The first migration adds missing empty property/plot/open-space collections where appropriate and advances schema 1 to 2; the district migration advances it to schema 3, the fortification migration advances it to schema 4, then the water migration advances it to schema 5. It preserves original geometry, IDs and generator metadata. Those earlier HTML builds did not have a save button; raw JSON compatibility supports existing model snapshots.

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

Built records have strict kind/version checks; unsupported future forms require a compatible reader. See [`FORTIFICATIONS.md`](FORTIFICATIONS.md) before extending representation or adding generators.

## Water schema 5

`city.waterState` records `version: 1`, `status: "dry" | "river"`, independent `seed` and `algorithm: "ribbon-v1"`. Current readers support zero or one river.

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

## Browser recovery

Recovery stores two snapshots: current and previous. IndexedDB uses a single atomic transaction for both; if IndexedDB is blocked, localStorage uses a single atomic replacement of the complete two-snapshot record. Failed writes retain the previously committed record. Unchanged content does not rotate the backup merely because its save timestamp changed.

Writes within a page are queued. IndexedDB checks the last observed recovery token inside the write transaction, preventing an out-of-date tab from silently overwriting another tab’s update. The localStorage fallback checks the token too, but browsers do not provide a transaction spanning separate cross-tab localStorage reads and writes; keep one actively editing tab when using that fallback.

A valid previous snapshot remains available if the latest project payload is corrupt. An unsupported newer current snapshot is preserved rather than overwritten by an older build.

At startup, existing recovery is offered before new autosaves can replace it. The user can restore it or explicitly continue the current city. Recovery stays paused during that choice. File imports are parsed, migrated and validated into a staged preview; only Open project replaces the workspace. The outgoing workspace is also recovered when storage is available. Failed application attempts restore the outgoing state.

Browser storage can be blocked, cleared, scoped to a different file/origin, or exhausted. Recovery is a convenience, not the portable archive. Download `.mappo.json` files for project versions, backups, other browsers and newer standalone HTML builds. A requested download is reported as requested; the app cannot confirm the user’s filesystem write.

## Bounds and error handling

The current reader accepts at most **20 MiB** of UTF-8 JSON. It limits nesting, records, polygon complexity and validation work to avoid unbounded input. These limits are implementation safeguards and can be raised deliberately in a future reader.

Malformed JSON, HTML selected as a project, invalid IDs, non-finite coordinates, unsafe object keys and unsupported versions produce a visible error. No imported HTML, script or metadata is executed. The current project remains open if parsing or validation fails.

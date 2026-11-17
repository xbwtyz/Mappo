# Mappo project persistence contract

## Independent versions

`src/core/version.js` owns the app and project-data schema versions. The standalone builder checks the app version against `package.json`, fills the HTML version placeholders and derives the distribution filename. Save-container versions and migration rules live in `src/data/migrations.js`.

The current release is **0.1-dev.3b1**. Its container format is **1**, project-data schema is **2**, and workspace schema is **1**. These numbers are independent of the generator version that originally produced a city.

A native file ends in `.mappo.json` and is UTF-8 JSON with this envelope:

```json
{
  "format": "mappo-project",
  "formatVersion": 1,
  "documentId": "persistent-document-identity",
  "createdAt": "2026-11-17T09:00:00.000Z",
  "savedAt": "2026-11-17T09:00:00.000Z",
  "appVersion": "0.1-dev.3b1",
  "project": {},
  "workspace": {},
  "extensions": {}
}
```

The empty objects illustrate envelope locations; they are not a valid complete city. A file requires the structures described below.

## Authoritative city data

`project` stores the complete model: accepted outline, settings, survey metadata, street nodes, roads, block polygons, civic square, base plots, properties, buildings, courtyard holes, access metadata, open space, and reserved district/wall collections. IDs and references are saved directly. Loading never calls the procedural generator or infers buildings from a seed.

Names, notes and unknown JSON fields on records are retained. `project.generatorVersion` describes the original generator; loading and exporting does not rewrite it to the current app version.

Within schema 2, polygon coordinates are ordinary finite JSON numbers. Polygons use a counterclockwise outer boundary. Building holes are separate counterclockwise polygons inside the footprint. Base plots are convex; properties and building footprints may be concave. A property’s plots partition its area. Buildings reference only the plots their actual footprint occupies. Attached rows may share walls, with no positive-area footprint overlap.

The current reader validates structure, unique IDs, references, street planarity/connectivity, block coverage, street-width setbacks, polygon containment, plot ownership/area, roof geometry and rendering fields. It rejects incomplete or inconsistent core geometry before changing the open city.

## Workspace and unfinished edits

`workspace` stores:

- `schemaVersion: 1`.
- `editor`: draft boundary, draft center, closed/dirty state, editing mode, error flag and up to 40 undo snapshots.
- `controls`: draft seed, density, street pattern and selected starting outline.
- `view`: camera position/zoom and layer visibility.

An unfinished or crossed draft can be saved. It is separate from the validated generated city, so it can be reopened for correction. An active freehand gesture reopens as a point-editable draft rather than resuming pointer capture. Only known editor data is restored into the editor instance; imported history cannot replace callbacks or methods.

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

Raw schema-1 projects captured from the released 3A.2 and 3B builds are supported. Migration adds missing empty property/plot/open-space collections where appropriate and advances the schema to 2. It preserves original geometry, IDs and generator metadata. Those earlier HTML builds did not have a save button; raw JSON compatibility supports existing model snapshots.

## Browser recovery

Recovery stores two snapshots: current and previous. IndexedDB uses a single atomic transaction for both; if IndexedDB is blocked, localStorage uses a single atomic replacement of the complete two-snapshot record. Failed writes retain the previously committed record. Unchanged content does not rotate the backup merely because its save timestamp changed.

Writes within a page are queued. IndexedDB checks the last observed recovery token inside the write transaction, preventing an out-of-date tab from silently overwriting another tab’s update. The localStorage fallback checks the token too, but browsers do not provide a transaction spanning separate cross-tab localStorage reads and writes; keep one actively editing tab when using that fallback.

A valid previous snapshot remains available if the latest project payload is corrupt. An unsupported newer current snapshot is preserved rather than overwritten by an older build.

At startup, existing recovery is offered before new autosaves can replace it. The user can restore it or explicitly continue the current city. Recovery stays paused during that choice. File imports are parsed, migrated and validated into a staged preview; only Open project replaces the workspace. The outgoing workspace is also recovered when storage is available. Failed application attempts restore the outgoing state.

Browser storage can be blocked, cleared, scoped to a different file/origin, or exhausted. Recovery is a convenience, not the portable archive. Download `.mappo.json` files for project versions, backups, other browsers and newer standalone HTML builds. A requested download is reported as requested; the app cannot confirm the user’s filesystem write.

## Bounds and error handling

The current reader accepts at most **20 MiB** of UTF-8 JSON. It limits nesting, records, polygon complexity and validation work to avoid unbounded input. These limits are implementation safeguards and can be raised deliberately in a future reader.

Malformed JSON, HTML selected as a project, invalid IDs, non-finite coordinates, unsafe object keys and unsupported versions produce a visible error. No imported HTML, script or metadata is executed. The current project remains open if parsing or validation fails.

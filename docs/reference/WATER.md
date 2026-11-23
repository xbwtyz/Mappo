# Water and bridge architecture

Milestone 3E implements generated/editable rivers and connected bridges. The 3E.1 expansion adds generated/editable coastlines, an explicit ocean side and connected coastal land. The 3E.2 expansion supports one river and one coast together, with independent controls and an exposed-shore union at river mouths. The 3E.5 expansion adds up to eight independent lakes with closed shore handles, whole-lake movement and inland access streets. Additional rivers/coasts remain extensions. Building inspection was completed in 3F; the current desktop workflow is described by [G4 acceptance](../history/0.2/workspace/g4-acceptance-report.md).

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `core/water-geometry.js` | Shared course frame, river/coast shape adapters, interpolation, line/polygon intervals and bridge spans |
| `generators/water.js` | Seeded river proposals and materializing accepted water polygons through shape adapters |
| `generators/coast.js` | Independent seeded shorelines, requested ocean direction and connected-land proposals |
| `core/water-shore-topology.js` | Dry perimeter/quay/crossing connectivity before street generation |
| `core/water-regions.js` | Shoreline-only planar arrangement and dry-region counting before streets exist |
| `core/water-model.js` | Supported record contracts, shoreline agreement, bridge spans, face classification and traversable connectivity |
| `core/water-editing.js` | Shared ordered-handle guidance, gentle bend propagation and river/coast draft tidying |
| `core/river-editing.js` | Stable river guidance wrapper for existing callers |
| `editor/water.js` | Independent definition drafts, point/bridge selection, gestures and 20-step undo |
| `ui/water.js` | Water controls, tool selection, feedback and pending inputs |
| `renderer/water.js` | Water/bank fills, bridge decks and interactive preview handles |
| `core/water-fortifications.js` | Saved river openings through walls and dry gate placement |
| `generators/layout.js` | Land-clipped streets, bank edges, bridge approaches and planar face extraction |

## Generation and editing

Automatic generation proposes a single river along the longest city-bound axis, offset from the square, using an independent water seed. Its source and mouth extend beyond the city. Bridge proposals sample suitable inside-city crossings and spread them along the course. The draft can be moved before any city geometry changes.

The ribbon width is measured in the frame's lateral direction. Course points progress source-to-mouth, with bounded lateral slopes; arbitrary loops and reversals are deliberately rejected. Bridges use a normalized longitudinal coordinate, snapping to the piecewise-linear course and orienting perpendicular to its local segment. Moving river points therefore moves and reorients associated crossings coherently. Editing can temporarily break these constraints; generation explains the problem and preserves the last valid city.

Applying a definition includes bank edges and bridge lines in the existing planar street arrangement. Ordinary streets are clipped out of the corridor. Waterfront streets lie on the outside of the bank reserve. Faces inside the corridor are water faces, excluded from properties and neighborhoods. The square, dry blocks and wet faces still partition the original outline exactly. Bridge approaches become straight primary streets, split at every actual junction. Virtual outer-boundary edges over water close the arrangement but are never treated as traversable streets.

Water definitions and histories are independent of outline, district and defense editors. City regeneration resets district and defense history against their new geometry. Water undo instead restores a draft; applying it is explicit. Pointer capture, active drags and cancelled gesture buffers are transient. Imported projects restore accepted geometry directly and never auto-apply unfinished water drafts.

## Extension rules

- Add explicit versioned feature and crossing kinds, geometry helpers, validation and matching rendering together. Current limits accept eight lakes, one river with up to eight bridges and one coast simultaneously. Bridges reference the river and must remain clear of the ocean.
- Keep accepted geometry authoritative and preserve compatible JSON fields. Changing a water draft must not mutate city records.
- Extend the arrangement's land/wet face classification for lakes, coastlines, islands or multiple rivers; do not cover unwanted buildings with a water-colored overlay.
- Preserve real shared junctions at bridge ends and validate traversable connectivity independently of virtual arrangement edges.
- Keep shore setbacks and rendered road/bridge widths consistent. New terrain-aware crossings, variable widths and bridge styles need corresponding clearance checks.
- Extend the fortification adapter for each new feature kind so walls, towers and street gates respect its geometry.
- Use explicit migrations and frozen standalone-save fixtures for incompatible model changes. Schema 5 preserves older cities as dry land; schema 6 preserves existing river data unchanged.

See `PROJECT_FORMAT.md` for the exact persistence contract and `QA.md` for automated coverage and the native Firefox checklist.

## Coast adapter

`WATER_GEOMETRY` selects a shape implementation by supported kind. Rivers retain their exact ribbon calculation; coast polygons close from the ordered shoreline toward the selected ocean side using a stored sea depth. Layout clipping, water-face extraction, shoreline roads and the fortification adapter use `waterFeaturePolygon` rather than assuming a two-bank river. New kinds require matching strict model/draft validation and rendering.

The coastline generator keeps the square on land and rejects proposals producing disconnected dry regions. Edited coasts run the same preflight check. The full city still validates real street connectivity independently of virtual boundary edges. Ocean direction applies to new proposals; swapping land/water edits the current draft and can intentionally make it invalid until the shore or square is moved.

The shared editor uses the existing `river` mode internally for course handles, preserving workspace-schema-1 compatibility. River tools target the river even while a coast exists; shoreline tools target only the coast. Explicit generation replaces only the selected kind and preserves the other feature and its compatible metadata. River mouths are the geometric union of river and ocean polygons; their internal bank edges are removed.

## Independent feature composition

The editor upserts river/coast by kind and lakes by explicit ID, preserves imported IDs, assigns collision-free IDs to additions and remaps newly generated river bridges to their owning river. Each section has its own seed, reroll, edit and remove controls. Point selection is scoped through `activeWaterId`; removing a coast retains the river and its bridges, while removing the river retains the coast. The shared chronological undo stores complete definitions.

`waterSetIntervals`, `waterUnionSegments` and `waterSetBoundary` provide shared union predicates for layout, validation and rendering. Wet-face contributor IDs describe positive-area overlap, rather than labeling all merged water as whichever feature appeared first. The shore topology graph excludes virtual edges across water and helps choose enough inland bridges without altering the coast. Invalid edited crossings remain drafts and cannot replace the last valid city.

Coast and river generators use derived geometry from the current other-feature draft when proposing compatible placements; they do not mutate that draft. Accepted geometry is still rebuilt only through Generate city and saved directly. Schema 7 adds composition while preserving native schema-6 coasts unchanged.

## Forgiving river interaction in 3E.3

The model retains its existing monotonic-course and bank-slope invariants. Guided dragging prevents a handle passing its neighbors and propagates a tight lateral bend through nearby handles. Calculations use a gesture baseline so repeated pointer updates do not accumulate drift. Endpoint correction uses the current outline; its bounds are obtained once per gesture. Double-click insertion projects onto the existing course, selecting a nearby existing handle rather than duplicating it.

Tidy river bends and explicit city generation can repair older invalid drafts, with a snapshot for undo. The helper preserves already-valid coordinates. Water file loading, migrations and exact geometry restoration do not invoke it. Coast and bridge location records are retained. River generation guides or retries candidates and runs the shared feature and full water-definition validators before returning a proposal.

Regression coverage includes the narrow coastal-city case where the previous standalone build returned 42 invalid courses across 1,000 seeds. The same 1,000 seeds now all pass the common water-definition validator. This does not imply every possible river fits every outline; square clearance, dry bridge banks and traversable connectivity remain required.

## Guided coastlines in 3E.4

The same pure course-guidance engine now serves rivers and coasts. Coastal endpoints must span the full city projection, and ocean closure must remain beyond both city land and seaward bends. Guidance extends endpoints and increases the existing sea-depth field when necessary, within its existing bounds. The stored left/right ocean side is preserved; endpoint movement is constrained against accidentally reversing course within a gesture.

`tidyFeature` handles the explicit river and coastline actions. `tidyWater` computes both results first, then applies them with a single undo snapshot when Generate city is chosen. Already valid records remain exact, and file loading never invokes tidying. Coast insertion snaps onto its course with duplicate-handle selection. Generated coasts pass guidance and common feature/definition validation before returning a preview. Square clearance, dry bridge banks and connected land remain separate required placement checks.

## Independent lakes in 3E.5

`core/lake-geometry.js` owns the closed shoreline, parallel bank offset, bank safety, city containment and shared inland access segments. `core/lake-editing.js` guides a single shore handle or a whole-lake translation from the gesture baseline, limiting unsafe edits rather than storing a crossing bank. `generators/lakes.js` proposes deterministic organic shores on available land and validates the whole composition before returning a preview. The shared water registry supplies the lake polygon to layout, buildings, defenses and rendering.

Lake records have `kind: "lake"`, `dataVersion: 1`, stable `id`, `name`, `center`, 3–32 positively wound `path` points with no repeated closing point, `polygon`, `corridor`, generation seed/algorithm/radius, and extensions. Shores are simple star-shaped rings around the saved center. This permits elongated and indented lakes while bounding pathological banks. Shore points remain 12–200 units from the center; parallel banks must be simple and keep at least six units of actual water clearance. Banks stay at least 12 units inside the city boundary, and lake water cannot occupy the main square. Unsupported bridge references to lakes reject; existing crossings remain river-owned.

Two dry lane axes through each lake center connect its bank ring to the street arrangement. Both layout and preflight topology use the same segments, clipping away wet sections. They partition the surrounding annulus into simple land faces even when a lake fits entirely inside one original street block. The full actual street connectivity, coverage, property setback and defense validators remain authoritative. Lake overlaps use the existing water-union semantics; new proposals prefer separate water bodies.

Adding a lake never replaces an existing feature. Selected regeneration uses its explicit ID and preserves name, center, compatible record metadata and all other features. Removing a lake removes only that ID. Closed-edge insertion and safe deletion reuse the shared point tool, while `lake-move` selects the center marker. A cancelled gesture restores geometry, dirty state and complete history. Schema 8 admits lake data without altering older accepted geometry or drafts; load never guides or regenerates a saved shoreline.

# Water and bridge architecture

Milestone 3E implements generated/editable rivers and connected bridges. The 3E.1 expansion adds generated/editable coastlines, an explicit ocean side and connected coastal land. The 3E.2 expansion supports one river and one coast together, with independent controls and an exposed-shore union at river mouths. Lakes and additional rivers/coasts remain extensions. Building inspection remains planned for 3F.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `core/water-geometry.js` | Shared course frame, river/coast shape adapters, interpolation, line/polygon intervals and bridge spans |
| `generators/water.js` | Seeded river proposals and materializing accepted water polygons through shape adapters |
| `generators/coast.js` | Independent seeded shorelines, requested ocean direction and connected-land proposals |
| `core/water-shore-topology.js` | Dry perimeter/quay/crossing connectivity before street generation |
| `core/water-regions.js` | Shoreline-only planar arrangement and dry-region counting before streets exist |
| `core/water-model.js` | Supported record contracts, shoreline agreement, bridge spans, face classification and traversable connectivity |
| `core/river-editing.js` | Pure ordered-handle guidance, gentle bend propagation and draft tidying |
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

- Add explicit versioned feature and crossing kinds, geometry helpers, validation and matching rendering together. Current limits accept one river with up to eight bridges and one coast simultaneously. Bridges reference the river and must remain clear of the ocean.
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

The editor upserts by kind, preserves imported IDs, assigns collision-free IDs to additions and remaps newly generated river bridges to their owning river. Each section has its own seed, reroll, edit and remove controls. Point selection is scoped through `activeWaterId`; removing a coast retains the river and its bridges, while removing the river retains the coast. The shared chronological undo stores complete definitions.

`waterSetIntervals`, `waterUnionSegments` and `waterSetBoundary` provide shared union predicates for layout, validation and rendering. Wet-face contributor IDs describe positive-area overlap, rather than labeling all merged water as whichever feature appeared first. The shore topology graph excludes virtual edges across water and helps choose enough inland bridges without altering the coast. Invalid edited crossings remain drafts and cannot replace the last valid city.

Coast and river generators use derived geometry from the current other-feature draft when proposing compatible placements; they do not mutate that draft. Accepted geometry is still rebuilt only through Generate city and saved directly. Schema 7 adds composition while preserving native schema-6 coasts unchanged.

## Forgiving river interaction in 3E.3

The model retains its existing monotonic-course and bank-slope invariants. Guided dragging prevents a handle passing its neighbors and propagates a tight lateral bend through nearby handles. Calculations use a gesture baseline so repeated pointer updates do not accumulate drift. Endpoint correction uses the current outline; its bounds are obtained once per gesture. Double-click insertion projects onto the existing course, selecting a nearby existing handle rather than duplicating it.

Tidy river bends and explicit city generation can repair older invalid drafts, with a snapshot for undo. The helper preserves already-valid coordinates. Water file loading, migrations and exact geometry restoration do not invoke it. Coast and bridge location records are retained. River generation guides or retries candidates and runs the shared feature and full water-definition validators before returning a proposal.

Regression coverage includes the narrow coastal-city case where the previous standalone build returned 42 invalid courses across 1,000 seeds. The same 1,000 seeds now all pass the common water-definition validator. This does not imply every possible river fits every outline; square clearance, dry bridge banks and traversable connectivity remain required.

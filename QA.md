# Mappo 0.1-dev.3a2 validation

## Automated checks

**25 tests passed** for this build, including every geometry stress group below.

Run `npm run check` to rebuild and run the complete suite. No crossing check is disabled or optional.

The geometry stress groups cover 1,024 generated configurations:

| Group | Configurations |
| --- | ---: |
| Seeded radial streets across three densities | 360 |
| Four street patterns across sizes and seeds | 480 |
| Eight starting outlines × three densities × four patterns | 96 |
| Former profile extremes and street patterns | 40 |
| Rotated, translated and perturbed concave outlines | 48 |

Additional tests check 1,200 survey configurations, reproducible IDs, valid center placement, rejected inputs, camera behavior and standalone output parity. Editor tests exercise freehand simplification, clicked outlines, point dragging, insertion, deletion, cancellation and undo. The compiled script also runs through drawing, generation, failed-generation retention and Space-drag navigation using simulated DOM/Canvas events.

Map rendering was inspected using the production Canvas renderer with a native Canvas implementation. This checks drawn geometry, not browser layout or browser pointer delivery.

## Graphical browser limitation

The environment could not launch Chromium: the host denied the browser's process-singleton socket. No full graphical Chromium or Firefox pass is claimed. No Firefox pass has been performed for this milestone.

## Manual Firefox checklist

Open the versioned HTML directly from disk, with networking unavailable if desired.

- Draw a concave freehand outline; release to close it. Check the shape remains recognizable after cleanup.
- Draw an outline with clicked corners and close it with Enter.
- Drag corners; double-click an edge to insert a point; select a point and press Delete. Check Undo edit restores it.
- Place the main square in another part of the city, then generate.
- Change street pattern, density and seed. Confirm the boundary and center stay fixed.
- Try a crossed outline and a narrow neck. Confirm a useful message and retention of the previous generated city.
- Pan with Space + drag while editing; scroll to zoom; fit the outline.
- Try all eight templates. Check organic, planned and radial patterns on a horseshoe or branching boundary.
- Resize the browser. Check the left tools can scroll, the map remains visible and no controls overlap it.
- Refresh only after accepting that custom project saving is not yet implemented.

# C6 road editor acceptance

Use the standalone `dist/mappo-0.2-dev.c6-road-editor.html` for review. For each route, generate a Small city with the seed shown and use Road Inspection. Preview the edit, check the map and the explanation beside Apply, then Apply, Undo, Redo, save a portable project, and reopen it. Compare the whole accepted neighborhood after Undo and after reopening.

| Layout | Seed | Move |
| --- | --- | --- |
| Planned | `c2-planned` | Move `RD-0113` 12 units along X and inspect building reflow |
| Radial | `c2-radial` | Move `RD-0103` 15 units along Y and inspect the new junction and block split |
| Organic | `c2-organic` | Move `RD-0160` 15 units along Y and inspect the related generated parcels and buildings |
| Linear | `c2-linear` | Move `RD-0124` 8 units along Y and inspect local adaptation |

Further checks

- Radial block merge. In a fresh Radial fixture, preview removing `RD-0099` and confirm the neighboring blocks merge and Undo restores them.
- Bend. In the Planned fixture, add a bend to `RD-0113`, drag the handle with snapping enabled, then use exact coordinates. Apply and reopen the accepted path.
- Protected work. In the Planned fixture, name `BLD-00061` Market Hall and move `RD-0113` 18 units along Y. The Apply area should identify Market Hall. **Resolve conflict** should focus its choices, including when the panel is minimized. Verify a rejected fixed footprint and an acceptable suggested relocation.
- Older schema-9 files. Open a city saved before development provenance was recorded. Confirm a blocked draft preserves the accepted city and recovery revision.

## Release checks

- Run the Node tests and all Chromium and Firefox browser suites at desktop, ultrawide, tablet and phone sizes.
- Build the single-file offline distribution and compare it byte-for-byte with root `index.html`.
- On physical touch hardware, drag and cancel a road and a bend, pinch or pan while a draft is open, and verify that the Apply explanation and conflict controls are reachable while the panel is scrolled.
- With a keyboard and screen reader, check the live Apply message and use **Resolve conflict** to reach the focused choice. Verify focus after opening from the minimized panel.

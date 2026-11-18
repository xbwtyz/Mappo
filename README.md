# Mappo

**Mappo** is an offline-first procedural medieval city mapper built from modular JavaScript and distributed as a **single standalone HTML file**.

[**Launch stable Mappo (main)**](https://xbwtyz.github.io/Mappo/) · [**Download 3G-A preview HTML**](dist/mappo-0.1-dev.3ga.html) · [**User Guide**](docs/user-guide.md) · [**Roadmap**](docs/ROADMAP.md)

**3G-A preview version:** `0.1-dev.3ga` (feature branch; not yet merged). **Stable published release:** 3F-D (`0.1-dev.3fd`). **Next proposed implementation:** 3G-B.

## What it can do

- Draw and reshape a custom city boundary, or choose one of eight starting outlines.
- Generate connected streets, a civic square, plots, varied properties and individual building footprints in **Organic**, **Planned**, **Radial** or **Linear** patterns.
- Add and edit rivers, coastlines, lakes, mountain ranges and bridges; manage districts and perimeter defenses.
- Select properties first, inspect their individual buildings, and apply independent custom names and descriptive uses.
- Enter **Building Edit Mode** from a building Inspector, switch between structures on that property, and see visual-only footprint guides (3G-A).
- Download and load portable `.mappo.json` projects, with browser-local recovery snapshots.

## Start here

1. Open the [hosted stable app](https://xbwtyz.github.io/Mappo/), or save [the 3G-A standalone preview](dist/mappo-0.1-dev.3ga.html) from this branch and open it in a modern browser.
2. In **City**, draw or choose an outline, then place a main square.
3. Select a street pattern and seed, then click **Generate city**.
4. Use **Landscape**, **Districts**, **Defenses**, **Layers**, and the **Inspector** to explore and edit.
5. Use **Project → Download project** to back up your city.

See the [User Guide](docs/user-guide.md) for controls, save/recovery details and known limits.

## Screenshots

| Property-first selection | Individual building details | Identity customization |
| --- | --- | --- |
| ![Property Inspector and selected site](docs/images/mappo-3faa-property.jpg) | ![Building Inspector and its own generated facts](docs/images/mappo-3fb-building.jpg) | ![Property identity editor](docs/images/mappo-3fc-property.jpg) |

[View the full captioned gallery](docs/gallery.md).

## Develop

The build embeds local JavaScript modules and CSS into a self-contained HTML artifact. **Node.js 20.11+** is required for development, but neither installation nor a server is required to run the resulting HTML. Standard build/Node tests need no `npm install`.

```bash
npm run build   # write index.html and dist/mappo-0.1-dev.3ga.html
npm test        # run Node regression tests
npm run check   # build, then test
```

The generated root `index.html` and matching versioned `dist/` HTML are byte-for-byte identical. Previous standalone versions remain in [`dist/`](dist/).

## Documentation

[Documentation index](docs/README.md) · [Developer Guide](docs/development.md) · [Technical references](docs/reference/README.md) · [Development history](docs/history/README.md) · [Roadmap](docs/ROADMAP.md)

**Current limits:** Building Edit Mode is *visual and selection-only* in 3G-A; moving, rotating, resizing, adding or replacing buildings, PNG export and 3D viewing are not implemented. The portable project schema remains version 9. [3G-A design and QA](docs/history/3g/MILESTONE_3GA_QA.md).

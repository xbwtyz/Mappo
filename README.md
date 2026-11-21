# Mappo

> **Release candidate: Mappo 0.2.0 (H5).** 0.2A–G and H1–H4 are merged, and 0.2.0 is prepared on an unmerged review branch. **The currently published GitHub Release remains v0.1.0** until separate approval of H5 merge and manual publication. See the [0.2 roadmap](docs/plans/0.2/README.md).

**Mappo 0.1.0** is an offline-first medieval and fantasy city generator and 2D editor, built from modular JavaScript and shipped as **one standalone HTML file**.

**[Open the published website](https://xbwtyz.github.io/Mappo/)** · **[Download the standalone HTML](dist/mappo-0.1.0.html)** · **[Release notes](docs/releases/v0.1.0.md)** · **[User guide](docs/user-guide.md)** · **[Development roadmap](docs/ROADMAP.md)**

**Stable release:** `0.1.0` · Project data schema **9** · Offline browser runtime · No installation required.

## Features in 0.1

- Create a city with one of eight starting boundary shapes or a user-drawn outline. Generate radial, organic, linear, or planned street patterns with repeatable seeds.
- Shape rivers, coastlines, lakes, mountains, and related terrain/water features. Work with districts, perimeter defenses and a civic square.
- Select **properties first**, inspect individual buildings, and give properties and buildings independent names and descriptions.
- Edit existing four-corner property boundaries and plot dividers with safe previews, geometry checks and atomic Apply. Delete properties with confirmation and session-only restoration.
- Move, rotate, and resize building footprints. Add, replace, or delete individual buildings; **clear every building on a property in one reversible operation**.
- Use precise editing nudges, scoped keyboard shortcuts, live dimensions, contextual validation feedback and session-scoped Undo/Redo.
- Choose **Presentation**, **Planning**, **Minimal**, or **All layers** presets, or customize visibility manually.
- Download the **currently visible map as PNG**, with optional filenames shared with `.mappo.json` project downloads.
- Save/load portable validated project files. Browser-local recovery snapshots provide additional safety; downloaded files are the recommended backup.

## 0.2.0 release candidate (not yet published)

The merged H4 `main` branch contains the 0.2 city designer; this H5 branch freezes it as a versioned candidate: road editing with local neighborhood adaptation, property creation/splitting/merging, plot-count changes, detailed building footprints and the **Generation / Add / Roads** desktop workspace. The Pages site is manually published and **may not match `main`**. The proposed stable standalone is [`dist/mappo-0.2.0.html`](dist/mappo-0.2.0.html), available on this candidate branch only until merged. [0.2.0 release notes](docs/releases/v0.2.0.md) describe its features and limits. Project schema 9 and portable format 1 are unchanged. The older 0.2 development HTML and published v0.1.0 stay archived.

**Generation** hosts city, districts and defenses. **Add** begins property/building placement and landscape drafts. **Roads** exposes road changes, impact review and comparison. The property-first Inspector edits existing land, plots, buildings, names and uses. Desktop/laptop Firefox and Chromium are the current support targets; phone/touch acceptance is deferred.

## Launch and create a city

1. Open the [web app](https://xbwtyz.github.io/Mappo/) or save [`mappo-0.1.0.html`](dist/mappo-0.1.0.html) and open the HTML in a modern browser. The standalone works without a server or online services.
2. In **City**, choose or draw a boundary, set the main square, select a morphology and a seed, then generate.
3. Use **Landscape**, **Districts**, **Defenses**, **Layers**, the map and the **Inspector** to refine your city.
4. Under **Project**, download the `.mappo.json` backup and optionally a PNG of your visible map.

See the [User Guide](docs/user-guide.md) for detailed editing and save/recovery behavior.

## Screenshots

| Property-first selection | Individual building details | Identity customization |
| --- | --- | --- |
| ![Property Inspector and selected site](docs/images/mappo-3faa-property.jpg) | ![Building Inspector and generated facts](docs/images/mappo-3fb-building.jpg) | ![Property identity editor](docs/images/mappo-3fc-property.jpg) |

[Full gallery](docs/gallery.md)

## Development

The source lives in `src/`; `scripts/build.mjs` embeds modules and CSS into two **identical** files: `index.html` (Pages entrypoint) and `dist/mappo-<version>.html` (versioned standalone download).

```bash
npm run check
npm run test:browser  # requires test-only Playwright browsers
```

Node 20.11+ is needed for development, **not to run** the distributed HTML. CI runs Node regression tests plus Chromium and Firefox QA before a production release. Historical `dist/` snapshots remain available.

## What 0.1 does not do

The 0.1 editor does not yet support manual road-network restructuring, property split/merge, unrestricted concave parcel editing or 3D rendering. PNG export captures the **currently visible canvas**, not an automatic full-city tiled image. Accepted project edits survive saving; Undo histories and uncommitted previews generally do not.

**Next:** [H5 release candidate review](docs/plans/0.2/H5_RELEASE_CANDIDATE_REPORT.md), complete CI, separate approval to merge, successful CI on final `main`, and **a second approval to publish v0.2.0**. [0.2H release policy](docs/plans/0.2/MILESTONE_0_2H_RELEASE_PLAN.md). The stable v0.1.0 release remains available.

[Development guide](docs/development.md) · [Project format](docs/reference/PROJECT_FORMAT.md) · [0.2.0 candidate notes](docs/releases/v0.2.0.md) · [0.1.0 release notes](docs/releases/v0.1.0.md) · [Docs index](docs/README.md)

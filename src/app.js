import {
  WaterPanel
} from './ui/water.js';
import {
  FortificationPanel
} from './ui/fortifications.js';
import {
  fortificationViewPoints
} from './core/fortification-model.js';
import {
  DistrictPanel
} from './ui/districts.js';
import {
  ProjectFiles
} from './ui/project-files.js';
import {
  copyJson
} from './data/project-format.js';
import {
  createProject
} from './core/city-model.js';
import {
  Camera
} from './renderer/camera.js';
import {
  renderMap
} from './renderer/canvas.js';
import {
  bindCanvasInteraction
} from './ui/controllers.js';
import {
  OutlineEditor,
  makeStartingOutline
} from './editor/outline.js';

const $ = id => document.getElementById(id),
  canvas = $('mapCanvas'),
  viewport = $('mapViewport'),
  camera = new Camera();
const SHAPE_DESCRIPTIONS = {
  organic: 'Curving corridors and irregular blocks.',
  planned: 'Straight streets with seeded grid spacing.',
  radial: 'Rings and spokes centered on your main square.',
  linear: 'Long corridors with cross streets.'
};
const TOOL_HINTS = {
  pan: 'Drag to pan · Click a block to inspect districts · Scroll to zoom',
  freehand: 'Drag an outline · Release to close · Space + drag to pan',
  points: 'Click corners · Click first point or press Enter to close',
  edit: 'Drag corners · Double-click an edge to add a point · Delete to remove',
  center: 'Click inside the outline to place the main square'
};
let project, drawPending = false;
let files;
let districtPanel;
let fortificationPanel;
let waterPanel;
const layers = {
  buildings: true,
  properties: false,
  plots: false,
  districtColors: true,
  districtBorders: true,
  districtLabels: true,
  fortifications: true
};

function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    if (project) renderMap(canvas, camera, project, editor, layers, districtPanel?.editor.selectedDistrictId, waterPanel?.editor);
  });
}

function updateViewport() {
  $('zoomValue').textContent = `${Math.round(camera.zoom*100)}%`;
  files?.changed();
}

function editorChanged() {
  for (const mode of ['freehand', 'points', 'edit', 'pan', 'center']) $(mode + 'Button').setAttribute('aria-pressed', String(editor.mode === mode));
  if (editor.mode !== 'pan' && waterPanel) waterPanel.editor.setMode('pan');
  $('toolHint').textContent = TOOL_HINTS[editor.mode];
  $('draftBadge').textContent = editor.dirty ? '● OUTLINE PREVIEW' : waterPanel?.editor.dirty ? '● WATER PREVIEW' : '● CITY PLAN';
  canvas.classList.toggle('drawing', editor.mode !== 'pan');
  $('undoButton').disabled = editor.history.length === 0;
  $('finishButton').disabled = editor.closed || editor.boundary.length < 3;
  requestDraw();
  files?.changed();
}
const editor = new OutlineEditor(editorChanged, (message, error) => {
  $('draftMessage').textContent = message;
  $('draftMessage').classList.toggle('error', error);
});

function fitMap() {
  const points = !editor.dirty && project ? fortificationViewPoints(project.city) : editor.boundary.length > 2 ? editor.boundary : project?.city.survey.boundary;
  if (points) camera.fit(waterPanel?.editor.features.length && (waterPanel.editor.dirty || waterPanel.editor.mode !== 'pan') ? [...points, ...waterPanel.editor.features.flatMap(f => f.path)] : points);
  requestDraw();
  updateViewport();
}

function updateDetails() {
  const c = project.city;
  for (const [id, value] of Object.entries({
      cityName: c.name,
      reportCityName: c.name,
      citySeed: project.seed,
      citySize: project.options.size,
      cityMorphology: project.options.morphology,
      boundaryCount: c.survey.boundary.length,
      junctionCount: new Set(c.roads.filter(r => !r.waterBoundary).flatMap(r => [r.a, r.b])).size,
      roadCount: c.roads.filter(r => !r.waterBoundary).length,
      blockCount: c.blocks.length,
      laneCount: c.roads.filter(r => r.kind === 'lane').length,
      buildingCount: c.buildings.length,
      propertyCount: c.properties.length,
      mergedCount: c.properties.filter(p => p.plotIds.length > 1).length,
      plotCount: c.plots.length
    })) $(id).textContent = value;
}

function generate() {
  try {
    editor.validate();
    if (waterPanel?.editor.features.some(f => f.kind === 'river')) waterPanel.editor.width($('riverWidthInput').value);
    const next = createProject({
      seed: $('seedInput').value,
      size: $('sizeInput').value,
      morphology: $('morphologyInput').value,
      boundary: editor.boundary,
      center: editor.center,
      water: waterPanel?.editor.definition(),
      districtCount: $('districtNumberInput').value || 'auto',
      fortifications: {
        enabled: $('wallsEnabledInput').checked,
        gateCount: $('gateCountInput').value || 4,
        towerSpacing: $('towerSpacingInput').value || 100,
        seed: $('fortificationSeedInput').value || $('seedInput').value
      }
    });
    project = next;
    if (waterPanel) {
      waterPanel.editor.loadCity(next.city);
      waterPanel.editor.setMode('pan');
      waterPanel.refresh(true);
      waterPanel.message(next.city.waterFeatures.length ? 'City generated around the saved water. Editing its shoreline or crossings creates a new draft.' : 'Dry city generated. Choose Generate river or Generate coastline to preview water.');
    }
    districtPanel?.editor.load();
    districtPanel?.refresh(true);
    fortificationPanel?.editor.load();
    fortificationPanel?.refresh(true);
    $('seedInput').value = project.seed;
    editor.load(project.city.survey.boundary, project.options.center, false);
    updateDetails();
    updateViewport();
    $('statusMessage').textContent = `${project.city.buildings.length} buildings · ${project.city.properties.length} properties · ${project.city.properties.filter(p=>p.plotIds.length>1).length} merged sites`;
  } catch (error) {
    editor.notify(error.message, true);
    waterPanel?.message(error.message, true);
    $('statusMessage').textContent = 'Generation paused — review the error message.';
  }
}

function loadPreset() {
  try {
    editor.remember();
    editor.load(makeStartingOutline($('presetInput').value, $('seedInput').value, $('sizeInput').value));
    fitMap();
  } catch (error) {
    editor.notify(error.message, true);
  }
}

function updatePattern() {
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[$('morphologyInput').value];
  editor.dirty = true;
  editor.notify('Street settings changed. Generate to apply them to this outline.');
}
for (const key of ['buildings', 'properties', 'plots', 'districtColors', 'districtBorders', 'districtLabels', 'fortifications']) {
  $(key + 'Layer').addEventListener('change', event => {
    layers[key] = event.target.checked;
    requestDraw();
    files?.changed();
  });
}
$('freehandButton').addEventListener('click', () => editor.start('freehand'));
$('pointsButton').addEventListener('click', () => editor.start('points'));
$('editButton').addEventListener('click', () => {
  editor.setMode('edit');
  editor.notify('Drag outline points. Double-click an edge to add a point.');
});
$('panButton').addEventListener('click', () => {
  waterPanel?.editor.setMode('pan');
  editor.setMode('pan');
});
$('centerButton').addEventListener('click', () => editor.setMode('center'));
$('finishButton').addEventListener('click', () => editor.finish());
$('undoButton').addEventListener('click', () => editor.undo());
$('cancelButton').addEventListener('click', () => {
  if (!project) return;
  editor.remember();
  editor.load(project.city.survey.boundary, project.options.center, false);
  $('seedInput').value = project.seed;
  $('sizeInput').value = project.options.size;
  $('morphologyInput').value = project.options.morphology;
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[project.options.morphology];
});
$('presetButton').addEventListener('click', loadPreset);
$('presetInput').addEventListener('change', () => files?.changed());
$('generateButton').addEventListener('click', generate);
$('newSeedButton').addEventListener('click', () => {
  const v = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(v);
  else {
    v[0] = Date.now() >>> 0;
    v[1] = Math.random() * 2 ** 32;
  }
  $('seedInput').value = `${v[0].toString(36)}-${v[1].toString(36)}`;
  generate();
});
$('fitButton').addEventListener('click', fitMap);
$('zoomInButton').addEventListener('click', () => {
  camera.zoomAt(1.25);
  requestDraw();
  updateViewport();
});
$('zoomOutButton').addEventListener('click', () => {
  camera.zoomAt(.8);
  requestDraw();
  updateViewport();
});
$('morphologyInput').addEventListener('change', updatePattern);
$('sizeInput').addEventListener('change', updatePattern);
$('seedInput').addEventListener('input', updatePattern);
$('seedInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') generate();
});
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (waterPanel?.editor.mode !== 'pan') waterPanel.editor.undo();
    else editor.undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter' && editor.mode === 'points') {
    e.preventDefault();
    editor.finish();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (waterPanel?.editor.mode !== 'pan') waterPanel.editor.removePoint();
    else editor.removePoint();
  }
  if (e.key === 'Escape') {
    waterPanel?.editor.setMode('pan');
    editor.setMode('pan');
  }
  if (e.key === '0') {
    fitMap();
    e.preventDefault();
  }
  if (e.key === '+' || e.key === '=') {
    camera.zoomAt(1.25);
    requestDraw();
    updateViewport();
    e.preventDefault();
  }
  if (e.key === '-') {
    camera.zoomAt(.8);
    requestDraw();
    updateViewport();
    e.preventDefault();
  }
});

function resize() {
  const rect = viewport.getBoundingClientRect();
  camera.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
  requestDraw();
  updateViewport();
}
districtPanel = new DistrictPanel({
  getElement: $,
  getCity: () => project.city,
  activateLayers: () => {
    for (const key of ['districtColors', 'districtBorders', 'districtLabels']) {
      layers[key] = true;
      $(key + 'Layer').checked = true;
    }
    requestDraw();
    files?.changed();
  },
  commit: city => {
    project = {
      ...project,
      city
    };
    updateDetails();
    requestDraw();
    files?.changed();
  },
  changed: () => {
    requestDraw();
    files?.changed();
  }
});
districtPanel.bind();
fortificationPanel = new FortificationPanel({
  getElement: $,
  getCity: () => project.city,
  commit: city => {
    project = {
      ...project,
      city
    };
    requestDraw();
    files?.changed();
  },
  changed: () => files?.changed(),
  activateLayer: () => {
    layers.fortifications = true;
    $('fortificationsLayer').checked = true;
    fitMap();
    files?.changed();
  }
});
fortificationPanel.bind();
for (const id of ['districtPanel', 'fortificationPanel', 'waterPanel']) $(id).addEventListener('toggle', () => files?.changed());

waterPanel = new WaterPanel({
  getElement: $,
  getCity: () => project.city,
  getBoundary: () => {
    editor.validate();
    return editor.boundary;
  },
  getCenter: () => editor.center,
  activate: () => {
    editor.setMode('pan');
    $('waterPanel').open = true;
    fitMap();
  },
  changed: () => {
    const active = waterPanel.editor.mode !== 'pan';
    canvas.classList.toggle('drawing', active || editor.mode !== 'pan');
    $('toolHint').textContent = active ? (waterPanel.editor.mode === 'river' ? 'Drag water points · Double-click to add · Delete to remove' : waterPanel.editor.mode === 'bridge' ? 'Drag bridge markers · Delete to remove' : 'Click near the river to add a bridge') : TOOL_HINTS[editor.mode];
    for (const mode of ['freehand', 'points', 'edit', 'pan', 'center']) $(mode + 'Button').setAttribute('aria-pressed', String(!active && editor.mode === mode));
    $('draftBadge').textContent = waterPanel.editor.dirty ? '● WATER PREVIEW' : editor.dirty ? '● OUTLINE PREVIEW' : '● CITY PLAN';
    requestDraw();
    files?.changed();
  }
});
waterPanel.bind();
waterPanel.refresh(true);
const mapEditor = {
  get mode() {
    return waterPanel.editor.mode !== 'pan' ? waterPanel.editor.mode : editor.mode;
  },
  down: (...args) => waterPanel.editor.mode !== 'pan' ? waterPanel.run(() => waterPanel.editor.down(...args)) : editor.down(...args),
  move: (...args) => waterPanel.editor.mode !== 'pan' ? waterPanel.run(() => waterPanel.editor.move(...args)) : editor.move(...args),
  up: (...args) => (waterPanel.editor.dragging || waterPanel.editor.mode !== 'pan' ? waterPanel.editor : editor).up(...args),
  addPoint: (...args) => (waterPanel.editor.mode !== 'pan' ? waterPanel.editor : editor).addPoint(...args)
};
bindCanvasInteraction(canvas, camera, requestDraw, updateViewport, mapEditor, point => districtPanel.selectAt(point));
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewport);
else window.addEventListener('resize', resize);
resize();
const url = new URL(window.location.href);
$('seedInput').value = url.searchParams.get('seed') || 'mappo-001';
const size = url.searchParams.get('size');
if (['small', 'medium', 'large'].includes(size)) $('sizeInput').value = size;
const shape = url.searchParams.get('shape') || url.searchParams.get('morphology');
if (Object.hasOwn(SHAPE_DESCRIPTIONS, shape)) {
  $('morphologyInput').value = shape;
  $('presetInput').value = shape;
}
$('shapeDescription').textContent = SHAPE_DESCRIPTIONS[$('morphologyInput').value];
loadPreset();
generate();
fitMap();

function captureWorkspace() {
  return {
    project,
    workspace: {
      schemaVersion: 1,
      panels: {
        districts: Boolean($('districtPanel').open),
        fortifications: Boolean($('fortificationPanel').open),
        water: Boolean($('waterPanel').open)
      },
      waterEditor: {
        ...waterPanel.editor.snapshot(),
        controls: {
          seed: String($('waterSeedInput').value),
          width: String($('riverWidthInput').value),
          coastDirection: $('coastDirectionInput').value || 'east',
          coastSeed: String($('coastSeedInput').value)
        }
      },
      fortificationEditor: {
        ...fortificationPanel.editor.snapshot(),
        controls: {
          ...fortificationPanel.controls(),
          gateCount: String($('gateCountInput').value),
          towerSpacing: String($('towerSpacingInput').value)
        }
      },
      districtEditor: {
        ...districtPanel.editor.snapshot(),
        controls: {
          count: $('districtNumberInput').value,
          seed: $('districtSeedInput').value,
          name: $('districtNameInput').value,
          color: $('districtColorInput').value,
          target: $('districtTargetInput').value
        }
      },
      editor: {
        ...editor.snapshot(),
        history: copyJson(editor.history),
        mode: editor.closed ? editor.mode : 'points',
        error: editor.error
      },
      controls: {
        seed: $('seedInput').value,
        size: $('sizeInput').value,
        morphology: $('morphologyInput').value,
        preset: $('presetInput').value
      },
      view: {
        camera: {
          x: camera.x,
          y: camera.y,
          zoom: camera.zoom
        },
        layers: {
          ...layers
        },
        fitOnLoad: false
      }
    }
  };
}

function applyProjectDocument(document) {
  const next = copyJson(document.project),
    workspace = copyJson(document.workspace),
    draft = workspace.editor;
  project = next;
  editor.boundary = draft.boundary;
  editor.center = draft.center;
  editor.closed = draft.closed;
  editor.dirty = draft.dirty;
  editor.history = draft.history;
  editor.mode = !draft.closed ? 'points' : (['pan', 'edit', 'center'].includes(draft.mode) ? draft.mode : 'pan');
  editor.stroke = false;
  editor.dragging = -1;
  editor.selected = -1;
  for (const [id, value] of Object.entries({
      seedInput: workspace.controls.seed,
      sizeInput: workspace.controls.size,
      morphologyInput: workspace.controls.morphology,
      presetInput: workspace.controls.preset
    })) $(id).value = value;
  for (const key of ['buildings', 'properties', 'plots', 'districtColors', 'districtBorders', 'districtLabels', 'fortifications']) {
    layers[key] = workspace.view.layers[key] ?? false;
    $(key + 'Layer').checked = layers[key];
  }
  camera.x = workspace.view.camera.x;
  camera.y = workspace.view.camera.y;
  camera.zoom = workspace.view.camera.zoom;
  $('waterSeedInput').value = 'river';
  $('coastSeedInput').value = 'coast';
  $('riverWidthInput').value = '28';
  $('coastDirectionInput').value = 'east';
  waterPanel.editor.load(workspace.waterEditor, next.city);
  waterPanel.refresh(true);
  if (workspace.waterEditor?.controls) {
    if (workspace.waterEditor.controls.coastSeed === undefined && next.city.waterFeatures.length === 1 && next.city.waterFeatures[0].kind === 'coast') $('coastSeedInput').value = workspace.waterEditor.controls.seed;
    else $('waterSeedInput').value = workspace.waterEditor.controls.seed;
    if (workspace.waterEditor.controls.coastSeed !== undefined) $('coastSeedInput').value = workspace.waterEditor.controls.coastSeed;
    $('riverWidthInput').value = workspace.waterEditor.controls.width;
    $('coastDirectionInput').value = workspace.waterEditor.controls.coastDirection ?? 'east';
  }
  $('waterPanel').open = workspace.panels?.water ?? false;
  waterPanel.message(waterPanel.editor.dirty ? 'Loaded unfinished water edits. Generate city when ready to apply.' : 'Saved water and bridge geometry loaded exactly.');
  districtPanel.editor.load(workspace.districtEditor);
  districtPanel.refresh(true);
  const districtControls = workspace.districtEditor?.controls;
  if (districtControls)
    for (const [id, value] of Object.entries({
        districtNumberInput: districtControls.count,
        districtSeedInput: districtControls.seed,
        districtNameInput: districtControls.name,
        districtColorInput: districtControls.color,
        districtTargetInput: districtControls.target
      })) $(id).value = value;
  fortificationPanel.editor.load(workspace.fortificationEditor);
  fortificationPanel.refresh(true);
  const fortControls = workspace.fortificationEditor?.controls;
  if (fortControls) {
    $('wallsEnabledInput').checked = fortControls.enabled;
    $('gateCountInput').value = fortControls.gateCount;
    $('towerSpacingInput').value = fortControls.towerSpacing;
    $('fortificationSeedInput').value = fortControls.seed;
  }
  $('districtPanel').open = workspace.panels?.districts ?? Boolean(districtPanel.editor.selectedDistrictId);
  $('fortificationPanel').open = workspace.panels?.fortifications ?? true;
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[workspace.controls.morphology];
  editor.notify(draft.dirty ? 'Loaded city and unfinished outline edits. Generate only when ready to rebuild.' : 'Loaded city. Its exact saved geometry is ready to use.', Boolean(draft.error));
  updateDetails();
  updateViewport();
  requestDraw();
  if (workspace.view.fitOnLoad) fitMap();
  $('statusMessage').textContent = `Loaded ${next.city.buildings.length} buildings · ${next.city.properties.length} properties`;
}
files = new ProjectFiles({
  getElement: $,
  capture: captureWorkspace,
  apply: applyProjectDocument
});
files.bind();
files.start();
window.addEventListener('beforeunload', event => {
  if (files.needsUnloadWarning) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  files.flush().catch(() => {});
});
if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') files.flush().catch(() => {});
});
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    files.saveDownload();
  }
});

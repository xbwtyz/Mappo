import {
  LandscapeWorkspace
} from './ui/landscape.js';
import { BuildingWorkspace } from './ui/building-workspace.js';
import { PropertyWorkspace } from './ui/property-workspace.js';
import { IdentityWorkspace } from './ui/identity-workspace.js';
import { BuildingEditSession } from './editor/building.js';
import { buildingFrame } from './core/building-transform.js';
import {
  WorkspaceShell
} from './ui/workspace.js';
import {
  WorkspaceMenus
} from './ui/workspace-menus.js';
import {
  registerWorkspaceInspectors
} from './ui/workspace-inspectors.js';
import {
  terrainPrepare
} from './core/terrain-geometry.js';
import {
  validateTerrainDefinition
} from './core/terrain-model.js';
import {
  TerrainPanel
} from './ui/terrain.js';
import {
  prepareWater
} from './generators/water.js';
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
  DistrictWorkspace
} from './ui/district-workspace.js';
import {
  describePendingChanges,
  REBUILD_EFFECTS
} from './core/pending-changes.js';
import {
  describeUndoContext
} from './core/undo-context.js';
import {
  rebuildFailureMessage
} from './core/validation-feedback.js';
import {
  isMapShortcutEvent
} from './core/shortcut-scope.js';
import {
  WORKSPACE_DISCLOSURE_IDS
} from './core/workspace-presentation.js';
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
import { inspectBuildingPreview, prepareBuildingApply } from './editor/building-application.js';
import { BuildingGeometryHistory } from './editor/building-history.js';

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
  pan: 'Drag to pan · Click a property to inspect · Scroll to zoom',
  freehand: 'Drag an outline · Release to close · Space + drag to pan',
  points: 'Click corners · Click first point or press Enter to close',
  edit: 'Drag corners · Double-click an edge to add a point · Delete to remove',
  center: 'Click inside the outline to place the main square'
};
let project, drawPending = false;
let files;
let districtPanel;
let districtWorkspace;
let fortificationPanel;
let waterPanel;
let terrainPanel;
let workspaceShell;
let landscapeWorkspace;
let buildingWorkspace;
let buildingEditSession;
const buildingHistory = new BuildingGeometryHistory(20);
let propertyWorkspace;
let identityWorkspace;
const workspaceMenus = new WorkspaceMenus({
  getElement: $
});
workspaceMenus.bind();
const layers = {
  buildings: true,
  properties: false,
  plots: false,
  districtColors: true,
  districtBorders: true,
  districtLabels: true,
  fortifications: true
};

function updatePendingFeedback() {
  if (!project || !districtPanel || !fortificationPanel || !waterPanel || !terrainPanel) return;
  const status = describePendingChanges({
    project, outline: editor, water: waterPanel.editor, terrain: terrainPanel.editor,
    controls: {
      seed: $('seedInput').value, size: $('sizeInput').value,
      morphology: $('morphologyInput').value
    },
    districtEditor: districtPanel.editor,
    districtControls: {
      count: $('districtNumberInput').value, seed: $('districtSeedInput').value,
      name: $('districtNameInput').value, color: $('districtColorInput').value,
      target: $('districtTargetInput').value
    },
    defensePreview: fortificationPanel.syncPreview(),
    identityPending: identityWorkspace?.hasPending() ?? false
  });
  $('workspacePendingCount').textContent = status.count ? status.count + ' pending' : 'Up to date';
  $('workspacePendingCount').classList.toggle('pending', Boolean(status.count));
  $('workspacePendingDetails').textContent = status.count
    ? (status.city.length ? 'Rebuild pending: ' + status.city.join(', ') + '. ' : '')
      + (status.local.length ? 'Local updates: ' + status.local.join(', ') + '.' : '')
    : 'No unapplied city or local changes.';
  $('workspaceRebuildImpact').textContent = REBUILD_EFFECTS;
  $('workspaceRebuildImpact').classList.toggle('pending', status.cityPending);
  updateUndoFeedback();
}
function currentUndoContext() {
  if (buildingEditSession?.isActive && workspaceShell?.state.selection?.kind === 'building') {
    const id = buildingEditSession.buildingId;
    const available = !buildingEditSession.isPending && !buildingEditSession.drag && buildingHistory.can('undo',project,id);
    return {kind:'building',controlId:'buildingHistoryUndo',label:'Undo building',available,
      description: buildingEditSession.isPending ? 'Reset or Apply the preview before undoing accepted geometry.'
        : available ? 'Undo the last accepted edit to this building.' : 'No accepted building edit to undo.'};
  }
  return describeUndoContext({
    section: workspaceShell?.state.section ?? 'city',
    selection: workspaceShell?.state.selection ?? null,
    outline: editor,
    water: waterPanel?.editor, terrain: terrainPanel?.editor,
    district: districtPanel?.editor, defense: fortificationPanel?.editor,
    identity: identityWorkspace?.editor
  });
}
function updateUndoFeedback() {
  const scope = currentUndoContext();
  $('workspaceUndoButton').textContent = scope.label;
  $('workspaceUndoButton').disabled = !scope.available;
  $('workspaceUndoButton').setAttribute('title', scope.description);
  $('workspaceUndoDescription').textContent = scope.description;
}
function undoCurrentScope() {
  const scope = currentUndoContext();
  if (!scope.available) return false;
  const button = $(scope.controlId);
  if (typeof button.click === 'function') button.click();
  else button.handlers?.click?.(); // test DOM shim
  updateUndoFeedback();
  return true;
}
function workspaceChanged() {
  updatePendingFeedback();
  files?.changed();
}

function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    if (project) renderMap(canvas, camera, project, editor, layers, districtPanel?.editor.selectedDistrictId, waterPanel?.editor, terrainPanel?.editor, workspaceShell?.state.selection, landscapeWorkspace?.hover, buildingWorkspace?.hover, propertyWorkspace?.hover, buildingEditSession);
  });
}

// Accepted geometry history is scoped to the selected building and stays out of saves.
function syncBuildingHistoryUI() {
  const session = buildingEditSession;
  const id = session?.isActive ? session.buildingId : null;
  const ready = Boolean(id && !session.isPending && !session.drag);
  const undo = ready && buildingHistory.can('undo',project,id);
  const redo = ready && buildingHistory.can('redo',project,id);
  $('buildingHistoryUndo').disabled = !undo;
  $('buildingHistoryRedo').disabled = !redo;
  $('buildingHistoryStatus').textContent = !id ? '' : session.isPending
    ? 'Apply or reset your draft before using accepted-edit history.'
    : 'Session history · '+buildingHistory.count('undo',id)+' undo / '+buildingHistory.count('redo',id)+' redo available. Saved geometry survives reopening; history does not.';
  updateUndoFeedback();
}

// Preview controls show transient geometry; never write into project or its save envelope.
function syncBuildingTransformUI() {
  const session = buildingEditSession;
  const shown = Boolean(session?.isActive && project && session.source(project.city));
  $('buildingTransformPanel').hidden = !shown;
  syncBuildingHistoryUI();
  if (!shown) return;
  const frame = buildingFrame(session.source(project.city));
  const t = session.transform;
  $('buildingPreviewTarget').textContent = session.buildingId;
  for (const [id,value] of Object.entries({
    buildingOffsetX: t.dx, buildingOffsetY: t.dy,
    buildingAngle: t.angle*180/Math.PI, buildingWidth: frame.width*t.scaleX,
    buildingDepth: frame.height*t.scaleY
  })) $(id).value = Number(value.toFixed(2)).toString();
  for (const tool of ['Move','Rotate','Resize'])
    $('buildingTool'+tool).setAttribute('aria-pressed',String(session.tool===tool.toLowerCase()));
  const result = session.isPending
    ? inspectBuildingPreview(project,session.buildingId,t,Boolean(session.drag))
    : {ok:false,status:'idle',issues:[]};
  session.validation = result;
  const eligible = session.isPending && !session.drag && result.status==='valid';
  $('buildingPreviewApply').disabled = !eligible;
  $('buildingTransformPanel').setAttribute('data-validation',result.status);
  const issues = $('buildingPreviewIssues');
  issues.hidden = !result.issues.length;
  issues.replaceChildren(...result.issues.map(issue=>{
    const li=document.createElement('li');
    li.textContent=issue.message;
    return li;
  }));
  $('buildingPreviewStatus').textContent = !session.isPending
    ? 'Choose Move, Rotate or Resize. Only a validated, changed building can be applied.'
    : result.status==='checking'
      ? 'CHECKING · Fast geometry check complete; road access is verified when the drag ends.'
      : result.ok
        ? 'VALID PLACEMENT · Ready to Apply to City. Project compatibility will be rechecked.'
        : 'INVALID PLACEMENT · Apply is disabled. Adjust the preview to resolve the issues below.';
}
function confirmBuildingPreviewDiscard() {
  if (!buildingEditSession?.isPending) return true;
  return typeof window.confirm !== 'function' || window.confirm('Discard the unsaved building preview? The city remains unchanged.');
}
function applyBuildingTransform() {
  const session=buildingEditSession;
  if (!project || !session?.isActive || !session.isPending || session.drag
      || workspaceShell.state.selection?.kind !== 'building'
      || workspaceShell.state.selection.id !== session.buildingId) return false;
  const previous=project;
  const buildingId=session.buildingId, transform={...session.transform};
  let received;
  try {
    // Fresh computation. Never trust stale status from an earlier drag frame.
    received=prepareBuildingApply(previous,captureWorkspace().workspace,buildingId,transform);
    if(!received.ok){
      const issues=received.issues??[];
      session.validation=received;
      $('buildingPreviewApply').disabled=true;
      $('buildingTransformPanel').setAttribute('data-validation','invalid');
      $('buildingPreviewStatus').textContent='CANNOT APPLY · '+(issues[0]?.message??'Preview was rejected.');
      const list=$('buildingPreviewIssues');
      list.hidden=!issues.length;
      list.replaceChildren(...issues.map(issue=>{
        const li=document.createElement('li');
        li.textContent=issue.message;return li;
      }));
      requestDraw();
      return false;
    }
    // Commit one already-validated project object, preserving IDs and the
    // existing schema. Record and UI updates cannot affect pre-commit checks.
    if(project!==previous || session.buildingId!==buildingId) return false;
    if (!buildingHistory.record(previous,received.candidate,buildingId)) return false;
    project=received.candidate;
    session.reset();
    updateDetails();
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged(); // Mark the accepted city dirty for recovery/save.
    $('statusMessage').textContent='Applied validated footprint to '+buildingId+'. Download a project copy to keep this change.';
    return true;
  } catch(error){
    project=previous;
    $('buildingPreviewApply').disabled=true;
    $('buildingPreviewStatus').textContent='APPLY FAILED · Original city preserved. '+error.message;
    requestDraw();
    return false;
  }
}

function moveBuildingHistory(direction) {
  const session=buildingEditSession;
  if (!project || !session?.isActive || session.isPending || session.drag
      || workspaceShell?.state.selection?.kind !== 'building'
      || workspaceShell.state.selection.id !== session.buildingId) return false;
  const id=session.buildingId;
  const receipt=buildingHistory.prepare(project,captureWorkspace().workspace,id,direction);
  if (!receipt.ok) {
    $('buildingHistoryStatus').textContent=receipt.reason;
    syncBuildingHistoryUI();
    return false;
  }
  buildingHistory.accept(receipt.entry,direction);
  project=receipt.candidate;
  session.reset();
  updateDetails();
  workspaceShell.refresh();
  requestDraw();
  workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Undid':'Redid')+' accepted footprint edit for '+id+'. Download a project copy to keep it.';
  return true;
}

function exitBuildingEditing() {
  if (!buildingEditSession?.isActive) return true;
  if (!confirmBuildingPreviewDiscard()) return false;
  buildingEditSession.stop();
  if (Number.isFinite(window.innerWidth) && window.innerWidth <= 900 && workspaceShell?.state.selection?.kind === 'building'
    && workspaceShell.state.inspectorCollapsed) workspaceShell.dispatch({ type: 'inspector', collapsed: false });
  return true;
}
function updateMapIndicators() {
  clearMapHover();
  syncBuildingTransformUI();
  const terrainActive = terrainPanel && terrainPanel.editor.mode !== 'pan',
    waterActive = waterPanel && waterPanel.editor.mode !== 'pan',
    buildingActive = buildingEditSession?.isActive ?? false;
  canvas.classList.toggle('building-edit-mode', buildingActive);
  canvas.classList.toggle('drawing', Boolean(terrainActive || waterActive || editor.mode !== 'pan'));
  for (const mode of ['freehand', 'points', 'edit', 'pan', 'center']) $(mode + 'Button').setAttribute('aria-pressed', String(!terrainActive && !waterActive && editor.mode === mode));
  $('toolHint').textContent = buildingActive ? 'BUILDING EDIT · Move, Rotate, Resize · Space/middle drag pans · No geometry changes until validated Apply' : terrainActive ? (terrainPanel.editor.mode === 'move' ? 'Drag the mountain center marker' : terrainPanel.editor.mode === 'ridge' ? 'Drag peaks · Change selected peak height' : terrainPanel.editor.mode === 'shape' ? 'Drag foothills · Double-click to add · Delete to remove' : 'Click or drag a pass along the ridge') : waterActive ? (waterPanel.editor.mode === 'river' ? 'Drag water points · Double-click to add · Delete to remove' : waterPanel.editor.mode === 'lake-move' ? 'Drag the lake center marker' : waterPanel.editor.mode === 'bridge' ? 'Drag bridge markers · Delete to remove' : 'Click near the river to add a bridge') : TOOL_HINTS[editor.mode];
  $('draftBadge').textContent = buildingActive ? '● BUILDING EDIT MODE' : editor.dirty ? '● OUTLINE PREVIEW' : terrainPanel?.editor.dirty ? '● TERRAIN PREVIEW' : waterPanel?.editor.dirty ? '● WATER PREVIEW' : '● CITY PLAN';
}

function updateViewport() {
  clearMapHover();
  $('zoomValue').textContent = `${Math.round(camera.zoom*100)}%`;
  workspaceChanged();
}

function editorChanged() {
  if (editor.mode !== 'pan') buildingEditSession?.stop();
  clearMapHover();
  for (const mode of ['freehand', 'points', 'edit', 'pan', 'center']) $(mode + 'Button').setAttribute('aria-pressed', String(editor.mode === mode));
  if (editor.mode !== 'pan' && workspaceShell?.state.section !== 'city') workspaceShell?.navigate('city');
  if (editor.mode !== 'pan' && terrainPanel) terrainPanel.editor.setMode('pan');
  if (editor.mode !== 'pan' && waterPanel) waterPanel.editor.setMode('pan');
  $('toolHint').textContent = TOOL_HINTS[editor.mode];
  $('draftBadge').textContent = editor.dirty ? '● OUTLINE PREVIEW' : terrainPanel?.editor.dirty ? '● TERRAIN PREVIEW' : waterPanel?.editor.dirty ? '● WATER PREVIEW' : '● CITY PLAN';
  canvas.classList.toggle('drawing', editor.mode !== 'pan');
  $('undoButton').disabled = editor.history.length === 0;
  $('finishButton').disabled = editor.closed || editor.boundary.length < 3;
  requestDraw();
  workspaceChanged();
}
const editor = new OutlineEditor(editorChanged, (message, error) => {
  $('draftMessage').textContent = message;
  $('draftMessage').classList.toggle('error', error);
});

function fitMap() {
  const points = [...(!editor.dirty && project ? fortificationViewPoints(project.city) : editor.boundary.length > 2 ? editor.boundary : project?.city.survey.boundary) ?? []];
  const terrainPoints = terrainPanel?.editor.features.flatMap(f => f.path) ?? project?.city.terrainFeatures?.flatMap(f => f.path) ?? [];
  if (points) points.push(...terrainPoints);
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
      junctionCount: new Set(c.roads.filter(r => !r.waterBoundary && !r.terrainBoundary).flatMap(r => [r.a, r.b])).size,
      roadCount: c.roads.filter(r => !r.waterBoundary && !r.terrainBoundary).length,
      blockCount: c.blocks.length,
      laneCount: c.roads.filter(r => r.kind === 'lane').length,
      buildingCount: c.buildings.length,
      propertyCount: c.properties.length,
      mergedCount: c.properties.filter(p => p.plotIds.length > 1).length,
      plotCount: c.plots.length
    })) $(id).textContent = value;
}

function generate({ discardIdentities = false } = {}) {
  if (!discardIdentities && identityWorkspace)
    return identityWorkspace.requestRebuild(() => generate({ discardIdentities: true }));
  try {
    editor.validate();
    if (waterPanel?.editor.features.some(f => f.kind === 'river')) waterPanel.editor.width($('riverWidthInput').value);
    const tidiedWater = waterPanel?.editor.tidyWater(editor.boundary) ?? [];
    const next = createProject({
      seed: $('seedInput').value,
      size: $('sizeInput').value,
      morphology: $('morphologyInput').value,
      boundary: editor.boundary,
      center: editor.center,
      water: waterPanel?.editor.definition(),
      terrain: terrainPanel?.editor.definition(),
      districtCount: $('districtNumberInput').value || 'auto',
      fortifications: {
        enabled: $('wallsEnabledInput').checked,
        gateCount: $('gateCountInput').value || 4,
        towerSpacing: $('towerSpacingInput').value || 100,
        seed: $('fortificationSeedInput').value || $('seedInput').value
      }
    });
    buildingEditSession?.stop();
    identityWorkspace?.reset();
    propertyWorkspace?.refresh({ replaced: true });
    buildingWorkspace?.refresh({ replaced: true });
    clearMapHover();
    project = next;
    buildingHistory.clear(); // Rebuilding invalidates every accepted-building history entry.
    if (waterPanel) {
      waterPanel.editor.loadCity(next.city);
      waterPanel.editor.setMode('pan');
      waterPanel.refresh(true);
      waterPanel.message(tidiedWater.length ? `${tidiedWater.map(kind=>kind==='coast'?'Coastline':kind==='lake'?'Lake':'River').join(' and ')} handles were tidied automatically before generation. Undo water edit restores that draft.` : next.city.waterFeatures.length ? 'City generated around the saved water. Editing its shoreline or crossings creates a new draft.' : 'Dry city generated. Choose Add lake, Generate river or Generate coastline to preview water.');
    }
    if (terrainPanel) {
      terrainPanel.editor.loadCity(next.city);
      terrainPanel.editor.setMode('pan');
      terrainPanel.refresh(true);
      terrainPanel.message('City generated with saved mountain footprints, ridges and road passes.');
    }
    districtPanel?.editor.load();
    districtPanel?.refresh(true);
    fortificationPanel?.editor.load();
    fortificationPanel?.refresh(true);
    $('seedInput').value = project.seed;
    editor.load(project.city.survey.boundary, project.options.center, false);
    updateDetails();
    workspaceShell?.refresh();
    updateViewport();
    $('statusMessage').textContent = `${project.city.buildings.length} buildings · ${project.city.properties.length} properties · ${project.city.properties.filter(p=>p.plotIds.length>1).length} merged sites`;
    updatePendingFeedback();
  } catch (error) {
    const guidance = rebuildFailureMessage(error.message);
    editor.notify(guidance, true);
    if (waterPanel?.editor.dirty) waterPanel.message(guidance, true);
    if (terrainPanel?.editor.dirty) terrainPanel.message(guidance, true);
    $('statusMessage').textContent = 'Rebuild blocked — existing city unchanged.';
    updatePendingFeedback();
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
  editor.notify('Street settings changed. Rebuild city to apply them to this outline.');
  workspaceChanged();
}
for (const key of ['buildings', 'properties', 'plots', 'districtColors', 'districtBorders', 'districtLabels', 'fortifications']) {
  $(key + 'Layer').addEventListener('change', event => {
    layers[key] = event.target.checked;
    if (key === 'buildings' && layers.buildings === false) buildingEditSession?.stop();
    if (['buildings', 'properties', 'plots'].includes(key)) {
      clearMapHover();
      propertyWorkspace?.refresh();
      buildingWorkspace?.refresh();
    }
    requestDraw();
    workspaceChanged();
  });
}
$('freehandButton').addEventListener('click', () => editor.start('freehand'));
$('pointsButton').addEventListener('click', () => editor.start('points'));
$('editButton').addEventListener('click', () => {
  editor.setMode('edit');
  editor.notify('Drag outline points. Double-click an edge to add a point.');
});
$('panButton').addEventListener('click', () => {
  if (!exitBuildingEditing()) return;
  terrainPanel?.editor.setMode('pan');
  waterPanel?.editor.setMode('pan');
  editor.setMode('pan');
});
$('centerButton').addEventListener('click', () => editor.setMode('center'));
$('finishButton').addEventListener('click', () => editor.finish());
$('undoButton').addEventListener('click', () => editor.undo());
$('workspaceUndoButton').addEventListener('click', undoCurrentScope);
$('cancelButton').addEventListener('click', () => {
  if (!project) return;
  editor.remember();
  editor.load(project.city.survey.boundary, project.options.center, false);
  $('seedInput').value = project.seed;
  $('sizeInput').value = project.options.size;
  $('morphologyInput').value = project.options.morphology;
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[project.options.morphology];
  workspaceChanged();
});
$('presetButton').addEventListener('click', loadPreset);
$('presetInput').addEventListener('change', () => files?.changed());
$('generateButton').addEventListener('click', generate);
$('newSeedButton').addEventListener('click', () => {
  const rebuild = () => {
  const v = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(v);
  else {
    v[0] = Date.now() >>> 0;
    v[1] = Math.random() * 2 ** 32;
  }
  $('seedInput').value = `${v[0].toString(36)}-${v[1].toString(36)}`;
  generate({ discardIdentities: true });
  };
  if (identityWorkspace) identityWorkspace.requestRebuild(rebuild);
  else rebuild();
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
  if (!isMapShortcutEvent(e, document.activeElement)) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    if (buildingEditSession?.isActive && moveBuildingHistory('redo')) e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
    if (undoCurrentScope()) e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter' && workspaceShell?.state.section === 'city' && editor.mode === 'points') {
    e.preventDefault();
    editor.finish();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (workspaceShell?.state.section === 'landscape' && terrainPanel?.editor.mode !== 'pan') terrainPanel.editor.removePoint();
    else if (workspaceShell?.state.section === 'landscape' && waterPanel?.editor.mode !== 'pan') waterPanel.editor.removePoint();
    else if (workspaceShell?.state.section === 'city') editor.removePoint();
  }
  if (e.key === 'Escape') {
    if (!exitBuildingEditing()) return;
    stopWorkspaceTools();
    e.preventDefault();
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
    workspaceChanged();
  },
  commit: city => {
    // Rebuilding/undoing districts is a local update. Keep a valid property or
    // building in the Inspector rather than adopting the editor's default ward.
    if (['property', 'building'].includes(workspaceShell?.state.selection?.kind)) {
      districtPanel.editor.selectedDistrictId = null;
      districtPanel.editor.selectedBlockId = null;
    }
    project = {
      ...project,
      city
    };
    updateDetails();
    workspaceShell?.refresh();
    requestDraw();
    workspaceChanged();
  },
  changed: () => {
    syncWorkspaceDistrictSelection();
    requestDraw();
    workspaceChanged();
  }
});
districtPanel.bind();
districtWorkspace = new DistrictWorkspace({
  getElement: $,
  getCity: () => project?.city,
  panel: districtPanel,
  getShell: () => workspaceShell
});
districtPanel.onRefresh = () => districtWorkspace.render();
districtPanel.onMapSelect = () => districtWorkspace.reveal();
fortificationPanel = new FortificationPanel({
  getElement: $,
  getCity: () => project.city,
  commit: city => {
    project = {
      ...project,
      city
    };
    workspaceShell?.refresh();
    requestDraw();
    workspaceChanged();
  },
  changed: () => files?.changed(),
  activateLayer: () => {
    layers.fortifications = true;
    $('fortificationsLayer').checked = true;
    fitMap();
    workspaceChanged();
  }
});
fortificationPanel.bind();
for (const id of ['districtPanel', 'fortificationPanel', 'waterPanel', 'terrainPanel']) $(id).addEventListener('toggle', () => files?.changed());

waterPanel = new WaterPanel({
  getElement: $,
  getCity: () => project.city,
  getBoundary: () => {
    editor.validate();
    return editor.boundary;
  },
  getCenter: () => editor.center,
  validateComposition: water => {
    const terrain = terrainPrepare(terrainPanel?.editor.definition());
    if (terrain.features.length) validateTerrainDefinition(terrain.features, terrain.passes, editor.boundary, editor.center, water);
  },
  activate: () => {
    editor.setMode('pan');
    terrainPanel?.editor.setMode('pan');
    workspaceShell?.navigate('landscape');
    if (waterPanel.editor.activeFeature()) workspaceShell?.select({
      kind: 'water',
      id: waterPanel.editor.activeFeature().id
    });
    $('waterPanel').open = true;
  },
  changed: () => {
    landscapeWorkspace?.editorChanged('water');
    workspaceShell?.refresh();
    updateMapIndicators();
    requestDraw();
    workspaceChanged();
  }
});
waterPanel.bind();
waterPanel.refresh(true);
terrainPanel = new TerrainPanel({
  getElement: $,
  getCity: () => project?.city,
  getBoundary: () => {
    editor.validate();
    return editor.boundary;
  },
  getCenter: () => editor.center,
  getWater: () => prepareWater(waterPanel.editor.definition()),
  activate: () => {
    editor.setMode('pan');
    waterPanel.editor.setMode('pan');
    workspaceShell?.navigate('landscape');
    if (terrainPanel.editor.activeFeature()) workspaceShell?.select({
      kind: 'terrain',
      id: terrainPanel.editor.activeFeature().id
    });
    $('terrainPanel').open = true;
  },
  changed: () => {
    landscapeWorkspace?.editorChanged('terrain');
    workspaceShell?.refresh();
    updateMapIndicators();
    requestDraw();
    workspaceChanged();
  }
});
terrainPanel.bind();
terrainPanel.refresh(true);

function syncWorkspaceDistrictSelection() {
  const id = districtPanel?.editor.selectedDistrictId;
  if (id) {
    if (workspaceShell && workspaceShell.state.section !== 'districts') workspaceShell.navigate('districts');
    workspaceShell?.select({ kind: 'district', id });
  } else if (workspaceShell?.state.selection?.kind === 'district') workspaceShell.select(null, {
    reveal: false
  });
  districtWorkspace?.render();
}

function stopWorkspaceTools(targetSection = null) {
  if (targetSection !== 'city') buildingEditSession?.stop();
  clearMapHover();
  // Cancel only a tool whose controls are leaving the visible section.
  // Completed drafts and their histories stay with the original editors.
  if (targetSection !== 'landscape') {
    if (terrainPanel?.editor.dragging) terrainPanel.editor.up(camera.zoom, true);
    if (waterPanel?.editor.dragging) waterPanel.editor.up(camera.zoom, true);
    if (terrainPanel?.editor.mode !== 'pan') terrainPanel?.editor.setMode('pan');
    if (waterPanel?.editor.mode !== 'pan') waterPanel?.editor.setMode('pan');
  }
  if (targetSection !== 'city') {
    if (editor.stroke || editor.dragging >= 0) editor.up(camera.zoom, true);
    if (editor.mode !== 'pan') editor.setMode('pan');
  }
  updateMapIndicators();
}
workspaceShell = registerWorkspaceInspectors(new WorkspaceShell({
  getElement: $,
  onNavigate: (previous, next) => stopWorkspaceTools(next),
  onLayout: () => resize(),
  changed: () => {
    workspaceChanged();
    requestDraw();
  },
  onInspect: () => {
    clearMapHover();
    landscapeWorkspace?.render();
    districtWorkspace?.render();
    identityWorkspace?.render();
  },
  clearSelection: () => {
    buildingEditSession?.stop();
    stopWorkspaceTools();
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
    requestDraw();
  }
}), {
  getCity: () => project?.city,
  getDistrictPanel: () => districtPanel,
  getWaterPanel: () => waterPanel,
  getTerrainPanel: () => terrainPanel
});
landscapeWorkspace = new LandscapeWorkspace({
  getElement: $,
  shell: workspaceShell,
  water: waterPanel,
  terrain: terrainPanel,
  stopTools: stopWorkspaceTools,
  onSelect: () => {
    buildingEditSession?.stop();
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  },
  changed: () => files?.changed(),
  draw: requestDraw
});
buildingEditSession = new BuildingEditSession(() => {
  updateMapIndicators();
  workspaceShell?.refresh();
  requestDraw();
});
function enterBuildingEditing(id) {
  if (!project) return false;
  if (workspaceShell.state.section !== 'city') workspaceShell.navigate('city');
  stopWorkspaceTools('city');
  if (editor.mode !== 'pan') editor.setMode('pan');
  const started = buildingEditSession.start(project.city, layers, id);
  // On narrow screens the Inspector is a map-covering drawer. Clear the map
  // before showing draggable controls, then reopen the Inspector on exit.
  if (started && Number.isFinite(window.innerWidth) && window.innerWidth <= 900)
    workspaceShell.dispatch({ type: 'inspector', collapsed: true });
  return started;
}
buildingWorkspace = new BuildingWorkspace({
  shell: workspaceShell,
  getCity: () => project?.city,
  getLayers: () => layers,
  getProperties: () => propertyWorkspace,
  getEditSession: () => buildingEditSession,
  enterEditing: enterBuildingEditing,
  exitEditing: exitBuildingEditing,
  confirmPreviewDiscard: confirmBuildingPreviewDiscard,
  onSelect: () => {
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  },
  draw: requestDraw
});
propertyWorkspace = new PropertyWorkspace({
  shell: workspaceShell,
  getCity: () => project?.city,
  getLayers: () => layers,
  buildings: buildingWorkspace,
  exitEditing: exitBuildingEditing,
  onSelect: () => {
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  },
  draw: requestDraw
});
identityWorkspace = new IdentityWorkspace({
  getElement: $, shell: workspaceShell, getCity: () => project?.city,
  commit: city => {
    project = { ...project, city };
    updateDetails(); workspaceShell.refresh(); requestDraw();
  },
  changed: workspaceChanged
});
identityWorkspace.bind();
workspaceShell.bind();
landscapeWorkspace.bind();
for (const tool of ['Move','Rotate','Resize'])
  $('buildingTool'+tool).addEventListener('click',()=>buildingEditSession.setTool(tool.toLowerCase()));
const buildingPreviewInputs = {
  buildingOffsetX: (v,frame) => ({dx:v}),
  buildingOffsetY: (v,frame) => ({dy:v}),
  buildingAngle: (v,frame) => ({angle:v*Math.PI/180}),
  buildingWidth: (v,frame) => ({scaleX:v/frame.width}),
  buildingDepth: (v,frame) => ({scaleY:v/frame.height})
};
for (const [id,convert] of Object.entries(buildingPreviewInputs))
  $(id).addEventListener('change',()=>{
    if (!buildingEditSession?.isActive || !project) return;
    const n=Number($(id).value), frame=buildingFrame(buildingEditSession.source(project.city));
    if ($(id).value==='' || !Number.isFinite(n) || !buildingEditSession.setTransform(convert(n,frame))) {
      $('buildingPreviewStatus').textContent='Invalid preview value. Width and depth must stay within 20–400% of the original.';
      $(id).value='';
    }
  });
$('buildingPreviewReset').addEventListener('click',()=>{
  if (confirmBuildingPreviewDiscard()) buildingEditSession.reset();
});
$('buildingPreviewCancel').addEventListener('click',exitBuildingEditing);
$('buildingPreviewApply').addEventListener('click',applyBuildingTransform);
$('buildingHistoryUndo').addEventListener('click',()=>moveBuildingHistory('undo'));
$('buildingHistoryRedo').addEventListener('click',()=>moveBuildingHistory('redo'));

const mapPanEditor = { mode: 'pan', down() {}, move() {}, up() {}, addPoint() {} };
// An editor cannot receive map input unless its section is visible.
// Even corrupted/older saved modes cannot activate hidden draft tools.
const activeMapEditor = () => workspaceShell.state.section === 'landscape'
  ? (terrainPanel.editor.mode !== 'pan' ? terrainPanel.editor : waterPanel.editor.mode !== 'pan' ? waterPanel.editor : mapPanEditor)
  : workspaceShell.state.section === 'city' ? editor : mapPanEditor;
const runMapEdit = (method, args) => {
  const active = activeMapEditor();
  return active === waterPanel.editor ? waterPanel.run(() => active[method](...args)) : active === terrainPanel.editor ? terrainPanel.run(() => active[method](...args)) : active[method](...args);
};
const mapEditor = {
  get mode() {
    return activeMapEditor().mode;
  },
  down: (...args) => runMapEdit('down', args),
  move: (...args) => runMapEdit('move', args),
  up: (...args) => (workspaceShell.state.section === 'landscape' && terrainPanel.editor.dragging ? terrainPanel.editor
    : workspaceShell.state.section === 'landscape' && waterPanel.editor.dragging ? waterPanel.editor : activeMapEditor()).up(...args),
  addPoint: (...args) => activeMapEditor().addPoint(...args)
};

bindCanvasInteraction(canvas, camera, requestDraw, updateViewport, mapEditor, point => {
  if (buildingEditSession?.isActive) {
    const building = buildingWorkspace.hit(point, camera.zoom);
    if (building && buildingEditSession.allows(project?.city, layers, building.id)) buildingWorkspace.select(building);
    return; // Other properties and non-roof land do not steal the active edit context.
  }
  const hit = landscapeWorkspace.hit(point, camera.zoom);
  if (hit) {
    landscapeWorkspace.select(hit, {
      fromMap: true
    });
  } else if (!propertyWorkspace.select(propertyWorkspace.hit(point, camera.zoom))) {
    districtPanel.selectAt(point);
    if (!districtPanel.editor.selectedDistrictId) workspaceShell.clear();
  }
}, point => {
  if (buildingEditSession?.isActive) {
    landscapeWorkspace.setHover(null);
    propertyWorkspace.setHover(null);
    const building = buildingWorkspace.hit(point, camera.zoom);
    const allowed = building && buildingEditSession.allows(project?.city, layers, building.id);
    buildingWorkspace.setHover(allowed ? building : null);
    canvas.classList.toggle('feature-hover', Boolean(allowed));
    return;
  }
  const hit = landscapeWorkspace.hit(point, camera.zoom);
  landscapeWorkspace.setHover(hit);
  const propertyHit = hit ? null : propertyWorkspace.hit(point, camera.zoom);
  propertyWorkspace.setHover(propertyHit);
  canvas.classList.toggle('feature-hover', Boolean(hit || propertyHit));
}, {
  begin: (point,zoom) => Boolean(buildingEditSession?.isActive && buildingEditSession.beginGesture(project?.city,layers,point,zoom)),
  move: point => buildingEditSession?.moveGesture(point),
  end: cancelled => buildingEditSession?.endGesture(cancelled)
});
function clearMapHover() {
  landscapeWorkspace?.setHover(null);
  buildingWorkspace?.setHover(null);
  propertyWorkspace?.setHover(null);
  canvas.classList.toggle('feature-hover', false);
}
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
      ui: {
        ...workspaceShell.snapshot(),
        disclosures: Object.fromEntries(WORKSPACE_DISCLOSURE_IDS.map(id => [id, Boolean($(id).open)])),
        landscape: landscapeWorkspace.snapshotUI(),
        districts: districtPanel.snapshotUI()
      },
      panels: {
        districts: Boolean($('districtPanel').open),
        fortifications: Boolean($('fortificationPanel').open),
        water: Boolean($('waterPanel').open),
        terrain: Boolean($('terrainPanel').open)
      },
      terrainEditor: {
        ...terrainPanel.editor.snapshot(),
        controls: terrainPanel.controls()
      },
      waterEditor: {
        ...waterPanel.editor.snapshot(),
        controls: {
          seed: String($('waterSeedInput').value),
          width: String($('riverWidthInput').value),
          coastDirection: $('coastDirectionInput').value || 'east',
          coastSeed: String($('coastSeedInput').value),
          lakeSeed: String($('lakeSeedInput').value),
          lakeId: waterPanel.selectedLakeId || '',
          lakeRadius: String($('lakeRadiusInput').value)
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
        landscapeSelection: ['water', 'terrain'].includes(workspaceShell.state.selection?.kind) ? {
          ...workspaceShell.state.selection
        } : null,
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
  landscapeWorkspace.restoring = true;
  const next = copyJson(document.project),
    workspace = copyJson(document.workspace),
    draft = workspace.editor;
  buildingEditSession?.stop();
  identityWorkspace.reset();
  propertyWorkspace.refresh({ replaced: true });
  buildingWorkspace.refresh({ replaced: true });
  clearMapHover();
  project = next;
  buildingHistory.clear(); // History does not travel with portable or recovery files.
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
  $('lakeSeedInput').value = 'lake';
  $('lakeRadiusInput').value = '28';
  $('waterSeedInput').value = 'river';
  $('coastSeedInput').value = 'coast';
  $('riverWidthInput').value = '28';
  $('coastDirectionInput').value = 'east';
  waterPanel.editor.load(workspace.waterEditor, next.city);
  waterPanel.selectedLakeId = workspace.waterEditor?.controls?.lakeId ?? null;
  waterPanel.refresh(true);
  if (workspace.waterEditor?.controls) {
    if (workspace.waterEditor.controls.coastSeed === undefined && next.city.waterFeatures.length === 1 && next.city.waterFeatures[0].kind === 'coast') $('coastSeedInput').value = workspace.waterEditor.controls.seed;
    else $('waterSeedInput').value = workspace.waterEditor.controls.seed;
    if (workspace.waterEditor.controls.coastSeed !== undefined) $('coastSeedInput').value = workspace.waterEditor.controls.coastSeed;
    if (workspace.waterEditor.controls.lakeSeed !== undefined) $('lakeSeedInput').value = workspace.waterEditor.controls.lakeSeed;
    if (workspace.waterEditor.controls.lakeRadius !== undefined) $('lakeRadiusInput').value = workspace.waterEditor.controls.lakeRadius;
    $('riverWidthInput').value = workspace.waterEditor.controls.width;
    $('coastDirectionInput').value = workspace.waterEditor.controls.coastDirection ?? 'east';
  }
  terrainPanel.editor.load(workspace.terrainEditor, next.city);
  terrainPanel.refresh(true);
  if (workspace.terrainEditor?.controls)
    for (const [key, id] of [
        ['seed', 'terrainSeedInput'],
        ['size', 'terrainSizeInput'],
        ['height', 'terrainHeightInput'],
        ['placement', 'terrainPlacementInput']
      ]) $(id).value = workspace.terrainEditor.controls[key];
  $('terrainPanel').open = workspace.panels?.terrain ?? false;
  terrainPanel.message(terrainPanel.editor.dirty ? 'Loaded unfinished mountain edits. Generate city to apply.' : 'Saved mountain geometry loaded exactly.');
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
  fortificationPanel.syncPreview();
  $('districtPanel').open = workspace.panels?.districts ?? Boolean(districtPanel.editor.selectedDistrictId);
  $('fortificationPanel').open = workspace.panels?.fortifications ?? true;
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[workspace.controls.morphology];
  const legacySelection = terrainPanel.editor.mode !== 'pan' && terrainPanel.editor.activeFeature() ? {
    kind: 'terrain',
    id: terrainPanel.editor.activeFeature().id
  } : waterPanel.editor.mode !== 'pan' && waterPanel.editor.activeFeature() ? {
    kind: 'water',
    id: waterPanel.editor.activeFeature().id
  } : districtPanel.editor.selectedDistrictId ? {
    kind: 'district',
    id: districtPanel.editor.selectedDistrictId
  } : null;
  const savedSelection = workspace.view.landscapeSelection;
  if (savedSelection && !landscapeWorkspace.record(savedSelection)) {
    // A stale reference must not leave a restored tool editing a different,
    // hidden feature. Definitions and pending fields remain loaded exactly.
    waterPanel.editor.setMode('pan');
    terrainPanel.editor.setMode('pan');
  }
  const restoredSelection = savedSelection !== undefined ? (landscapeWorkspace.record(savedSelection) ? savedSelection : districtPanel.editor.selectedDistrictId ? {
    kind: 'district',
    id: districtPanel.editor.selectedDistrictId
  } : null) : legacySelection;
  if (restoredSelection?.kind === 'water') {
    waterPanel.editor.selectFeature(restoredSelection.id);
    if (waterPanel.editor.activeFeature()?.kind === 'lake') waterPanel.selectedLakeId = restoredSelection.id;
    waterPanel.refresh();
  }
  if (restoredSelection?.kind === 'terrain') {
    terrainPanel.editor.select(restoredSelection.id);
    terrainPanel.refresh();
  }
  landscapeWorkspace.restoreUI(workspace.ui?.landscape);
  districtPanel.restoreUI(workspace.ui?.districts);
  const savedUISelection = workspace.ui?.selection;
  // A stale legacy landscape reference invalidates any conflicting saved
  // presentation selection; never resurrect a different feature by accident.
  const staleLegacySelection = Boolean(savedSelection && !landscapeWorkspace.record(savedSelection));
  const isValidSelection = ref => {
    if (ref?.kind === 'district') return next.city.districts.some(d => d.id === ref.id);
    if (ref?.kind === 'property') return Boolean(propertyWorkspace.record(ref));
    if (ref?.kind === 'building') {
      const building = buildingWorkspace.record(ref);
      return Boolean(building && propertyWorkspace.propertyForBuilding(building));
    }
    if (['water', 'terrain'].includes(ref?.kind)) return Boolean(landscapeWorkspace.record(ref));
    return ref?.kind === 'landscape-add' && landscapeWorkspace.available(ref.id);
  };
  const selectedUIRef = staleLegacySelection ? null
    : workspace.ui && Object.hasOwn(workspace.ui, 'selection')
      ? (savedUISelection && isValidSelection(savedUISelection) ? savedUISelection : null)
      : restoredSelection;
  if (selectedUIRef?.kind === 'district' && districtPanel.editor.selectedDistrictId !== selectedUIRef.id) {
    districtPanel.editor.selectedDistrictId = selectedUIRef.id;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  }
  if (selectedUIRef?.kind === 'water') {
    waterPanel.editor.selectFeature(selectedUIRef.id);
    waterPanel.refresh();
  }
  if (selectedUIRef?.kind === 'terrain') {
    terrainPanel.editor.select(selectedUIRef.id);
    terrainPanel.refresh();
  }
  workspaceShell.reset({
    section: selectedUIRef?.kind === 'district' ? 'districts' : ['property', 'building'].includes(selectedUIRef?.kind) || !selectedUIRef ? 'city' : 'landscape',
    selection: selectedUIRef,
    ui: workspace.ui
  });
  if (['water', 'terrain', 'landscape-add'].includes(selectedUIRef?.kind))
    landscapeWorkspace.loadControls(selectedUIRef);
  landscapeWorkspace.render();
  for (const id of WORKSPACE_DISCLOSURE_IDS)
    if (workspace.ui?.disclosures?.[id] !== undefined)
      $(id).open = workspace.ui.disclosures[id];
  editor.notify(draft.dirty ? 'Loaded city and unfinished outline edits. Generate only when ready to rebuild.' : 'Loaded city. Its exact saved geometry is ready to use.', Boolean(draft.error));
  updateDetails();
  updateViewport();
  requestDraw();
  if (workspace.view.fitOnLoad) fitMap();
  $('statusMessage').textContent = `Loaded ${next.city.buildings.length} buildings · ${next.city.properties.length} properties`;
  updatePendingFeedback();
}
files = new ProjectFiles({
  getElement: $,
  capture: captureWorkspace,
  apply: applyProjectDocument,
  onStatus: state => workspaceMenus.projectStatus(state)
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

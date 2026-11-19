// A1 foundation APIs are bundled for the later road inspector; no editor hooks yet.
import { buildRoadGraph, analyzeRoadGraph, proposeJunctionMove } from './core/road-graph.js';
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
import { copyJson, projectFilename } from './data/project-format.js';
import { LAYER_KEYS_4F,layerPreset4F,identifyLayerPreset4F } from './core/layer-presets-4f.js';
import { exportFilename4F } from './core/export-filenames-4f.js';
import { downloadMapPNG4F } from './data/png-export-4f.js';
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
import { BuildingPlacementSession3H, buildingLocalPoint3H, prepareBuildingStructure3H } from './editor/building-structures.js';
import { BuildingStructureHistory3H } from './editor/building-structure-history.js';
import { PropertyEditSession3I } from './editor/property-edit.js';
import { inspectPropertyEdit3I, preparePropertyApply3I } from './editor/property-application.js';
import { PropertyGeometryHistory3I } from './editor/property-history.js';
import { preparePropertyDeletion4A, PropertyDeletionHistory4A } from './editor/property-deletion.js';
import { preparePropertyBuildingClear4E } from './editor/property-building-clear-4e.js';
import { describeStructureChange4E } from './core/structure-history-feedback-4e.js';
import { pointInPolygon } from './core/geometry.js';
import { focusCameraOnSelection4B } from './core/selection-focus-4b.js';
import { formatEditIssue4D } from './core/inspector-feedback-4d.js';
import {
  nudgeBuilding4C, nudgePropertyCorner4C, nudgeStructure4C,
  buildingMeasurements4C, propertyMeasurements4C, placementMeasurements4C,
  formatPrecision4C
} from './core/editing-precision-4c.js';

// A2 face identity APIs remain read-only behind the A4 preview.
import { extractRoadFaces, matchExistingFaces } from './core/road-faces.js';

// A3 owns classification; A4 only presents its reports.
import { analyzeRoadImpact, inspectJunctionImpact } from './core/road-impact.js';

import { RoadInspectionWorkspace } from './ui/road-inspection.js';
import { drawRoadInspectionOverlay } from './renderer/road-inspection.js';
// B1 candidate API is compiled for later editor integration; no Apply or UI hooks.
import { prepareRoadReconciliationB1 } from './core/road-reconciliation.js';

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
const buildingStructureHistory = new BuildingStructureHistory3H(20);
const propertyHistory = new PropertyGeometryHistory3I(20);
const propertyDeletionHistory4A = new PropertyDeletionHistory4A(20);
let buildingPlacementSession;
let propertyEditSession;
let propertyWorkspace;
let identityWorkspace;
let roadWorkspace;
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
  if(roadWorkspace?.active)return {kind:'road-preview',controlId:'roadPreviewReset',label:'Reset roads',
    available:roadWorkspace.session.pending,description:'Reset temporary junction coordinates; accepted roads have no edits to undo.'};
  if(propertyEditSession?.isActive){
    const id=propertyEditSession.propertyId;
    const available=!propertyEditSession.isPending&&!propertyEditSession.drag&&propertyHistory.can('undo',project,id);
    return {kind:'property',controlId:'propertyHistoryUndo3I',label:'Undo property',available,
      description:propertyEditSession.isPending
        ? 'Apply or reset your parcel draft before Undo.'
        : available?'Undo the last accepted property and plot edit.':'No accepted property edit to undo.'};
  }
  const structuralProperty=structureHistoryProperty3H();
  if (!buildingEditSession?.isActive && !buildingPlacementSession?.isActive
      && structuralProperty && buildingStructureHistory.can('undo',project,structuralProperty)) {
    const action=describeStructureChange4E(buildingStructureHistory.entry('undo',structuralProperty),'undo');
    return {kind:'structure',controlId:'structureUndo',
      label:action?.label??'Undo structure',available:true,
      description:action?.description??'Undo the last structural edit on this property.'};
  }
  if (buildingEditSession?.isActive && workspaceShell?.state.selection?.kind === 'building') {
    const id = buildingEditSession.buildingId;
    const available = !buildingEditSession.isPending && !buildingEditSession.drag && buildingHistory.can('undo',project,id);
    return {kind:'building',controlId:'buildingHistoryUndo',label:'Undo building',available,
      description: buildingEditSession.isPending ? 'Reset or Apply the preview before undoing accepted geometry.'
        : available ? 'Undo the last accepted edit to this building.' : 'No accepted building edit to undo.'};
  }
  if (propertyDeletionHistory4A.can('undo',project)
      && !propertyEditSession?.isActive && !buildingPlacementSession?.isActive && !buildingEditSession?.isActive)
    return {kind:'property-deletion',controlId:'propertyDeletionUndo4A',label:'Undo deletion',available:true,
      description:'Restore the last deleted property, its plots and buildings.'};
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
  if(roadWorkspace?.transient){syncPropertyDeletionControls4A();updateUndoFeedback();return;}
  syncPropertyDeletionControls4A();
  updatePendingFeedback();
  files?.changed();
}

function syncPropertyDeletionControls4A() {
  const busy=Boolean(roadWorkspace?.active || propertyEditSession?.isActive || buildingPlacementSession?.isActive || buildingEditSession?.isActive);
  for(const [direction,id] of [['undo','propertyDeletionUndo4A'],['redo','propertyDeletionRedo4A']]) {
    const available=propertyDeletionHistory4A.can(direction,project);
    const button=$(id);
    button.hidden=!available;
    button.disabled=busy||!available;
    button.title=direction==='undo'?'Restore the last deleted property, plots and buildings':'Delete the property again';
  }
}
function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    if (project) {
      const roadMode=roadWorkspace?.active;
      renderMap(canvas, camera, project, roadMode?null:editor, layers, districtPanel?.editor.selectedDistrictId, roadMode?null:waterPanel?.editor, roadMode?null:terrainPanel?.editor, roadMode?null:workspaceShell?.state.selection, roadMode?null:landscapeWorkspace?.hover, roadMode?null:buildingWorkspace?.hover, roadMode?null:propertyWorkspace?.hover, buildingEditSession, buildingPlacementSession, propertyEditSession);
      drawRoadInspectionOverlay(canvas,camera,project.city,roadWorkspace?.session);
    }
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
  const measured=buildingMeasurements4C(project.city,session);
  if(measured) $('buildingPreviewMeasurements4C').textContent=
    'Width '+formatPrecision4C(measured.width)+' · Depth '+formatPrecision4C(measured.depth)+
    ' · Area '+formatPrecision4C(measured.area)+' (Δ '+formatPrecision4C(measured.areaDelta)+')'+
    ' · Center '+formatPrecision4C(measured.x)+', '+formatPrecision4C(measured.y)+
    ' · Offset '+formatPrecision4C(measured.dx)+', '+formatPrecision4C(measured.dy);
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
    li.textContent=formatEditIssue4D(issue,{
      buildingId:session.buildingId,propertyId:session.propertyId,
      frontageRoadId:session.source(project.city)?.frontageRoadId
    });
    return li;
  }));
  $('buildingPreviewStatus').textContent = !session.isPending
    ? 'Choose Move, Rotate or Resize. Only a validated, changed building can be applied.'
    : result.status==='checking'
      ? 'CHECKING · Fast geometry check complete; road access is verified when the drag ends.'
      : result.ok
        ? 'VALID PLACEMENT · Ready to Apply to City. Project compatibility will be rechecked.'
        : 'INVALID PLACEMENT · Apply disabled. '+formatEditIssue4D(result.issues?.[0],{
          buildingId:session.buildingId,propertyId:session.propertyId,
          frontageRoadId:session.source(project.city)?.frontageRoadId
        });
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
      $('buildingPreviewStatus').textContent='CANNOT APPLY · '+formatEditIssue4D(issues[0],{
        buildingId:session.buildingId,propertyId:session.propertyId,
        frontageRoadId:session.source(project.city)?.frontageRoadId
      });
      const list=$('buildingPreviewIssues');
      list.hidden=!issues.length;
      list.replaceChildren(...issues.map(issue=>{
        const li=document.createElement('li');
        li.textContent=formatEditIssue4D(issue,{
          buildingId:session.buildingId,propertyId:session.propertyId,
          frontageRoadId:session.source(project.city)?.frontageRoadId
        });return li;
      }));
      syncMapEditDiagnostic4D();
      requestDraw();
      return false;
    }
    // Commit one already-validated project object, preserving IDs and the
    // existing schema. Record and UI updates cannot affect pre-commit checks.
    if(project!==previous || session.buildingId!==buildingId) return false;
    if (!buildingHistory.record(previous,received.candidate,buildingId)) return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
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
  propertyHistory.clear();
  propertyDeletionHistory4A.clear();
  project=receipt.candidate;
  session.reset();
  updateDetails();
  workspaceShell.refresh();
  requestDraw();
  workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Undid':'Redid')+' accepted footprint edit for '+id+'. Download a project copy to keep it.';
  return true;
}

// 3H manages building records only within a selected parent property.
function structureHistoryProperty3H() {
  if(buildingPlacementSession?.isActive)return buildingPlacementSession.propertyId;
  const selected=workspaceShell?.state.selection;
  if(selected?.kind==='property')return selected.id;
  if(selected?.kind==='building')return project?.city?.buildings.find(b=>b.id===selected.id)?.propertyId??null;
  return null;
}
function confirmStructureDiscard3H() {
  if(!buildingPlacementSession?.isActive)return true;
  return typeof window.confirm!=='function'||window.confirm('Discard the unsaved building placement preview? Your accepted city will not change.');
}
function exitStructurePlacement3H() {
  if(!buildingPlacementSession?.isActive)return true;
  if(!confirmStructureDiscard3H())return false;
  buildingPlacementSession.stop();
  // Like footprint editing, leave a clear route back to the Inspector on phones.
  if(Number.isFinite(window.innerWidth) && window.innerWidth<=900
      && workspaceShell?.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:false});
  return true;
}
function startStructurePlacement3H(propertyId,buildingId=null) {
  if(!project || layers.buildings===false || !propertyId)return false;
  if(!exitPropertyEditing3I() || !exitStructurePlacement3H() || !exitBuildingEditing())return false;
  if(workspaceShell.state.section!=='city')workspaceShell.navigate('city');
  stopWorkspaceTools('city');
  if(editor.mode!=='pan')editor.setMode('pan');
  try{
    const started=buildingPlacementSession.start(project.city,propertyId,buildingId);
    if(started && Number.isFinite(window.innerWidth) && window.innerWidth<=900)
      workspaceShell.dispatch({type:'inspector',collapsed:true});
    return started;
  }catch(error){$('statusMessage').textContent='Cannot start building placement: '+error.message;return false;}
}
function syncBuildingStructureUI3H() {
  const session=buildingPlacementSession;
  const shown=Boolean(project && session?.isActive && session.property(project.city));
  $('buildingStructurePanel').hidden=!shown;
  const propertyId=structureHistoryProperty3H();
  const historyShown=Boolean(project && propertyId && workspaceShell?.state.section==='city'
    && !roadWorkspace?.active && !buildingEditSession?.isActive && !propertyEditSession?.isActive);
  $('buildingStructureHistoryPanel').hidden=!historyShown;
  const idle=Boolean(session?.isActive);
  const canHistory=historyShown && !idle;
  for(const [direction,id] of [['undo','structureUndo'],['redo','structureRedo']]) {
    const available=canHistory&&buildingStructureHistory.can(direction,project,propertyId);
    const action=describeStructureChange4E(buildingStructureHistory.entry(direction,propertyId),direction);
    $(id).disabled=!available;
    $(id).textContent=action?.label??(direction==='undo'?'Undo structure':'Redo structure');
    $(id).title=action?.description??'No structural edit to '+direction+'.';
  }
  const next=describeStructureChange4E(buildingStructureHistory.entry('undo',propertyId),'undo')
    ??describeStructureChange4E(buildingStructureHistory.entry('redo',propertyId),'redo');
  $('structureHistoryStatus').textContent=historyShown
    ? 'Property structure history · '+buildingStructureHistory.count('undo',propertyId)+' undo / '
      +buildingStructureHistory.count('redo',propertyId)+' redo (session only).'
      +(next?' Next: '+next.description:'')
    : '';
  if(!shown)return;
  const spec=session.spec;
  const structureMeasure=placementMeasurements4C(project.city,session);
  $('structurePreviewMeasurements4C').textContent=structureMeasure
    ? 'Width '+formatPrecision4C(structureMeasure.width)+' · Depth '+formatPrecision4C(structureMeasure.depth)+
      ' · Area '+formatPrecision4C(structureMeasure.area)+' · Position '+formatPrecision4C(structureMeasure.u)+
      ', '+formatPrecision4C(structureMeasure.v) : 'Adjust your draft to preview its measurements.';
  $('structureModeTitle').textContent=session.operation==='replace'?'REPLACE BUILDING':'PLACE NEW BUILDING';
  $('structurePropertyLabel').textContent=session.propertyId;
  for(const [id,value] of Object.entries({
    structureU:spec.u,structureV:spec.v,structureWidth:spec.width,
    structureDepth:spec.depth,structureAngle:spec.angle,
    structurePreset:spec.preset,structureType:spec.type
  })) $(id).value=typeof value==='number'?String(Number(value.toFixed(2))):value;
  const result=session.drag ? {ok:false,status:'checking',issues:[]}
    : prepareBuildingStructure3H(project,captureWorkspace().workspace,session.active);
  session.validation=result;
  $('structureApply').disabled=!(result.ok && result.status==='valid' && !session.drag);
  $('buildingStructurePanel').setAttribute('data-validation',result.status);
  const issues=$('structureIssues');
  issues.hidden=!result.issues?.length;
  issues.replaceChildren(...(result.issues??[]).map(issue=>{
    const el=document.createElement('li');
    el.textContent=formatEditIssue4D(issue,{
      buildingId:session.buildingId,propertyId:session.propertyId,
      frontageRoadId:session.property(project.city)?.frontageRoadId
    });return el;
  }));
  $('structureStatus').textContent=result.status==='checking'
    ? 'CHECKING · Complete placement validation runs when movement ends.'
    : result.ok ? 'VALID · This building can be applied to the selected property.'
    : 'INVALID · Apply disabled. '+formatEditIssue4D(result.issues?.[0],{
      buildingId:session.buildingId,propertyId:session.propertyId,
      frontageRoadId:session.property(project.city)?.frontageRoadId
    });
}
function applyStructurePlacement3H() {
  const session=buildingPlacementSession;
  if(!project || !session?.isActive || session.drag)return false;
  const selection=workspaceShell?.state.selection;
  if(!selection || (selection.kind==='property' && selection.id!==session.propertyId)
    || (selection.kind==='building' && selection.id!==session.buildingId)
    || !['property','building'].includes(selection.kind))return false;
  const previous=project,request={...session.active,spec:{...session.spec}};
  const result=prepareBuildingStructure3H(previous,captureWorkspace().workspace,request);
  if(!result.ok){
    session.validation=result;syncBuildingStructureUI3H();return false;
  }
  if(project!==previous || session.active?.buildingId!==request.buildingId)return false;
  try{
    if(!buildingStructureHistory.record(previous,result.candidate,request.propertyId,request.operation))return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    project=result.candidate;
    buildingHistory.clear();
    session.stop();
    updateDetails();
    workspaceShell.select({kind:'property',id:request.propertyId});
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged();
    $('statusMessage').textContent='Applied '+request.operation+' for '+request.buildingId+'. Download a project to keep it.';
    return true;
  }catch(error){$('statusMessage').textContent='Building Apply rejected: '+error.message;return false;}
}
// Dev 4e: one confirmation, one validated transaction and one structural Undo.
function clearPropertyBuildings4E(propertyId) {
  const selected=workspaceShell?.state.selection;
  const site=project?.city?.properties.find(p=>p.id===propertyId);
  if(!site||layers.buildings===false||selected?.kind!=='property'||selected.id!==propertyId)return false;
  const count=site.buildingIds?.length??0;
  if(count===0){
    $('statusMessage').textContent='This property has no buildings to clear.';
    return false;
  }
  const name=site.customName||propertyId;
  if(typeof window.confirm==='function'&&!window.confirm(
    'Clear all '+count+' building(s) from property "'+name+'"? The property, plots and roads stay unchanged. '+
    'You can undo this entire action in one step during this session.'
  ))return false;
  if(!exitPropertyEditing3I()||!exitStructurePlacement3H()||!exitBuildingEditing())return false;
  const previous=project;
  const result=preparePropertyBuildingClear4E(previous,captureWorkspace().workspace,propertyId);
  if(!result.ok){$('statusMessage').textContent=result.reason;return false;}
  if(project!==previous||workspaceShell?.state.selection?.id!==propertyId)return false;
  try {
    if(!buildingStructureHistory.record(previous,result.candidate,propertyId,'clear'))return false;
    project=result.candidate;
    buildingHistory.clear();propertyHistory.clear();propertyDeletionHistory4A.clear();
    identityWorkspace.reset();
    updateDetails();
    workspaceShell.select({kind:'property',id:propertyId});
    workspaceShell.refresh();
    requestDraw();workspaceChanged();
    $('statusMessage').textContent='Cleared '+result.count+' buildings from '+name+
      '. Undo clear restores every building in one step this session.';
    return true;
  }catch(error){$('statusMessage').textContent='Clear buildings failed: '+error.message;return false;}
}
function deleteStructureBuilding3H(propertyId,buildingId) {
  if(!project||!propertyId||!buildingId)return false;
  if(typeof window.confirm==='function' && !window.confirm('Delete '+buildingId+' from this property? You can Undo this deletion during the session.'))return false;
  if(!exitStructurePlacement3H() || !exitBuildingEditing())return false;
  const previous=project;
  const result=prepareBuildingStructure3H(previous,captureWorkspace().workspace,
    {operation:'delete',propertyId,buildingId});
  if(!result.ok){$('statusMessage').textContent='Deletion rejected: '+result.issues[0]?.message;return false;}
  try{
    if(!buildingStructureHistory.record(previous,result.candidate,propertyId,'delete'))return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    project=result.candidate;
    buildingHistory.clear();
    updateDetails();
    workspaceShell.select({kind:'property',id:propertyId});
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged();
    $('statusMessage').textContent='Deleted '+buildingId+'; Undo structure can restore it this session.';
    return true;
  }catch(error){$('statusMessage').textContent='Deletion failed: '+error.message;return false;}
}
function moveStructureHistory3H(direction) {
  if(!project || buildingPlacementSession?.isActive || buildingEditSession?.isActive)return false;
  const propertyId=structureHistoryProperty3H();
  if(!propertyId || !buildingStructureHistory.can(direction,project,propertyId))return false;
  const result=buildingStructureHistory.prepare(project,captureWorkspace().workspace,propertyId,direction);
  if(!result.ok){$('statusMessage').textContent='Cannot '+direction+' structure: '+result.issues[0]?.message;return false;}
  const action=describeStructureChange4E(result.entry,direction);
  buildingStructureHistory.accept(result.entry,direction);
  propertyHistory.clear();
  propertyDeletionHistory4A.clear();
  project=result.candidate;
  buildingHistory.clear();
  updateDetails();
  workspaceShell.select({kind:'property',id:propertyId});
  workspaceShell.refresh();
  requestDraw();
  workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Undid: ':'Redid: ')+
    (action?.description??'Structural edit on '+propertyId+'.');
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
function exitPropertyEditing3I() {
  if (!propertyEditSession?.isActive) return true;
  if (propertyEditSession.isPending && typeof window.confirm === 'function'
      && !window.confirm('Discard your unsaved property boundary and plot preview?'))return false;
  propertyEditSession.stop();
  if (Number.isFinite(window.innerWidth) && window.innerWidth <= 900
      && workspaceShell?.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:false});
  return true;
}
function syncPropertyEditUI3I() {
  const session = propertyEditSession;
  const active = Boolean(project && session?.isActive && session.source(project.city));
  $('propertyEditPanel3I').hidden = !active;
  if (!active) return;
  $('propertyEditTarget3I').textContent = session.propertyId;
  const measured=propertyMeasurements4C(project.city,session);
  if(measured) $('propertyPreviewMeasurements4C').textContent=
    'Width '+formatPrecision4C(measured.width)+' · Depth '+formatPrecision4C(measured.depth)+
    ' · Area '+formatPrecision4C(measured.area)+' (Δ '+formatPrecision4C(measured.areaDelta)+')'+
    ' · Center '+formatPrecision4C(measured.x)+', '+formatPrecision4C(measured.y)+
    ' · Offset '+formatPrecision4C(measured.dx)+', '+formatPrecision4C(measured.dy);
  for(const id of ['propertyNudgeLeft4C','propertyNudgeRight4C','propertyNudgeUp4C','propertyNudgeDown4C'])
    $(id).disabled=session.selectedCorner===null || Boolean(session.drag);
  $('propertyEditCorner3I').textContent = session.selectedCorner === null
    ? 'Click or drag a highlighted corner to select it.'
    : 'Corner '+(session.selectedCorner + 1)+' selected. Drag or enter coordinates to preview changes.';
  const corner = session.selectedCorner === null ? null : session.boundary[session.selectedCorner];
  for(const [id,value] of [['propertyCornerX3I',corner?.x],['propertyCornerY3I',corner?.y]]){
    $(id).disabled = !corner;
    $(id).value = corner ? String(Number(value.toFixed(2))) : '';
  }
  const dividerIndex=$('propertyDividerIndex3I'), dividerInput=$('propertyDividerPercent3I');
  const dividers=session.dividers;
  const previous=dividerIndex.options?.length??-1;
  if(previous!==dividers.length){
    const options=dividers.map((_,i)=>{
      const option=document.createElement('option');
      option.value=String(i);option.textContent='Divider '+(i+1);return option;
    });
    dividerIndex.replaceChildren(...options);
  }
  dividerIndex.disabled=dividers.length===0;
  dividerIndex.value=String(session.selectedDivider);
  dividerInput.disabled=dividers.length===0;
  dividerInput.value=dividers.length?String(Number((dividers[session.selectedDivider]*100).toFixed(2))):'';
  const canHistory=!session.isPending&&!session.drag;
  $('propertyHistoryUndo3I').disabled=!(canHistory&&propertyHistory.can('undo',project,session.propertyId));
  $('propertyHistoryRedo3I').disabled=!(canHistory&&propertyHistory.can('redo',project,session.propertyId));
  $('propertyHistoryStatus3I').textContent='Property history · '+propertyHistory.count('undo',session.propertyId)
    +' undo / '+propertyHistory.count('redo',session.propertyId)+' redo (session only).';
  const result=session.drag ? {ok:false,status:'checking',issues:[]} : inspectPropertyEdit3I(project,session);
  session.validation=result;
  $('propertyEditPanel3I').setAttribute('data-validation',result.status);
  $('propertyEditApply3I').disabled=!(session.isPending&&result.ok&&!session.drag);
  $('propertyEditStatus3I').textContent = result.status==='checking'
    ? 'CHECKING · Release the handle to validate the new property and plots.'
    : !result.ok
      ? 'INVALID · '+formatEditIssue4D(result.issues?.[0],{propertyId:session.propertyId})
      : session.isPending
        ? 'VALID · Property and plot edits can be applied together.'
        : 'NO PENDING CHANGES · Property and plots match the accepted city.';
  const issues=$('propertyEditIssues3I');
  issues.hidden=!result.issues?.length;
  issues.replaceChildren(...(result.issues??[]).map(issue=>{
    const item=document.createElement('li');
    item.textContent=formatEditIssue4D(issue,{propertyId:session.propertyId});
    return item;
  }));
}
function syncMapEditDiagnostic4D() {
  // Active city edit previews only; dragging, idle and valid drafts hide stale errors.
  const session=propertyEditSession?.isActive?propertyEditSession
    :buildingEditSession?.isActive?buildingEditSession
    :buildingPlacementSession?.isActive?buildingPlacementSession:null;
  const result=session?.validation;
  const issue=result?.status==='invalid'?result.issues?.[0]:null;
  const box=$('mapEditDiagnostic4D');
  box.hidden=!issue;
  if(!issue){box.textContent='';return;}
  const context={propertyId:session.propertyId,buildingId:session.buildingId,
    frontageRoadId:session.source?.(project?.city)?.frontageRoadId
      ?? session.property?.(project?.city)?.frontageRoadId};
  box.textContent='EDIT BLOCKED · '+formatEditIssue4D(issue,context);
}
function updateMapIndicators() {
  if(roadWorkspace?.active){
    $('toolHint').textContent='ROAD INSPECTION · Select a junction or road · Space/middle drag pans · Escape cancels';
    $('draftBadge').textContent='● ROAD PREVIEW ONLY';
    return;
  }
  clearMapHover();
  syncBuildingTransformUI();
  syncBuildingStructureUI3H();
  syncPropertyEditUI3I();
  syncMapEditDiagnostic4D();
  syncPropertyDeletionControls4A();
  const terrainActive = terrainPanel && terrainPanel.editor.mode !== 'pan',
    waterActive = waterPanel && waterPanel.editor.mode !== 'pan',
    buildingActive = buildingEditSession?.isActive ?? false,
    structureActive = buildingPlacementSession?.isActive ?? false,
    propertyActive = propertyEditSession?.isActive ?? false;
  canvas.classList.toggle('building-edit-mode', buildingActive);
  canvas.classList.toggle('drawing', Boolean(terrainActive || waterActive || editor.mode !== 'pan'));
  for (const mode of ['freehand', 'points', 'edit', 'pan', 'center']) $(mode + 'Button').setAttribute('aria-pressed', String(!terrainActive && !waterActive && editor.mode === mode));
  $('toolHint').textContent = propertyActive ? 'PROPERTY PREVIEW · Drag corners or edit coordinates and plot dividers · Apply unlocks after validation' : structureActive ? 'BUILDING PLACEMENT · Click property ground or drag the ghost · Use numeric controls for exact size and rotation' : buildingActive ? 'BUILDING EDIT · Move, Rotate, Resize · Space/middle drag pans · No geometry changes until validated Apply' : terrainActive ? (terrainPanel.editor.mode === 'move' ? 'Drag the mountain center marker' : terrainPanel.editor.mode === 'ridge' ? 'Drag peaks · Change selected peak height' : terrainPanel.editor.mode === 'shape' ? 'Drag foothills · Double-click to add · Delete to remove' : 'Click or drag a pass along the ridge') : waterActive ? (waterPanel.editor.mode === 'river' ? 'Drag water points · Double-click to add · Delete to remove' : waterPanel.editor.mode === 'lake-move' ? 'Drag the lake center marker' : waterPanel.editor.mode === 'bridge' ? 'Drag bridge markers · Delete to remove' : 'Click near the river to add a bridge') : TOOL_HINTS[editor.mode];
  $('draftBadge').textContent = propertyActive ? '● PROPERTY PREVIEW ONLY' : structureActive ? '● BUILDING PLACEMENT PREVIEW' : buildingActive ? '● BUILDING EDIT MODE' : editor.dirty ? '● OUTLINE PREVIEW' : terrainPanel?.editor.dirty ? '● TERRAIN PREVIEW' : waterPanel?.editor.dirty ? '● WATER PREVIEW' : '● CITY PLAN';
}

function updateViewport() {
  clearMapHover();
  $('zoomValue').textContent = `${Math.round(camera.zoom*100)}%`;
  workspaceChanged();
}

function editorChanged() {
  if(editor.mode!=='pan')roadWorkspace?.exit();
  if (editor.mode !== 'pan') {buildingEditSession?.stop();buildingPlacementSession?.stop();propertyEditSession?.stop();}
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

// View-only framing: selection and accepted geometry remain unchanged.
function zoomToSelection4B(ref) {
  if(!project||!focusCameraOnSelection4B(camera,project.city,ref))return false;
  if(workspaceShell?.state.section!=='city')workspaceShell.navigate('city');
  if(Number.isFinite(window.innerWidth)&&window.innerWidth<=900
      && workspaceShell?.state.inspectorCollapsed===false)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
  updateViewport();
  requestDraw();
  $('statusMessage').textContent='Focused map on '+ref.kind+' '+ref.id+'. No city geometry was changed.';
  return true;
}
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
  roadWorkspace?.exit();
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
    buildingPlacementSession?.stop();
    propertyEditSession?.stop();
    buildingStructureHistory.clear();
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
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
// Dev 4f: preset selection affects only the already-persisted layer flags.
function syncLayerPreset4F() {
  $('layerPreset4F').value=identifyLayerPreset4F(layers);
}
function applyLayerPreset4F(name) {
  const preset=layerPreset4F(name);
  if(!preset)return false;
  for(const key of LAYER_KEYS_4F){
    layers[key]=preset[key];
    $(key+'Layer').checked=preset[key];
  }
  if(!layers.buildings){
    buildingEditSession?.stop();
    buildingPlacementSession?.stop();
  }
  clearMapHover();
  propertyWorkspace?.refresh();
  buildingWorkspace?.refresh();
  syncLayerPreset4F();
  requestDraw();
  workspaceChanged();
  return true;
}
$('layerPreset4F').addEventListener('change',e=>{
  if(!applyLayerPreset4F(e.target.value))syncLayerPreset4F();
});
for (const key of LAYER_KEYS_4F) {
  $(key + 'Layer').addEventListener('change', event => {
    layers[key] = event.target.checked;
    if (key === 'buildings' && layers.buildings === false) buildingEditSession?.stop();
    if (['buildings', 'properties', 'plots'].includes(key)) {
      clearMapHover();
      propertyWorkspace?.refresh();
      buildingWorkspace?.refresh();
    }
    syncLayerPreset4F();
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
  if(roadWorkspace?.active){roadWorkspace.exit({focus:true});return;}
  if (!exitPropertyEditing3I() || !exitBuildingEditing() || !exitStructurePlacement3H()) return;
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
  if(roadWorkspace?.active && e.key==='Escape'){
    roadWorkspace.exit({focus:true});e.preventDefault();return;
  }
  if (!isMapShortcutEvent(e, document.activeElement)) return;
  if(roadWorkspace?.active){
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){
      if(e.key.toLowerCase()==='z'&&!e.shiftKey)roadWorkspace.reset();
      e.preventDefault();return;
    }
    if(['Delete','Backspace'].includes(e.key)){e.preventDefault();return;}
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)
      &&(e.target===canvas||document.activeElement===canvas)){
      roadWorkspace.nudge(e.key.slice(5),e.shiftKey?10:1);e.preventDefault();return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    if (propertyEditSession?.isActive && movePropertyHistory3I('redo')) e.preventDefault();
    else if (buildingEditSession?.isActive && moveBuildingHistory('redo')) e.preventDefault();
    else if (!buildingPlacementSession?.isActive && moveStructureHistory3H('redo')) e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
    if (undoCurrentScope()) e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Arrow nudges only when the map canvas has focus, never in text inputs.
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)
      && (e.target===canvas || document.activeElement===canvas)) {
    const direction=e.key.slice(5), target=propertyEditSession?.isActive?'property'
      :buildingEditSession?.isActive?'building':buildingPlacementSession?.isActive?'structure':null;
    const stepId=target==='property'?'propertyNudgeStep4C'
      :target==='building'?'buildingNudgeStep4C':'structureNudgeStep4C';
    if(target && precisionNudge4C(target,direction,Number($(stepId).value)))e.preventDefault();
    if(target)return;
  }
  if (e.key === 'Enter' && workspaceShell?.state.section === 'city' && editor.mode === 'points') {
    e.preventDefault();
    editor.finish();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const previewActive=propertyEditSession?.isActive||buildingEditSession?.isActive||buildingPlacementSession?.isActive;
    if (workspaceShell?.state.section==='city' && editor.mode==='pan') {
      // Delete never removes a record behind an active uncommitted preview.
      if (previewActive)return;
      if(e.key!=='Delete')return;
      const selected=workspaceShell.state.selection;
      if(selected?.kind==='property' && project?.city.properties.some(p=>p.id===selected.id)){
        e.preventDefault();deleteProperty4A(selected.id);return;
      }
      if(selected?.kind==='building'){
        const building=project?.city.buildings.find(b=>b.id===selected.id);
        if(building){e.preventDefault();deleteStructureBuilding3H(building.propertyId,building.id);return;}
      }
      return;
    }
    e.preventDefault();
    if (workspaceShell?.state.section === 'landscape' && terrainPanel?.editor.mode !== 'pan') terrainPanel.editor.removePoint();
    else if (workspaceShell?.state.section === 'landscape' && waterPanel?.editor.mode !== 'pan') waterPanel.editor.removePoint();
    else if (workspaceShell?.state.section === 'city') editor.removePoint();
  }
  if (e.key === 'Escape') {
    if (!exitPropertyEditing3I() || !exitBuildingEditing() || !exitStructurePlacement3H()) return;
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
  clearMapHover();
  requestDraw();
  // Viewport dimensions are not persisted. A layout/ResizeObserver callback
  // must not create a file revision after a transient inspection is cancelled.
  $('zoomValue').textContent = `${Math.round(camera.zoom*100)}%`;
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
  roadWorkspace?.exit();
  if (targetSection !== 'city') {buildingEditSession?.stop();buildingPlacementSession?.stop();propertyEditSession?.stop();}
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
    syncBuildingStructureUI3H();
    syncPropertyEditUI3I();
    clearMapHover();
    landscapeWorkspace?.render();
    districtWorkspace?.render();
    identityWorkspace?.render();
  },
  clearSelection: () => {
    buildingEditSession?.stop();
    buildingPlacementSession?.stop();
    propertyEditSession?.stop();
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
    buildingPlacementSession?.stop();
    propertyEditSession?.stop();
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  },
  changed: () => files?.changed(),
  draw: requestDraw
});
propertyEditSession = new PropertyEditSession3I(() => {updateMapIndicators();requestDraw();});
buildingPlacementSession = new BuildingPlacementSession3H(() => {updateMapIndicators();requestDraw();});
buildingEditSession = new BuildingEditSession(() => {
  updateMapIndicators();
  workspaceShell?.refresh();
  requestDraw();
});
function enterPropertyEditing3I(propertyId) {
  if(!project || workspaceShell?.state.selection?.kind!=='property'
      || workspaceShell.state.selection.id!==propertyId)return false;
  if(!exitBuildingEditing() || !exitStructurePlacement3H())return false;
  if(workspaceShell.state.section!=='city')workspaceShell.navigate('city');
  stopWorkspaceTools('city');
  if(editor.mode!=='pan')editor.setMode('pan');
  const started=propertyEditSession.start(project.city,propertyId);
  if(started && Number.isFinite(window.innerWidth) && window.innerWidth<=900)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
  return started;
}
function enterBuildingEditing(id) {
  if (!project || !exitPropertyEditing3I() || !exitStructurePlacement3H()) return false;
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
  startReplacement: (propertyId,id) => startStructurePlacement3H(propertyId,id),
  deleteBuilding: (propertyId,id) => deleteStructureBuilding3H(propertyId,id),
  focusSelection: zoomToSelection4B,
  confirmPreviewDiscard: () => confirmBuildingPreviewDiscard() && confirmStructureDiscard3H(),
  onSelect: () => {
    buildingPlacementSession?.stop();
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
  exitEditing: () => exitBuildingEditing() && exitStructurePlacement3H() && exitPropertyEditing3I(),
  startBuilding: propertyId => startStructurePlacement3H(propertyId),
  startPropertyEdit: enterPropertyEditing3I,
  deleteProperty: deleteProperty4A,
  clearBuildings: clearPropertyBuildings4E,
  focusSelection: zoomToSelection4B,
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
roadWorkspace = new RoadInspectionWorkspace({
  getElement:$,getProject:()=>project,camera,shell:workspaceShell,capture:captureWorkspace,
  canEnter:()=>!project?.city?'Generate a city before inspecting roads.':
    workspaceShell.state.section!=='city'||editor.mode!=='pan'||buildingEditSession?.isActive
      ||propertyEditSession?.isActive||buildingPlacementSession?.isActive||identityWorkspace?.hasPending()
      ?'Finish or cancel the current edit, then choose Pan in City to inspect roads.':'',
  beforeEnter:()=>{workspaceMenus.close();clearMapHover();},
  draw:()=>{$('zoomValue').textContent=`${Math.round(camera.zoom*100)}%`;updateMapIndicators();updateUndoFeedback();syncPropertyDeletionControls4A();requestDraw();},
  afterExit:()=>{updateMapIndicators();updateUndoFeedback();syncPropertyDeletionControls4A();}
});
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
// Dev 4c: buttons and numeric/drag inputs share the exact same preview APIs.
const precisionDirections4C = Object.freeze({
  Left:['x',-1],Right:['x',1],Up:['y',-1],Down:['y',1]
});
function precisionNudge4C(target,direction,step) {
  const [axis,sign]=precisionDirections4C[direction]??[];
  if(!axis || !project || workspaceShell?.state.section!=='city')return false;
  if(target==='building')return nudgeBuilding4C(buildingEditSession,axis==='x'?'dx':'dy',sign,step);
  if(target==='property')return nudgePropertyCorner4C(propertyEditSession,axis,sign,step);
  if(target==='structure')return nudgeStructure4C(buildingPlacementSession,axis==='x'?'u':'v',sign,step);
  return false;
}
for(const [target,idPrefix,stepId] of [
  ['building','buildingNudge','buildingNudgeStep4C'],
  ['property','propertyNudge','propertyNudgeStep4C'],
  ['structure','structureNudge','structureNudgeStep4C']
]) for(const direction of Object.keys(precisionDirections4C))
  $(idPrefix+direction+'4C').addEventListener('click',()=>{
    if(!precisionNudge4C(target,direction,Number($(stepId).value)))
      $('statusMessage').textContent='Choose a valid preview and nudge increment first.';
  });
$('buildingPreviewReset').addEventListener('click',()=>{
  if (confirmBuildingPreviewDiscard()) buildingEditSession.reset();
});
$('buildingPreviewCancel').addEventListener('click',exitBuildingEditing);
$('buildingPreviewApply').addEventListener('click',applyBuildingTransform);
$('buildingHistoryUndo').addEventListener('click',()=>moveBuildingHistory('undo'));
$('buildingHistoryRedo').addEventListener('click',()=>moveBuildingHistory('redo'));
for (const [id,key] of Object.entries({structureU:'u',structureV:'v',structureWidth:'width',structureDepth:'depth',structureAngle:'angle'}))
  $(id).addEventListener('change',()=>{
    if(!buildingPlacementSession?.isActive)return;
    const num=Number($(id).value);
    if($(id).value==='' || !Number.isFinite(num)) {syncBuildingStructureUI3H();return;}
    buildingPlacementSession.update({[key]:num});
  });
for(const [id,key] of Object.entries({structurePreset:'preset',structureType:'type'}))
  $(id).addEventListener('change',()=>buildingPlacementSession?.update({[key]:$(id).value}));
$('structureApply').addEventListener('click',applyStructurePlacement3H);
$('structureCancel').addEventListener('click',exitStructurePlacement3H);
$('structureUndo').addEventListener('click',()=>moveStructureHistory3H('undo'));
$('structureRedo').addEventListener('click',()=>moveStructureHistory3H('redo'));
// Dev 4a: deleting a parcel removes its dependent records, never neighboring land.
function deleteProperty4A(propertyId) {
  const selected=workspaceShell?.state.selection;
  const property=project?.city?.properties.find(p=>p.id===propertyId);
  if(!property || selected?.kind!=='property' || selected.id!==propertyId)return false;
  const plots=project.city.plots.filter(p=>p.propertyId===propertyId).length;
  const buildings=project.city.buildings.filter(b=>b.propertyId===propertyId).length;
  const name=property.customName || property.id;
  if(typeof window.confirm==='function' && !window.confirm(
    'Delete property "'+name+'"? This also deletes '+plots+' plot(s) and '+buildings+
    ' building(s). Neighboring properties and streets are untouched. Undo is available in this session.'
  ))return false;
  if(!exitPropertyEditing3I() || !exitStructurePlacement3H() || !exitBuildingEditing())return false;
  const previous=project;
  const receipt=preparePropertyDeletion4A(previous,captureWorkspace().workspace,propertyId);
  if(!receipt.ok){$('statusMessage').textContent=receipt.reason;return false;}
  if(project!==previous || workspaceShell.state.selection?.id!==propertyId)return false;
  try{
    propertyDeletionHistory4A.record(previous,receipt.candidate,propertyId);
    project=receipt.candidate;
    buildingHistory.clear();buildingStructureHistory.clear();propertyHistory.clear();
    identityWorkspace.reset();
    workspaceShell.select(null,{reveal:false});
    // On narrow layouts the Inspector overlays map controls; reveal the global Undo.
    if(Number.isFinite(window.innerWidth)&&window.innerWidth<=900 && !workspaceShell.state.inspectorCollapsed)
      workspaceShell.dispatch({type:'inspector',collapsed:true});
    propertyWorkspace.refresh();buildingWorkspace.refresh();
    updateDetails();workspaceShell.refresh();requestDraw();workspaceChanged();
    $('statusMessage').textContent='Deleted '+name+' and its '+plots+' plots / '+buildings+
      ' buildings. Use Undo deletion to restore them during this session.';
    return true;
  }catch(error){$('statusMessage').textContent='Deletion failed: '+error.message;return false;}
}
function movePropertyDeletion4A(direction) {
  if(!project||propertyEditSession?.isActive||buildingPlacementSession?.isActive||buildingEditSession?.isActive)return false;
  const receipt=propertyDeletionHistory4A.prepare(project,captureWorkspace().workspace,direction);
  if(!receipt.ok){$('statusMessage').textContent=receipt.reason;return false;}
  const id=receipt.entry.snapshot.propertyId;
  project=receipt.candidate;
  propertyDeletionHistory4A.accept(receipt.entry,direction);
  buildingHistory.clear();buildingStructureHistory.clear();propertyHistory.clear();
  identityWorkspace.reset();
  workspaceShell.select(direction==='undo'?{kind:'property',id}:null,{reveal:false});
  // Restoring selection can reopen the mobile Inspector over Redo Delete.
  // Keep map-level deletion history controls reachable after both directions.
  if(Number.isFinite(window.innerWidth)&&window.innerWidth<=900 && !workspaceShell.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
  propertyWorkspace.refresh();buildingWorkspace.refresh();
  updateDetails();workspaceShell.refresh();requestDraw();workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Restored ':'Deleted again: ')+id+
    ' (property, plots and buildings).';
  return true;
}
$('propertyDeletionUndo4A').addEventListener('click',()=>movePropertyDeletion4A('undo'));
$('propertyDeletionRedo4A').addEventListener('click',()=>movePropertyDeletion4A('redo'));
function keepPropertyEditorVisible3I() {
  // Refreshing the selected property can reopen the narrow-screen Inspector.
  // Keep the floating edit tools accessible through Apply and Undo/Redo.
  if (propertyEditSession?.isActive && Number.isFinite(window.innerWidth)
      && window.innerWidth <= 900 && workspaceShell?.state.inspectorCollapsed === false)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
}
function applyPropertyEdit3I() {
  const session=propertyEditSession;
  if(!project||!session?.isActive||!session.isPending||session.drag
    ||workspaceShell?.state.selection?.kind!=='property'
    ||workspaceShell.state.selection.id!==session.propertyId)return false;
  const before=project,propertyId=session.propertyId;
  const received=preparePropertyApply3I(before,captureWorkspace().workspace,session);
  if(!received.ok) {
    session.validation=received;
    $('statusMessage').textContent='Property Apply blocked: '+(received.issues[0]?.message??'Invalid geometry.');
    syncPropertyEditUI3I();requestDraw();return false;
  }
  if(project!==before||session.propertyId!==propertyId)return false;
  if(!propertyHistory.record(before,received.candidate,propertyId))return false;
  project=received.candidate;
  buildingHistory.clear();
  buildingStructureHistory.clear();
  propertyDeletionHistory4A.clear();
  session.start(project.city,propertyId);
  updateDetails();
  workspaceShell.select({kind:'property',id:propertyId});
  workspaceShell.refresh();keepPropertyEditorVisible3I();requestDraw();workspaceChanged();
  $('statusMessage').textContent='Applied validated property and plot edits to '+propertyId+'. Download a project to preserve your change.';
  return true;
}
$('propertyEditReset3I').addEventListener('click',()=>propertyEditSession?.reset());
$('propertyEditCancel3I').addEventListener('click',exitPropertyEditing3I);
$('propertyEditApply3I').addEventListener('click',applyPropertyEdit3I);
function movePropertyHistory3I(direction){
  const session=propertyEditSession;
  if(!project||!session?.isActive||session.isPending||session.drag)return false;
  const id=session.propertyId;
  const receipt=propertyHistory.prepare(project,captureWorkspace().workspace,id,direction);
  if(!receipt.ok){
    $('statusMessage').textContent=receipt.reason;return false;
  }
  project=receipt.candidate;
  propertyHistory.accept(receipt.entry,direction);
  propertyDeletionHistory4A.clear();
  session.start(project.city,id);
  updateDetails();workspaceShell.refresh();keepPropertyEditorVisible3I();requestDraw();workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Undid':'Redid')+' property and plot edit for '+id+'.';
  return true;
}
$('propertyHistoryUndo3I').addEventListener('click',()=>movePropertyHistory3I('undo'));
$('propertyHistoryRedo3I').addEventListener('click',()=>movePropertyHistory3I('redo'));
for(const [id,axis] of [['propertyCornerX3I','x'],['propertyCornerY3I','y']])
  $(id).addEventListener('change',()=>{
    const session=propertyEditSession;
    if(!session?.isActive||session.selectedCorner===null)return;
    const value=Number($(id).value);
    if($(id).value===''||!Number.isFinite(value)){syncPropertyEditUI3I();return;}
    session.setCorner(session.selectedCorner,{...session.boundary[session.selectedCorner],[axis]:value});
  });
$('propertyDividerIndex3I').addEventListener('change',()=>{
  if(!propertyEditSession?.isActive)return;
  const index=Number($('propertyDividerIndex3I').value);
  if(Number.isInteger(index)&&index>=0&&index<propertyEditSession.dividers.length){
    propertyEditSession.selectedDivider=index;
    updateMapIndicators();
  }
});
$('propertyDividerPercent3I').addEventListener('change',()=>{
  const session=propertyEditSession;
  if(!session?.isActive)return;
  const value=Number($('propertyDividerPercent3I').value);
  if($('propertyDividerPercent3I').value===''||!Number.isFinite(value)
      ||!session.setDivider(session.selectedDivider,value/100))syncPropertyEditUI3I();
});

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
  if(roadWorkspace?.active){const hit=roadWorkspace.session.hit(point,camera.zoom);if(hit)roadWorkspace.session.select(hit);return;}
  if (propertyEditSession?.isActive) {
    const corner=propertyEditSession.hitCorner(project?.city,point,camera.zoom);
    if(corner!==null)propertyEditSession.selectCorner(corner);
    return; // Never switch selection or commit geometry while previewing land.
  }
  if (buildingPlacementSession?.isActive) {
    const property=buildingPlacementSession.property(project?.city);
    if(property && pointInPolygon(point,property.boundary)) {
      const local=buildingLocalPoint3H(property,point);
      if(local)buildingPlacementSession.update(local);
    }
    return;
  }
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
  if(roadWorkspace?.active){clearMapHover();return;}
  if (propertyEditSession?.isActive) {clearMapHover();return;}
  if (buildingPlacementSession?.isActive) {clearMapHover();return;}
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
  begin: (point,zoom,event) => {
    if(roadWorkspace?.active)return roadWorkspace.session.begin(point,zoom,event?.pointerType);
    if(propertyEditSession?.isActive){
      const index=propertyEditSession.hitCorner(project?.city,point,zoom);
      if(index===null)return false;
      propertyEditSession.drag={index,original:{...propertyEditSession.boundary[index]}};
      propertyEditSession.selectCorner(index);
      return true;
    }
    if(buildingPlacementSession?.isActive){
      const polygon=buildingPlacementSession.previewFor(project?.city)?.footprint;
      if(polygon?.length && pointInPolygon(point,polygon)){
        const property=buildingPlacementSession.property(project.city);
        buildingPlacementSession.drag={start:buildingLocalPoint3H(property,point),spec:{...buildingPlacementSession.spec}};
        return true;
      }
      return false;
    }
    return Boolean(buildingEditSession?.isActive && buildingEditSession.beginGesture(project?.city,layers,point,zoom));
  },
  move: point => {
    if(roadWorkspace?.active){roadWorkspace.session.move(point);return;}
    if(propertyEditSession?.drag){
      propertyEditSession.setCorner(propertyEditSession.drag.index,point);
    }else if(buildingPlacementSession?.drag){
      const property=buildingPlacementSession.property(project.city);
      const now=buildingLocalPoint3H(property,point),drag=buildingPlacementSession.drag;
      if(now && drag.start)buildingPlacementSession.update({
        u:drag.spec.u+now.u-drag.start.u,v:drag.spec.v+now.v-drag.start.v
      });
    }else buildingEditSession?.moveGesture(point);
  },
  end: cancelled => {
    if(roadWorkspace?.active){roadWorkspace.session.end(cancelled);return;}
    if(propertyEditSession?.drag){
      const drag=propertyEditSession.drag;
      propertyEditSession.drag=null;
      if(cancelled)propertyEditSession.setCorner(drag.index,drag.original);
      syncPropertyEditUI3I();
    }else if(buildingPlacementSession?.drag){
      const drag=buildingPlacementSession.drag;
      buildingPlacementSession.drag=null;
      if(cancelled)buildingPlacementSession.update(drag.spec);
      syncBuildingStructureUI3H();
    }else buildingEditSession?.endGesture(cancelled);
  }
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
  const roadBaseline=roadWorkspace?.savedWorkspace();
  if(roadBaseline)return {project,workspace:copyJson(roadBaseline)};
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
  roadWorkspace?.exit({restore:false});
  propertyEditSession?.stop();
  landscapeWorkspace.restoring = true;
  const next = copyJson(document.project),
    workspace = copyJson(document.workspace),
    draft = workspace.editor;
  buildingEditSession?.stop();
  buildingPlacementSession?.stop();
  buildingStructureHistory.clear();
  propertyHistory.clear();
  propertyDeletionHistory4A.clear();
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
  for (const key of LAYER_KEYS_4F) {
    layers[key] = workspace.view.layers[key] ?? false;
    $(key + 'Layer').checked = layers[key];
  }
  syncLayerPreset4F();
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
// The map PNG reflects the current on-screen view, including visible previews.
$('downloadMapPNG4F').addEventListener('click', async()=>{
  const message=$('mapExportStatus4F');
  try{
    if(!project)throw new Error('Generate or load a city first.');
    const defaultName=projectFilename({project,savedAt:new Date().toISOString()});
    const name=exportFilename4F($('exportFilename4F').value,defaultName,'png');
    const snapshot=await downloadMapPNG4F(canvas,name);
    message.textContent='PNG download requested: '+name+' ('+snapshot.width+' × '+snapshot.height+
      ' pixels). The image uses current visible layers and any editing previews.';
  }catch(error){message.textContent='PNG export failed: '+error.message;}
});
syncLayerPreset4F();
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

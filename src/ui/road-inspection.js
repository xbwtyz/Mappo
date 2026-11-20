import { buildingFrame } from '../core/building-transform.js';
import { ROAD_BEND_LIMIT } from '../core/road-shape.js';
import { RoadPreviewSession } from '../editor/road-preview.js';
import { roadInspectionDetails, roadReconciliationPreviewB3 } from '../core/road-inspection.js';


const roadImpactGuidance = {
  "unnormalized-crossing": [
    "Roads cross without a valid junction",
    "Avoid crossing another road or create a supported intersection in a future editor."
  ],
  "overlapping-roads": [
    "Road segments overlap",
    "Try a different junction position so separate roads do not occupy the same segment."
  ],
  "disconnected-graph": [
    "Road network becomes disconnected",
    "Move the junction back toward a connected configuration."
  ],
  "degenerate-road": [
    "A road becomes too short or collapses",
    "Increase separation between the road endpoints."
  ],
  "boundary-escape": [
    "Road moves outside the city boundary",
    "Move the junction back inside the accepted boundary."
  ],
  "protected-junction": [
    "Protected junction cannot move",
    "Choose an ordinary unprotected junction; protected infrastructure is inspection-only."
  ],
  "protected-edge": [
    "Protected infrastructure would change",
    "Boundary, bridge, bank, plaza, and terrain connections are protected in road editing."
  ],
  "road-setback": [
    "Buildings or parcels are too close to the road",
    "Review the preview for any setback adjustments."
  ],
  "frontage-missing": [
    "Property loses its road-facing edge",
    "Review the proposed property frontage in the neighborhood preview."
  ],
  "frontage-block": [
    "Property frontage no longer matches its block",
    "The block and property frontage may need coordinated updates."
  ],
  "frontage-unusable": [
    "Property frontage cannot be used",
    "Inspect the proposed frontage or try a smaller movement."
  ],
  "frontage-geometry": [
    "Property frontage shape would change",
    "Review the proposed property shape and its street-facing edge."
  ],
  "frontage-distance": [
    "Property frontage shifts away from the road",
    "Review the proposed property frontage or try less displacement."
  ],
  "property-containment": [
    "Property would extend beyond its block",
    "The property boundary needs reconciliation before this change can be accepted."
  ],
  "plot-ownership": [
    "Plot relationship would need updating",
    "Check plot ownership in the proposed neighborhood."
  ],
  "building-ownership": [
    "Building relationship would need updating",
    "Review the affected building and its property in the preview."
  ],
  "road-clearance": [
    "Road clearance around a building changes",
    "Try a smaller road move; building clearance will require reconciliation."
  ],
  "access-connection": [
    "Access route would disconnect",
    "Inspect the proposed access route before applying."
  ],
  "access-entrance": [
    "Building entrance access is affected",
    "Apply requires a usable entrance connection."
  ],
  "access-unproven": [
    "Building access cannot be verified",
    "Inspect the connected roads; safe acceptance cannot be established yet."
  ],
  "face-split": [
    "A block would split",
    "Splitting blocks requires an explicit identity and property-reconciliation decision."
  ],
  "face-merged": [
    "Blocks would merge",
    "Merging blocks requires explicit identity and ownership reconciliation."
  ],
  "face-ambiguous": [
    "Block identity cannot be determined",
    "Review which existing block identity should survive; Mappo will not guess."
  ],
  "face-geometry": [
    "Block boundary would change",
    "This change preserves the reported block identity but may affect dependent records."
  ],
  "face-added": [
    "A new block would appear",
    "See the proposed block and its ownership in Details."
  ],
  "face-removed": [
    "An existing block would disappear",
    "See the replacement block group and its ownership in Details."
  ],
  "district-reference": [
    "District references would be affected",
    "District membership needs review before the road change can be applied."
  ],
  "defense-reference": [
    "Fortification references would be affected",
    "Review the affected wall, gate, or tower connections before acceptance."
  ],
  "gate-connection": [
    "Gate access connection would change",
    "Avoid protected gate approaches; special infrastructure edits need dedicated support."
  ],
  "candidate-validation": [
    "Full city validation did not pass",
    "Address the listed dependencies; graph validity alone does not prove a safe city."
  ],
  "impact-incomplete": [
    "Impact analysis could not finish",
    "Do not rely on a Safe result. Try a smaller change or inspect the underlying diagnostic."
  ],
  "unrecognized-dependency": [
    "Custom data needs review",
    "Mappo will preserve unknown fields, but cannot prove how they should adapt."
  ],
  "candidate-coordinate": [
    "Proposed coordinates are not usable",
    "Enter finite X and Y coordinates inside the permitted area."
  ],
  "face-coverage": [
    "Road faces no longer cover the expected region",
    "Move the junction to restore continuous, non-overlapping blocks."
  ]
};

export function summarizeRoadImpact(report) {
  const rank = { invalid: 0, 'needs-review': 1, info: 2 };
  const groups = new Map();
  for (const row of report?.affected ?? []) {
    const severity = Object.hasOwn(rank, row.severity) ? row.severity : 'needs-review';
    const code = typeof row.code === 'string' ? row.code : 'unknown-issue';
    const key = JSON.stringify([severity, code]);
    if (!groups.has(key)) {
      const fallback = code.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
      const [title, suggestion] = roadImpactGuidance[code] ?? [
        fallback,
        'This dependency cannot be safely resolved from the available preview. Inspect the affected records in Details.'
      ];
      groups.set(key, { key, severity, code, title, suggestion, rows: [], objects: new Set() });
    }
    const group = groups.get(key);
    group.rows.push(row);
    group.objects.add(JSON.stringify([row.kind, row.id]));
  }
  const sorted = [...groups.values()].sort((a,b) =>
    rank[a.severity] - rank[b.severity] || b.objects.size - a.objects.size || a.code.localeCompare(b.code)
  );
  return sorted.map(({ objects, ...group }) => ({ ...group, count: objects.size }));
}

function hasRoadBuildingChoice(row) {
  return row?.kind === 'building' &&
    ['building-decision-required','building-placement-blocked'].includes(row.code);
}

const roadRecordKeyD1 = (kind, id) => JSON.stringify([kind, id]);

function roadOutcomeD1(preview, ledger) {
  const moved = new Set(), access = new Set(), removed = new Set(), added = new Set();
  const visibleBuildings = new Set(preview.rows.filter(row =>
    row.kind === 'building' && row.originalPoints && row.proposedPoints).map(row => row.id));
  for (const entry of ledger) {
    if (entry.kind !== 'building') continue;
    if (['relocated','authorized-relocation'].includes(entry.disposition) && visibleBuildings.has(entry.newId))
      moved.add(entry.newId);
    if (entry.disposition === 'access-reconnected' && entry.newId) access.add(entry.newId);
    if (entry.oldId && !entry.newId) removed.add(entry.oldId);
    if (entry.newId && !entry.oldId) added.add(entry.newId);
  }
  for (const id of moved) access.delete(id);
  const count = (n, noun) => n + ' ' + noun + (n === 1 ? '' : 's');
  const parts = [];
  const groups = roadBlockGroupsD1(ledger);
  const blocks = preview.rows.filter(row => row.kind === 'block');
  const areas = new Set(blocks.map(row => groups.get(row.id) ?? row.id)).size;
  if (blocks.length) {
    const noun = areas === blocks.length ? 'block' : 'block area';
    parts.push(count(areas, noun) + (areas === 1 ? ' changes' : ' change'));
  }
  if (moved.size) parts.push(count(moved.size, 'building') + (moved.size === 1 ? ' moves' : ' move'));
  if (removed.size && added.size) parts.push('Rebuild development (' + removed.size + ' existing buildings replaced, ' + added.size + ' generated)');
  else if (removed.size) parts.push('Remove ' + count(removed.size, 'building'));
  else if (added.size) parts.push('Generate ' + count(added.size, 'building'));
  if (access.size) parts.push('Reconnect access for ' + count(access.size, 'building'));
  if (!parts.length && preview.counts.properties) {
    const n = preview.counts.properties;
    parts.push(n === 1 ? '1 property changes' : n + ' properties change');
  }
  return parts.length ? parts.join(' · ') : 'Change street geometry.';
}

// Group split and merged blocks by ledger links. Membership never implies
// one-to-one ancestry between old and newly generated buildings.
function roadBlockGroupsD1(ledger) {
  const groups = new Map();
  for (const entry of ledger) {
    if (entry.kind !== 'block') continue;
    const ids = [entry.oldId, entry.newId, ...(entry.successorIds ?? [])].filter(Boolean);
    const group = new Set(ids.flatMap(id => [...(groups.get(id) ?? [id])]));
    for (const id of group) groups.set(id, group);
  }
  return groups;
}

export class RoadInspectionWorkspace {
  constructor({
    getElement,
    getProject,
    camera,
    shell,
    capture,
    canEnter,
    beforeEnter = () => {},
    draw,
    reconcile = null,
    reconcileRoad = null,
    computeJunctionAsync = null,
    getRevision = () => 0,
    applyEdit = () => ({ok:false,message:'Road Apply not configured.'}),
    afterExit = () => {},
  }) {
    Object.assign(this, {
      $: getElement,
      getProject,
      camera,
      shell,
      capture,
      canEnter,
      beforeEnter,
      draw,
      getRevision,
      applyEdit,
      afterExit,
    });
    this.session = new RoadPreviewSession({
      getProject,
      reconcile,
      reconcileRoad,
      computeJunctionAsync,
      changed: () => {
        this.render();
        this.draw();
      },
    });
    this.limit = 50;
    this.reconciliationLimit = 50;
    this.bind();
  }
  get active() {
    return this.session.active;
  }
  get transient() {
    return Boolean(this.baseline);
  }
  savedWorkspace() {
    return this.transient && this.getProject() === this.baseline.project ? this.baseline.workspace : null;
  }
  start() {
    if (this.active) return;
    const reason = this.canEnter();
    if (reason) {
      this.$('roadModeNotice').textContent = reason;
      return;
    }
    this.$('roadPreviewBody').hidden = false;
    this.$('roadEditControlsD1').open = false;
    this.$('roadDetailsD1').open = false;
    this.session.showRoadDiagnostics = false;
    this.$('roadOverlayB3').checked = true;
    this.session.previewVisible = true;
    this.$('roadPreviewMinimize').textContent = 'Minimize';
    this.$('roadPreviewMinimize').setAttribute('aria-expanded', 'true');
    this.beforeEnter();
    const captured = this.capture();
    this.baseRevision = this.getRevision();
    this.applyError = '';
    this.baseline = { project: captured.project, workspace: JSON.parse(JSON.stringify(captured.workspace)) };
    this.session.start();
    const ui = this.baseline.workspace.ui;
    this.shell.reset({
      selection: ui.selection,
      transient: true,
      ui: {
        ...ui,
        inspectorCollapsed: true,
        toolsCollapsed: this.camera.width < 900 ? true : ui.toolsCollapsed,
      },
    });
    this.$('workspaceSection-city').inert = true;
    this.$('mapViewport').classList.add('road-inspection-active');
    this.$('layersMenuButton').disabled = true;
    this.$('workspaceOpenInspector').disabled = true;
    this.$('roadModeNotice').textContent = '';
    this.render();
    this.draw();
    this.$('roadPreviewHeading').focus();
  }
  exit({ restore = true, focus = false } = {}) {
    if (!this.transient) return;
    const baseline = this.baseline;
    this.session.stop();
    this.$('workspaceSection-city').inert = false;
    this.$('mapViewport').classList.remove('road-inspection-active');
    this.$('layersMenuButton').disabled = false;
    this.$('workspaceOpenInspector').disabled = false;
    if (restore && this.getProject() === baseline.project) {
      this.shell.reset({
        selection: baseline.workspace.ui.selection,
        transient: true,
        ui: baseline.workspace.ui,
      });
      Object.assign(this.camera, baseline.workspace.view.camera);
    }
    // Keep serialization/change suppression active throughout layout restoration.
    this.baseline = null;
    this.optionsKind = null;
    this.selectionKey = null;
    this.lastReport = undefined;
    this.lastReconciliation = undefined;
    this.applyError = '';
    this.render();
    this.afterExit();
    this.draw();
    if (focus) this.$('roadModeButton').focus();
  }
  reset() {
    if (!this.active) return;
    if (this.baseline) Object.assign(this.camera, this.baseline.workspace.view.camera);
    this.applyError = '';
    this.session.reset();
  }
  bind() {
    this.$('roadModeButton').addEventListener('click', () => this.start());
    this.$('roadPreviewCancel').addEventListener('click', () => this.exit({ focus: true }));
    this.$('roadLocate').addEventListener('click', () => {
      const d = this.session.details;
      if (!d) return;
      const points =
        d.kind === 'junction' ? [d.record] : d.endpoints.map((id) => this.session.graph.nodesById.get(id));
      this.camera.x = points.reduce((sum, p) => sum + p.x / points.length, 0);
      this.camera.y =
        points.reduce((sum, p) => sum + p.y / points.length, 0) +
        (this.camera.width < 900 ? (this.camera.height * 0.22) / this.camera.zoom : 0);
      this.draw();
    });
    this.$('roadPreviewReset').addEventListener('click', () => this.reset());
    this.$('roadResolveConflictC6').addEventListener('click', () => {
      const issue = this.session.reconciliation?.unresolved.find(hasRoadBuildingChoice);
      if (!issue) return;
      if (this.$('roadPreviewBody').hidden) this.$('roadPreviewMinimize').click();
      const target = document.getElementById('roadConflictC6-' + issue.id);
      if (!target) return;
      this.locateReconciliationB3(issue);
      target.scrollIntoView({block:'center'});
      target.querySelector('button')?.focus({preventScroll:true});
    });
    this.$('roadApplyB4').addEventListener('click', () => {
      if(this.$('roadApplyB4').disabled || !this.session.current())return;
      const revision = this.session.revision;
      const finish = result => {
        if (!this.session.current() || this.session.revision !== revision) return;
        this.applyingRevision = null;
        this.applyError = result?.ok ? '' : result?.message ?? 'Road Apply failed without changing the accepted city.';
        this.applyErrorRevision = revision;
        this.render();
      };
      const result = this.applyEdit(this.session, this.baseRevision);
      if (result?.then) {
        this.applyingRevision = revision;
        this.applyError = '';
        this.render();
        result.then(finish, error => finish({message: error.message}));
      } else finish(result);
    });
    this.$('roadPreviewMinimize').addEventListener('click', () => {
      const body = this.$('roadPreviewBody');
      body.hidden = !body.hidden;
      this.$('roadPreviewMinimize').setAttribute('aria-expanded', String(!body.hidden));
      this.$('roadPreviewMinimize').textContent = body.hidden ? 'Expand' : 'Minimize';
    });
    this.$('roadDetailsD1').addEventListener('toggle', () => {
      const open = this.$('roadDetailsD1').open;
      if (this.session.active && this.session.showRoadDiagnostics !== open) {
        this.session.showRoadDiagnostics = open;
        this.draw();
      }
    });
    this.$('roadSelectionKind').addEventListener('change', () => {
      this.optionsKind = null;
      const kind = this.$('roadSelectionKind').value;
      const index = kind === 'junction' ? this.session.graph.nodesById : this.session.graph.roadsById;
      this.session.select({ kind, id: index.keys().next().value });
    });
    this.$('roadSelectionId').addEventListener('change', () =>
      this.session.select({
        kind: this.$('roadSelectionKind').value,
        id: this.$('roadSelectionId').value,
      }),
    );
    this.$('roadStartBendsC4').addEventListener('click', () => {
      if (this.session.startBendEditor()) this.$('roadInsertBendC4').focus();
    });
    this.$('roadCloseBendsC4').addEventListener('click', () => {
      this.session.reset();
      this.$('roadStartBendsC4').focus();
    });
    this.$('roadInsertBendC4').addEventListener('click', () => this.session.insertBend());
    this.$('roadRemoveBendC4').addEventListener('click', () => this.session.removeBend());
    this.$('roadSelectBendC4').addEventListener('change', () =>
      this.session.selectBend(Number(this.$('roadSelectBendC4').value)));
    this.$('roadSnapBendsC4').addEventListener('change', () => {
      this.session.snapBends = this.$('roadSnapBendsC4').checked;
    });
    for (const id of ['roadBendXC4','roadBendYC4']) this.$(id).addEventListener('input', () => {
      const read = key => this.$(key).value.trim() === '' ? NaN : Number(this.$(key).value);
      this.session.moveBend({x:read('roadBendXC4'),y:read('roadBendYC4')});
    });
    for (const [id, kind] of [['roadReconnectC3','reconnect'], ['roadAddC3','add'], ['roadRemoveC3','remove']]) {
      this.$(id).addEventListener('click', () => this.session.previewRoadConnection({
        kind,
        endpoint: this.$('roadConnectionEndpointC3').value,
        target: this.$('roadConnectionTargetC3').value,
      }));
    }
    for(const id of ['roadIntentDxC1','roadIntentDyC1'])
      this.$(id).addEventListener('input',()=>{
        const read=id=>this.$(id).value.trim()===''?NaN:Number(this.$(id).value);
        this.session.updateRoadIntent({x:read('roadIntentDxC1'),y:read('roadIntentDyC1')});
      });
    for (const id of ['roadProposedX', 'roadProposedY'])
      this.$(id).addEventListener('input', () => {
        const number = (id) => (this.$(id).value.trim() === '' ? NaN : Number(this.$(id).value));
        this.session.update({ x: number('roadProposedX'), y: number('roadProposedY') });
      });
    for (const direction of ['Left', 'Right', 'Up', 'Down'])
      this.$('roadNudge' + direction).addEventListener('click', () => this.nudge(direction));
    this.$('roadClearBuildingChoicesC5').addEventListener('click',()=>this.session.clearBuildingDecisions());
    this.$('roadReconciliationMoreB3').addEventListener('click', () => {
      this.reconciliationLimit += 50;
      this.renderReconciliationB3();
    });
    this.$('roadOverlayB3').addEventListener('change', () => {
      this.session.previewVisible = this.$('roadOverlayB3').checked;
      this.draw();
    });
    this.$('roadShowMore').addEventListener('click', () => {
      this.limit += 50;
      this.renderReport();
    });
  }
  nudge(direction, multiplier = 1) {
    const step = Number(this.$('roadNudgeStep').value);
    if (!Number.isFinite(step) || step <= 0) return false;
    return this.session.nudge(
      (direction === 'Right' ? step : direction === 'Left' ? -step : 0) * multiplier,
      (direction === 'Down' ? step : direction === 'Up' ? -step : 0) * multiplier,
    );
  }
  render() {
    const s = this.session,
      panel = this.$('roadPreviewPanel');
    panel.hidden = !s.active;
    this.$('roadModeButton').setAttribute('aria-pressed', String(s.active));
    if (!s.active) return;
    const d = s.details,
      kind = d?.kind ?? 'junction';
    this.$('roadSelectionKind').value = kind;
    if (this.optionsKind !== kind) {
      const index = kind === 'junction' ? s.graph.nodesById : s.graph.roadsById;
      this.$('roadSelectionId').replaceChildren(
        ...[...index.keys()].map((id) => {
          const option = document.createElement('option');
          option.value = id;
          const detail = roadInspectionDetails(s.graph, { kind, id });
          option.textContent = id + (detail.protected ? ' · protected' : '');
          return option;
        }),
      );
      this.optionsKind = kind;
    }
    this.$('roadSelectionId').value = d?.id ?? '';
    this.$('roadRecordDetails').textContent = d
      ? `${d.id} · ${d.classes.join(', ')} · ${d.roadIds.length} road${d.roadIds.length === 1 ? '' : 's'} · ${d.protected ? 'Protected: ' + d.reasons.join(', ') : 'Ordinary / unprotected'}`
      : 'No road records available.';
    const key = JSON.stringify(s.selection);
    if (this.selectionKey !== key) {
      this.selectionKey = key;
      this.$('roadEndpointList').replaceChildren(
        ...(d?.endpoints ?? []).map((id) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'minor-button';
          button.textContent = (kind === 'road' ? 'Endpoint ' : '') + id;
          button.setAttribute(
            'aria-label',
            'Inspect ' + (kind === 'road' ? 'endpoint ' : 'connected junction ') + id,
          );
          button.addEventListener('click', () => {
            s.select({ kind: 'junction', id });
            this.$('roadSelectionId').focus();
          });
          return button;
        }),
      );
    }
    this.$('roadAcceptedPoint').textContent =
      kind === 'junction' && d
        ? `Accepted X ${d.record.x} · Y ${d.record.y}`
        : d
          ? `Endpoints ${d.record.a} (${s.graph.incidentRoads.get(d.record.a).length} connected roads) ↔ ${d.record.b} (${s.graph.incidentRoads.get(d.record.b).length} connected roads)`
          : '';
    this.$('roadIntentPanelC1').hidden=kind!=='road';
    const bends = s.bendEditor, bend = bends?.points[bends.selected];
    this.$('roadStartBendsC4').hidden = Boolean(bends);
    this.$('roadStartBendsC4').disabled = !s.roadIntentEligible || Boolean(s.drag);
    this.$('roadBendEditorC4').hidden = !bends;
    if (bends) {
      const count = bends.points.length;
      if (this.bendOptionsCount !== count) {
        this.bendOptionsCount = count;
        this.$('roadSelectBendC4').replaceChildren(...bends.points.map((_,index)=>{
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = 'Bend ' + (index+1);
          return option;
        }));
      }
      this.$('roadSelectBendC4').value = bend ? String(bends.selected) : '';
      this.$('roadSelectBendC4').disabled = !bend || Boolean(s.drag);
      this.$('roadInsertBendC4').disabled = Boolean(s.drag) || count >= ROAD_BEND_LIMIT;
      this.$('roadRemoveBendC4').disabled = !bend || Boolean(s.drag);
      for (const [id,key] of [['roadBendXC4','x'],['roadBendYC4','y']]) {
        this.$(id).disabled = !bend || Boolean(s.drag);
        if (document.activeElement !== this.$(id)) this.$(id).value = bend ? String(bend[key]) : '';
      }
      this.$('roadCloseBendsC4').disabled = Boolean(s.drag);
      this.$('roadSnapBendsC4').checked = Boolean(s.snapBends);
    }
    if (kind === 'road' && d && (this.connectionGraph !== s.graph || this.connectionRoad !== d.record.id)) {
      this.connectionGraph = s.graph;
      this.connectionRoad = d.record.id;
      const option = (value, label = value) => {
        const item = document.createElement('option');
        item.value = value;
        item.textContent = label;
        return item;
      };
      this.$('roadConnectionEndpointC3').replaceChildren(option('a', d.record.a), option('b', d.record.b));
      this.$('roadConnectionEndpointC3').value = 'b';
      const targets = [...s.graph.nodesById.values()]
        .filter(node => !d.endpoints.includes(node.id) && s.graph.incidentRoads.get(node.id)
          .every(id => !s.graph.roadClasses.get(id).protected))
        .sort((a,b) => a.id.localeCompare(b.id));
      this.$('roadConnectionTargetC3').replaceChildren(option('', 'Choose junction'), ...targets.map(node => option(node.id)));
    }
    for (const id of ['roadReconnectC3','roadAddC3','roadRemoveC3','roadConnectionEndpointC3','roadConnectionTargetC3'])
      this.$(id).disabled = !s.roadIntentEligible || Boolean(s.drag);
    for(const [id,field] of [['roadIntentDxC1','x'],['roadIntentDyC1','y']]){
      this.$(id).disabled=!s.roadIntentEligible;
      if(document.activeElement!==this.$(id))
        this.$(id).value=String(s.roadIntentOffset?.[field]??0);
    }
    this.$('roadIntentStatusC1').textContent=!s.roadIntentEligible ?
      'Protected connection: choose a road with two ordinary unprotected endpoints.' :
      s.roadIntentInputError || s.error ||
      (s.pending ? s.checking?'Checking the street and neighborhood…':
        s.hasApplyCandidate ? 'Street and local neighborhood ready to review.' :
        'Street placement held in draft. '+(s.reconciliation?.unresolved?.[0]?.message ??
          'The neighborhood could not be reconciled.') :
        bends ? 'Add or move a bend to preview the street shape.' :
        'Drag a road on the map or enter a displacement to preview your chosen street position.');
    this.$('roadPreviewEligibility').textContent = d?.movable
      ? 'Drag the selected junction, edit X/Y, or focus the map and use arrow keys. Space/middle drag pans.'
      : d?.protected
        ? 'Protected geometry is inspection only. Choose an ordinary junction to try a position.'
        : kind==='road' ? 'Drag an eligible ordinary road, enter X/Y displacement, or nudge using arrows. Review local adaptation before applying.' :
          'Choose an ordinary junction to try a position.';
    for (const [id, key] of [
      ['roadProposedX', 'x'],
      ['roadProposedY', 'y'],
    ]) {
      this.$(id).disabled = !d?.movable;
      if (document.activeElement !== this.$(id))
        this.$(id).value = s.point && Number.isFinite(s.point[key]) ? String(s.point[key]) : '';
    }
    for (const dir of ['Left', 'Right', 'Up', 'Down']) this.$('roadNudge' + dir).disabled = !(d?.movable || (bends ? bend : s.roadIntentEligible));
    this.$('roadPreviewReset').disabled = !s.pending && !s.checking && !s.error && !s.roadIntentInputError;
    this.$('roadReportError').textContent = s.error;
    this.$('roadReconciliationB3').hidden = false;
    this.$('roadClearBuildingChoicesC5').hidden = !s.buildingDecisions.size;
    this.$('roadClearBuildingChoicesC5').disabled = Boolean(s.drag) || s.checking;
    // A settled reconciliation is immutable for the life of this detached draft.
    // Reuse its derived display geometry on unrelated redraws and focus changes.
    if (this.previewProject !== s.project ||
        this.previewReconciliation !== s.reconciliation ||
        this.previewTopology !== s.topology) {
      this.previewProject = s.project;
      this.previewReconciliation = s.reconciliation;
      this.previewTopology = s.topology;
      this.cachedPreviewGeometry = s.reconciliation
        ? s.workerPreviewGeometry ?? roadReconciliationPreviewB3(s.project, s.reconciliation, s.topology)
        : null;
    }
    s.previewGeometry = this.cachedPreviewGeometry;
    if(this.applyError && this.applyErrorRevision!==s.revision)this.applyError='';
    const applying = this.applyingRevision === s.revision;
    const verified = Boolean(s.current() && s.pending && !s.checking && !s.drag && !s.error &&
      !s.roadIntentInputError && !s.reconciliationError && s.hasApplyCandidate &&
      s.reconciliation?.status==='candidate-only' && !s.reconciliation.unresolved?.length &&
      s.previewGeometry?.verified && s.settledRevision===s.revision &&
      this.getRevision()===this.baseRevision && s.acceptedFingerprint===JSON.stringify(s.project));
    const ready = !applying && verified && (kind==='junction' || kind==='road');
    s.roadPreviewVerifiedD1 = verified;
    this.$('roadApplyB4').disabled = !ready;
    const issue = s.reconciliation?.unresolved?.find(hasRoadBuildingChoice) ?? s.reconciliation?.unresolved?.[0];
    const actionable = !s.checking && !s.drag && hasRoadBuildingChoice(issue);
    const building = actionable && s.city.buildings.find(record => record.id === issue.id);
    this.$('roadResolveConflictC6').hidden = !actionable;
    const problem = this.applyError || s.roadIntentInputError || s.error || s.reconciliationError;
    const topologyOnly = s.previewGeometry?.mode==='topology-only';
    const status = applying ? 'Applying road edit' : this.applyError ? 'Apply failed' : problem ? 'Preview blocked' :
      s.drag ? 'Placement in progress' : s.checking ? 'Checking preview' :
      ready ? 'Preview ready' : actionable ? 'Building choice needed' :
      s.pending && s.settledRevision === s.revision && s.previewGeometry?.verified ? 'Preview out of date' :
      topologyOnly ? 'Roads and blocks only' : s.pending ? 'Preview blocked' : 'Accepted position';
    const message = applying ? 'Validating the road and neighborhood before Apply…' :
      problem || (s.drag ? 'Release the handle to check this edit.' :
        s.checking || ready ? '' :
        actionable ? (building?.customName || 'A building') + '. ' + issue.message :
        status==='Preview out of date' ? 'Reset the preview and try the edit again.' :
        issue?.message || s.proposal?.issues?.[0]?.message ||
        (s.pending ? 'The neighborhood change could not be verified.' : 'Drag a road or junction to preview an edit.'));
    let summary = '';
    if (ready) {
      if (this.outcomePreview !== s.previewGeometry) {
        this.outcomePreview = s.previewGeometry;
        this.outcomeSummary = roadOutcomeD1(s.previewGeometry, s.reconciliation.ledger ?? []);
      }
      summary = this.outcomeSummary;
    } else if (actionable) {
      const count = new Set(s.reconciliation.unresolved.filter(hasRoadBuildingChoice).map(row => row.id)).size;
      summary = count === 1 ? '1 building needs a choice' : count + ' buildings need choices';
    } else if (topologyOnly && !problem && !s.checking && !s.drag) {
      summary = 'Property and building changes are unresolved.';
    }
    for (const [id,text] of [['roadReportStatus',status],['roadApplyStatusB4',message],['roadChangeSummaryD1',summary]]) {
      const element = this.$(id);
      if (element.textContent !== text) element.textContent = text;
      if (element.hidden !== !text) element.hidden = !text;
    }
    this.renderBuildingDecisionsD2();
    panel.setAttribute('data-report-status', ready ? 'safe' : s.checking || applying ? 'checking' :
      problem || status==='Preview blocked' ? 'invalid' : s.pending ? 'needs-review' : 'idle');
    if (this.lastReconciliation !== s.reconciliation || this.lastTopology !== s.topology ||
        this.lastReconciliationError !== s.reconciliationError || this.lastChecking !== s.checking) {
      this.lastReconciliation = s.reconciliation;
      this.lastTopology = s.topology;
      this.lastReconciliationError = s.reconciliationError;
      this.lastChecking = s.checking;
      this.reconciliationLimit = 50;
      this.renderReconciliationB3();
    }
    if (this.lastReport !== s.report) {
      this.lastReport = s.report;
      this.limit = 50;
      this.renderReport();
    }
  }

  renderReconciliationB3() {
    const s=this.session, preview=s.previewGeometry;
    const status=this.$('roadReconciliationStatusB3');
    const list=this.$('roadReconciliationListB3');
    const more=this.$('roadReconciliationMoreB3');
    if(s.checking)status.textContent='Checking proposed geometry and land dependencies…';
    else if(s.reconciliationError)status.textContent=s.reconciliationError;
    else if(!s.pending)status.textContent='Accepted city unchanged. Move an ordinary street or junction to preview adaptation.';
    else if(!preview)status.textContent='Proposed road only; reconciliation has not completed.';
    else if(preview.mode==='reconciled')status.textContent='Local adaptation passed validation. Review the changes, then choose Apply.';
    else if(preview.mode==='topology-only')status.textContent='Roads and blocks only · property reconciliation unresolved. No parcel changes are claimed.';
    else status.textContent='Road proposal has unresolved constraints. No safely adapted parcel geometry is available.';
    const counts=this.$('roadReconciliationCountsB3');
    counts.textContent=preview?
      preview.counts.roads+' roads · '+preview.counts.blocks+' blocks · '+
      preview.counts.properties+' properties · '+preview.counts.plots+' plots · '+
      preview.counts.openSpaces+' open-space summaries · '+
      preview.counts.buildings+' building changes · '+
      preview.buildingsPreserved+' building footprints held fixed · '+preview.unresolved.length+' unresolved':
      'No reconciled candidate yet.';
    const rows=[...(preview?.rows??[])];
    if (s.roadConnectionEdit || s.reconciliation?.ledger?.some(row => row.disposition === 'created-junction')) {
      const priority = { junction:0, road:1, block:2, property:3, building:4, plot:5, 'open-space':6 };
      rows.sort((a,b) => (priority[a.kind] ?? 7) - (priority[b.kind] ?? 7));
    }
    const unresolved=[...(preview?.unresolved??[])]
      .sort((a,b)=>Number(hasRoadBuildingChoice(b))-Number(hasRoadBuildingChoice(a)));
    const ledger=s.reconciliation?.ledger??[];
    const disposition=new Map();
    for (const entry of ledger)
      for (const id of new Set([entry.oldId,entry.newId].filter(Boolean)))
        disposition.set(roadRecordKeyD1(entry.kind,id),entry);
    const visibleRows=new Set(rows.map(row=>roadRecordKeyD1(row.kind,row.id)));
    const successorGeometry=new Map(rows.filter(row=>row.kind==='block' && row.proposedPoints)
      .map(row=>[row.id,row]));
    const access=ledger.filter(row=>row.disposition==='access-reconnected' &&
      !visibleRows.has(roadRecordKeyD1(row.kind,row.oldId)))
      .map(row=>({kind:row.kind,id:row.oldId,state:'access-reconnected',entryType:'change'}));
    const all=[...unresolved.map(row=>({...row,entryType:'unresolved'})),
      ...rows.map(row=>({...row,entryType:'change'})),...access];
    const blockGroups = roadBlockGroupsD1(ledger);
    const groups = new Map();
    for (const row of all.slice(0,this.reconciliationLimit)) {
      const block = row.beforeBlockId ?? row.afterBlockId;
      const group = blockGroups.get(block);
      const key = row.entryType==='unresolved' ? 'Unresolved changes' :
        group?.size>1 ? 'Related blocks · ' + [...group].sort().join(', ') :
        block ? 'Block ' + block : 'Other changes';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const renderRow = row => {
      const item=document.createElement('li');
      item.className='road-change-record-d1';
      const description=document.createElement('p');
      const entry=row.entryType==='change' ? disposition.get(roadRecordKeyD1(row.kind,row.id)) : null;
      if(row.entryType==='change'){
        const measure=(name,oldValue,newValue)=>oldValue!=null&&newValue!=null?
          ' · '+name+': '+oldValue.toFixed(2)+' → '+newValue.toFixed(2):'';
        const descriptions={'authorized-relocation':'Approved building relocation',relocated:'Relocated building',regenerated:'Generated replacement',
          'created-junction':'New junction','removed-road':'Removed street',split:'Split at junction',
          created:'New record',retained:'Retained geometry',replaced:row.kind==='building'?'Replaced building':'Previous record'};
        description.textContent=row.kind+' '+row.id+' · '+
          (row.state==='topology-only'?'Proposed topology only':row.state==='access-reconnected'?'Reconnected access':
            descriptions[entry?.disposition]??'Adapted geometry')+
          (entry?.provenance==='generated'?' · Generated record':'')+
          (entry?.successorIds?.some(id=>id!==row.id) ? ' · Successor blocks: ' + entry.successorIds.join(', ') : '')+
          measure('area',row.oldArea,row.newArea)+
          measure('length',row.oldLength,row.newLength)+
          measure('frontage',row.oldFrontage,row.newFrontage);
      }else {
        const metrics=s.report?.affected?.find(r=>r.kind===row.kind&&r.id===row.id&&r.code===row.code)?.metrics;
        const values=metrics&&typeof metrics==='object'?Object.entries(metrics)
          .filter(([key,value])=>Number.isFinite(value))
          .map(([key,value])=>key+': '+value.toFixed(2)).join(' · '):'';
        const name=row.kind==='building' ? s.city.buildings.find(building=>building.id===row.id)?.customName : '';
        description.textContent='Unresolved '+row.kind+' '+row.id+(name?' · '+name:'')+
          ' · '+row.code+': '+row.message+(values?' · '+values:'');
      }
      const focus=document.createElement('button');
      focus.type='button';focus.className='minor-button';
      focus.textContent='Locate '+row.kind+' '+row.id;
      focus.setAttribute('aria-label','Locate '+row.kind+' '+row.id+' in the reconciliation preview');
      focus.addEventListener('click',()=>this.locateReconciliationB3(row));
      item.replaceChildren(description,focus);
      for (const id of entry?.successorIds ?? []) {
        const successor = successorGeometry.get(id);
        if (!successor || id===row.id) continue;
        const locate = document.createElement('button');
        locate.type = 'button';
        locate.className = 'minor-button';
        locate.textContent = 'Locate successor ' + id;
        locate.addEventListener('click', () => this.locateReconciliationB3(successor));
        item.append(locate);
      }
      if (row.entryType==='unresolved' && hasRoadBuildingChoice(row)) {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'minor-button';
        jump.textContent = 'Review building choice';
        jump.addEventListener('click', () => {
          const target = document.getElementById('roadConflictC6-' + row.id);
          if (!target) return;
          target.scrollIntoView({block:'center'});
          target.querySelector('button')?.focus({preventScroll:true});
        });
        item.append(jump);
      }
      return item;
    };
    list.replaceChildren(...[...groups].map(([title, rows]) => {
      const section = document.createElement('li');
      section.className = 'road-change-group-d1';
      const heading = document.createElement('h4');
      heading.textContent = title;
      const entries = document.createElement('ul');
      entries.replaceChildren(...rows.map(renderRow));
      section.replaceChildren(heading, entries);
      return section;
    }));
    more.hidden=all.length<=this.reconciliationLimit;
    this.$('roadReconciliationLegendB3').textContent=preview?.mode==='topology-only'?
      'Gray = accepted outlines · amber dashed = proposed roads/blocks only. Parcel adjustments remain unresolved.':
      'Gray = accepted · amber dashed = proposed blocks/roads · violet dashed = properties · teal dashed = plots · pink dashed = buildings.';
  }
  renderBuildingDecisionsD2() {
    const s = this.session, section = this.$('roadBuildingDecisionsD2');
    const list = this.$('roadDecisionListD2');
    const issues = s.reconciliation?.unresolved?.filter(hasRoadBuildingChoice) ?? [];
    const unresolved = new Map(issues.map(row => [row.id, row]));
    const ids = [...new Set([...unresolved.keys(), ...s.buildingDecisions.keys()])];
    // Superseded responses never authorize a choice or describe an Apply-ready preview.
    const settled = s.current() && s.pending && !s.drag && !s.checking &&
      s.settledRevision === s.revision;
    if (!settled || !ids.length) {
      section.hidden = true;
      list.replaceChildren();
      return;
    }
    section.hidden = false;
    const remaining = unresolved.size;
    this.$('roadDecisionIntroD2').textContent = remaining
      ? remaining + (remaining === 1 ? ' building needs a choice. ' : ' buildings need choices. ') +
        'Review the buildings below. The city is unchanged until Apply.'
      : 'These choices are previewed, not applied. Revise or clear an individual choice before Apply.';
    list.replaceChildren(...ids.map((id,index) =>
      this.buildingConflictControls(id,unresolved.get(id),index+1,ids.length)));
  }
  buildingConflictControls(id, issue, index, total) {
    const s=this.session, building=s.city.buildings.find(record=>record.id===id);
    const last=s.buildingDecisions.get(id), frame=buildingFrame(building);
    const controls=document.createElement('article');
    controls.className='road-building-choices road-building-choice-d2';
    controls.id='roadConflictC6-' + id;
    controls.setAttribute('aria-label',(building?.customName || 'Building '+id)+' decision');
    const heading=document.createElement('h4');
    heading.textContent=index+' of '+total+' · '+(building?.customName || 'Building '+id);
    const result=document.createElement('p');
    result.className='road-building-result-d2';
    const verified=s.previewGeometry?.verified && s.reconciliation?.status==='candidate-only' &&
      !s.reconciliation.unresolved?.length;
    const geometry=s.previewGeometry?.rows?.find(row=>row.kind==='building'&&row.id===id);
    result.textContent=issue ? 'Not resolved: '+issue.message
      :last?.kind==='fixed' ? 'Original footprint kept in the proposed city. Apply is still required.'
      :verified && geometry?.proposedPoints ? 'Proposed footprint shown on map. Apply is still required.'
      :'Choice recorded for this draft. A new footprint has not been verified.';
    const button=(label,action)=>{
      const node=document.createElement('button');
      node.type='button';node.className='minor-button';node.textContent=label;
      node.disabled=s.checking||Boolean(s.drag);
      node.addEventListener('click',action);
      return node;
    };
    const actions=document.createElement('div');
    actions.className='road-building-actions-d2';
    const suggest=button('Suggest a new location',()=>s.decideBuilding(id,{kind:'auto'}));
    const keep=button('Keep it here',()=>s.decideBuilding(id,{kind:'fixed'}));
    const rejectedFixed=last?.kind==='fixed'&&issue?.code==='building-placement-blocked';
    if(rejectedFixed)keep.disabled=true;
    const locate=button('Locate on map',()=>this.locateReconciliationB3({kind:'building',id}));
    actions.append(suggest,keep,locate);
    const note=document.createElement('p');
    note.className='hint';
    note.textContent=rejectedFixed
      ?'Keeping the original footprint failed validation. Try another location.'
      :'Only a verified proposal can be applied. The accepted building stays unchanged.';
    const more=document.createElement('details');
    more.className='road-building-more-d2';
    const summary=document.createElement('summary');summary.textContent='More options';
    const fields=document.createElement('div');fields.className='road-preview-selectors';
    const input=(title,value)=>{
      const label=document.createElement('label'), field=document.createElement('input');
      label.textContent=title;field.type='number';field.step='any';field.value=String(value);
      label.append(field);fields.append(label);return field;
    };
    const x=input('Center X',last?.x??frame.x),y=input('Center Y',last?.y??frame.y);
    const angle=input('Rotate by degrees',last?.angle!=null?last.angle*180/Math.PI:0);
    const number=field=>field.value.trim()===''?NaN:Number(field.value);
    const place=button('Preview exact placement',()=>{
      const position={x:number(x),y:number(y),angle:number(angle)*Math.PI/180};
      if(!Object.values(position).every(Number.isFinite)){
        note.textContent='Enter valid finite coordinates and rotation before previewing.';
        return;
      }
      s.decideBuilding(id,{kind:'position',...position});
    });
    more.replaceChildren(summary,fields,place);
    controls.replaceChildren(heading,result,actions,note,more);
    if(last){
      const chosen=document.createElement('p');chosen.className='road-building-selected-d2';
      chosen.textContent='Your choice: '+({fixed:'Keep it here',auto:'Suggest a new location',
        position:'Exact placement'}[last.kind]??'Placement')+
        (issue?' · revise this choice to continue':' · previewed');
      controls.append(chosen,button('Clear this choice',()=>s.clearBuildingDecision(id)));
    }
    return controls;
  }
  locateReconciliationB3(row) {
    const s=this.session;
    const geometry=s.previewGeometry?.rows.find(r=>r.kind===row.kind&&r.id===row.id);
    const points=geometry?.proposedPoints??geometry?.originalPoints??[];
    const valid=points.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(valid.length){
      this.camera.x=valid.reduce((n,p)=>n+p.x,0)/valid.length;
      this.camera.y=valid.reduce((n,p)=>n+p.y,0)/valid.length;
    }else this.locateImpact(row);
    s.focusKey=JSON.stringify([row.kind,row.id]);
    this.draw();
  }
  locateImpact(row) {
    const city = this.getProject()?.city;
    if (!city || !row) return;
    const lookup = {
      junction: ['nodes'], road: ['roads'], block: ['blocks'], property: ['properties'],
      plot: ['plots'], building: ['buildings'], district: ['districts'],
      defense: ['walls','gates','towers'], water: ['waterFeatures','bridges','waterFaces'],
      terrain: ['terrainFeatures','terrainPasses','terrainFaces'],
      'open-space': ['openSpaces'], plaza: ['plaza']
    };
    let record = null;
    for (const key of lookup[row.kind] ?? []) {
      const source = city[key];
      const found = Array.isArray(source) ? source.find((r) => r.id === row.id) : source?.id === row.id ? source : null;
      if (found) { record = found; break; }
    }
    const nodes = this.session.graph.nodesById;
    let points = [];
    if (row.kind === 'road' && record) points = [record.a,record.b].map(id=>nodes.get(id));
    else if (row.kind === 'district' && record) {
      points = (city.blocks ?? []).filter(b=>b.districtId === record.id)
        .flatMap(b=>(b.vertices??[]).map(id=>nodes.get(id)));
    } else if (record) {
      const raw = record.boundary ?? record.footprint ?? record.polygon ?? record.path ??
        record.points ?? record.vertices ?? (record.center ? [record.center] : [record]);
      points = (Array.isArray(raw) ? raw : []).map(p=>typeof p==='string' ? nodes.get(p) : p);
    }
    const valid = points.filter(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!valid.length) return;
    this.camera.x = valid.reduce((sum,p)=>sum+p.x,0)/valid.length;
    this.camera.y = valid.reduce((sum,p)=>sum+p.y,0)/valid.length;
    this.draw();
  }
  renderReport() {
    const report = this.session.report;
    const groups = summarizeRoadImpact(report);
    const list = this.$('roadReportList');
    const shown = groups.slice(0, this.limit);
    list.replaceChildren(...shown.map(group => {
      const item = document.createElement('li');
      const heading = document.createElement('details');
      const summary = document.createElement('summary');
      const label = group.severity === 'invalid' ? 'Blocking' :
        group.severity === 'needs-review' ? 'Review required' : 'Information';
      summary.textContent = label + ' · ' + group.title + ' · ' + group.count +
        (group.count === 1 ? ' affected object' : ' affected objects');
      heading.replaceChildren(summary);
      const explanation = document.createElement('p');
      explanation.textContent = group.suggestion;
      heading.replaceChildren(summary, explanation);
      const details = document.createElement('ul');
      for (const row of group.rows) {
        const line = document.createElement('li');
        const text = document.createElement('p');
        text.textContent = row.kind + ' ' + row.id + ': ' + row.message;
        const technical = document.createElement('small');
        technical.textContent = 'Code: ' + group.code +
          (row.relatedIds?.length ? ' · Related: ' + row.relatedIds.join(', ') : '');
        line.replaceChildren(text, technical);
        const locate = document.createElement('button');
        locate.type = 'button';
        locate.className = 'minor-button';
        locate.textContent = 'Locate ' + row.kind + ' ' + row.id;
        locate.setAttribute('aria-label', 'Locate affected ' + row.kind + ' ' + row.id + ' on map');
        locate.addEventListener('click', () => this.locateImpact(row));
        line.replaceChildren(text, technical, locate);
        details.append(line);
      }
      heading.replaceChildren(summary, explanation, details);
      item.replaceChildren(heading);
      return item;
    }));
    list.hidden = !groups.length;
    this.$('roadShowMore').hidden = groups.length <= this.limit;
    this.$('roadReportSummary').textContent = report
      ? (report.complete ? 'Analysis complete. ' : 'Analysis incomplete; safety is not proven. ') +
        groups.filter(g=>g.severity==='invalid').length + ' blocking cause groups · ' +
        groups.filter(g=>g.severity==='needs-review').length + ' review groups · ' +
        (report.counts?.affectedObjects ?? 0) + ' affected objects. ' +
        (report.requiresReconciliation ? 'The initial impact analysis flags dependencies for reconciliation. ' : '') +
        Math.min(this.limit,groups.length) + ' of ' + groups.length + ' groups shown. Expand a group for exact IDs, technical details, and map navigation.'
      : 'Change a junction position to inspect its impact. Accepted geometry stays unchanged.';
    const metrics=report?.metrics;
    this.$('roadReportMetrics').textContent=metrics
      ? `${metrics.roads.length} changed road measurements · ${metrics.faces.length} face measurements · ${metrics.topology?.split.length ?? 0} splits · ${metrics.topology?.merged.length ?? 0} merges`
      : '';
  }
}

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
    "This boundary, bridge, bank, plaza, or terrain connection cannot be altered in 0.2A."
  ],
  "road-setback": [
    "Buildings or parcels are too close to the road",
    "Try a smaller movement. Setback reconciliation is planned for 0.2B."
  ],
  "frontage-missing": [
    "Property loses its road-facing edge",
    "Preserving or rebuilding property frontage requires controlled reconciliation in 0.2B."
  ],
  "frontage-block": [
    "Property frontage no longer matches its block",
    "The adjacent block and property frontage would need coordinated updates in 0.2B."
  ],
  "frontage-unusable": [
    "Property frontage cannot be used",
    "Try a smaller movement or postpone until frontage reconciliation is implemented."
  ],
  "frontage-geometry": [
    "Property frontage shape would change",
    "Reshaping this property safely is reserved for 0.2B."
  ],
  "frontage-distance": [
    "Property frontage shifts away from the road",
    "Try less displacement or review the property during later reconciliation."
  ],
  "property-containment": [
    "Property would extend beyond its block",
    "The property boundary needs reconciliation before this change can be accepted."
  ],
  "plot-ownership": [
    "Plot relationship would need updating",
    "Plot ownership must be preserved and explicitly reconciled in 0.2B."
  ],
  "building-ownership": [
    "Building relationship would need updating",
    "Review the affected building and property before future acceptance."
  ],
  "road-clearance": [
    "Road clearance around a building changes",
    "Try a smaller road move; building clearance will require reconciliation."
  ],
  "access-connection": [
    "Access route would disconnect",
    "Keep the route connected or resolve access relationships during 0.2B."
  ],
  "access-entrance": [
    "Building entrance access is affected",
    "A future Apply must preserve a usable entrance connection."
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
    "A future edit must explicitly assign ownership and a stable new identity."
  ],
  "face-removed": [
    "An existing block would disappear",
    "Deletion is not allowed in 0.2A; a future reconciliation must explicitly resolve it."
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
        'Inspect the detailed diagnostic. This dependency cannot be safely resolved by the 0.2A preview.'
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
    this.$('roadApplyB4').addEventListener('click', () => {
      if(this.$('roadApplyB4').disabled || !this.session.current())return;
      const result=this.applyEdit(this.session,this.baseRevision);
      if(!result?.ok){
        this.applyError=result?.message??'Road Apply failed without changing the accepted city.';
        this.applyErrorRevision=this.session.revision;
        this.render();
      }
    });
    this.$('roadPreviewMinimize').addEventListener('click', () => {
      const body = this.$('roadPreviewBody');
      body.hidden = !body.hidden;
      this.$('roadPreviewMinimize').setAttribute('aria-expanded', String(!body.hidden));
      this.$('roadPreviewMinimize').textContent = body.hidden ? 'Expand' : 'Minimize';
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
    for (const id of ['roadBendXC4','roadBendYC4']) this.$(id).addEventListener('change', () => {
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
        s.reconciliation?.candidateProject ? 'Street and local neighborhood ready to review.' :
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
    const status = s.roadIntentInputError ? 'Invalid road offset' :
      s.details?.kind==='road' && s.pending ?
      (s.checking?'Checking road draft':'Street placement drafted') : s.error
      ? 'Report unavailable'
      : s.checking
        ? 'Checking'
        : s.report
          ? { safe: 'Safe', 'needs-review': 'Needs review', invalid: 'Invalid' }[s.report.status]
          : 'Accepted position · no proposed change';
    const live =
      status +
      (s.report
        ? ` · ${s.report.counts.affectedObjects} affected · ${s.report.counts.issues} issues · ${s.report.counts.preservedObjects} preserved`
        : '');
    if (this.$('roadReportStatus').textContent !== live) this.$('roadReportStatus').textContent = live;
    panel.setAttribute('data-report-status',
      s.roadIntentInputError ? 'invalid' : s.report?.status ?? (s.checking ? 'checking' : 'idle'));
    this.$('roadReportError').textContent = s.error;
    this.$('roadReconciliationB3').hidden = false;
    const computed = s.reconciliation ? roadReconciliationPreviewB3(s.project, s.reconciliation, s.topology) : null;
    s.previewGeometry = computed;
    if(this.applyError && this.applyErrorRevision!==s.revision)this.applyError='';
    const ready=Boolean((kind==='junction' || kind==='road') && s.current() && s.pending && !s.checking && !s.drag && !s.error &&
      !s.reconciliationError && s.reconciliation?.candidateProject &&
      s.reconciliation?.status==='candidate-only' && !s.reconciliation.unresolved?.length &&
      s.previewGeometry?.verified && s.settledRevision===s.revision &&
      s.acceptedFingerprint===JSON.stringify(s.project) &&
      this.getRevision()===this.baseRevision);
    this.$('roadApplyB4').disabled=!ready;
    this.$('roadApplyStatusB4').textContent=this.applyError || (ready ?
      'Eligible preview. Apply will recompute, validate and confirm portable save compatibility before acceptance.' :
      'Apply is unavailable until a fully reconciled, current road candidate passes validation.');
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
    const unresolved=preview?.unresolved??[];
    const ledger=s.reconciliation?.ledger??[];
    const disposition=new Map(ledger.map(row=>[row.kind+' '+(row.oldId??row.newId),row]));
    const access=ledger.filter(row=>row.disposition==='access-reconnected')
      .map(row=>({kind:row.kind,id:row.oldId,state:'access-reconnected',entryType:'change'}));
    const all=[...rows.map(row=>({...row,entryType:'change'})),...access,
      ...unresolved.map(row=>({...row,entryType:'unresolved'}))];
    list.replaceChildren(...all.slice(0,this.reconciliationLimit).map(row=>{
      const item=document.createElement('li');
      const description=document.createElement('p');
      if(row.entryType==='change'){
        const measure=(name,oldValue,newValue)=>oldValue!=null&&newValue!=null?
          ' · '+name+': '+oldValue.toFixed(2)+' → '+newValue.toFixed(2):'';
        const entry=disposition.get(row.kind+' '+row.id);
        const descriptions={relocated:'Relocated building',regenerated:'Generated replacement',
          'created-junction':'New junction','removed-road':'Removed street',split:'Split at junction',
          created:'New record',retained:'Retained geometry',replaced:row.kind==='building'?'Replaced building':'Previous record'};
        description.textContent=row.kind+' '+row.id+' · '+
          (row.state==='topology-only'?'Proposed topology only':row.state==='access-reconnected'?'Reconnected access':
            descriptions[entry?.disposition]??'Adapted geometry')+
          (entry?.provenance==='generated'?' · Generated record':'')+
          measure('area',row.oldArea,row.newArea)+
          measure('length',row.oldLength,row.newLength)+
          measure('frontage',row.oldFrontage,row.newFrontage);
      }else {
        const metrics=s.report?.affected?.find(r=>r.kind===row.kind&&r.id===row.id&&r.code===row.code)?.metrics;
        const values=metrics&&typeof metrics==='object'?Object.entries(metrics)
          .filter(([key,value])=>Number.isFinite(value))
          .map(([key,value])=>key+': '+value.toFixed(2)).join(' · '):'';
        description.textContent='Unresolved '+row.kind+' '+row.id+
          ' · '+row.code+': '+row.message+(values?' · '+values:'');
      }
      item.replaceChildren(description);
      const focus=document.createElement('button');
      focus.type='button';focus.className='minor-button';
      focus.textContent='Locate '+row.kind+' '+row.id;
      focus.setAttribute('aria-label','Locate '+row.kind+' '+row.id+' in the reconciliation preview');
      focus.addEventListener('click',()=>this.locateReconciliationB3(row));
      item.replaceChildren(description,focus);
      return item;
    }));
    more.hidden=all.length<=this.reconciliationLimit;
    this.$('roadReconciliationLegendB3').textContent=preview?.mode==='topology-only'?
      'Gray = accepted outlines · amber dashed = proposed roads/blocks only. Parcel adjustments remain unresolved.':
      'Gray = accepted · amber dashed = proposed blocks/roads · violet dashed = properties · teal dashed = plots · pink dashed = buildings.';
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
        details.replaceChildren(...(details.children ?? []), line);
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
        (report.requiresReconciliation ? 'Road-dependent city objects require future 0.2B reconciliation. ' : '') +
        Math.min(this.limit,groups.length) + ' of ' + groups.length + ' groups shown. Expand a group for exact IDs, technical details, and map navigation.'
      : 'Change a junction position to inspect its impact. Accepted geometry stays unchanged.';
    const metrics=report?.metrics;
    this.$('roadReportMetrics').textContent=metrics
      ? `${metrics.roads.length} changed road measurements · ${metrics.faces.length} face measurements · ${metrics.topology?.split.length ?? 0} splits · ${metrics.topology?.merged.length ?? 0} merges`
      : '';
  }
}

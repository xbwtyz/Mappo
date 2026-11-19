import { RoadPreviewSession } from '../editor/road-preview.js';
import { roadInspectionDetails } from '../core/road-inspection.js';


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
      afterExit,
    });
    this.session = new RoadPreviewSession({
      getProject,
      changed: () => {
        this.render();
        this.draw();
      },
    });
    this.limit = 50;
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
    this.$('roadPreviewMinimize').textContent = 'Minimize';
    this.$('roadPreviewMinimize').setAttribute('aria-expanded', 'true');
    this.beforeEnter();
    const captured = this.capture();
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
    this.render();
    this.afterExit();
    this.draw();
    if (focus) this.$('roadModeButton').focus();
  }
  reset() {
    if (!this.active) return;
    if (this.baseline) Object.assign(this.camera, this.baseline.workspace.view.camera);
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
    for (const id of ['roadProposedX', 'roadProposedY'])
      this.$(id).addEventListener('input', () => {
        const number = (id) => (this.$(id).value.trim() === '' ? NaN : Number(this.$(id).value));
        this.session.update({ x: number('roadProposedX'), y: number('roadProposedY') });
      });
    for (const direction of ['Left', 'Right', 'Up', 'Down'])
      this.$('roadNudge' + direction).addEventListener('click', () => this.nudge(direction));
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
    this.$('roadPreviewEligibility').textContent = d?.movable
      ? 'Drag the selected junction, edit X/Y, or focus the map and use arrow keys. Space/middle drag pans.'
      : d?.protected
        ? 'Protected geometry is inspection only. Choose an ordinary junction to try a position.'
        : 'Choose an ordinary junction to try a position. Roads are inspection only.';
    for (const [id, key] of [
      ['roadProposedX', 'x'],
      ['roadProposedY', 'y'],
    ]) {
      this.$(id).disabled = !d?.movable;
      if (document.activeElement !== this.$(id))
        this.$(id).value = s.point && Number.isFinite(s.point[key]) ? String(s.point[key]) : '';
    }
    for (const dir of ['Left', 'Right', 'Up', 'Down']) this.$('roadNudge' + dir).disabled = !d?.movable;
    this.$('roadPreviewReset').disabled = !s.pending && !s.checking && !s.error;
    const status = s.error
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
    panel.setAttribute('data-report-status', s.report?.status ?? (s.checking ? 'checking' : 'idle'));
    this.$('roadReportError').textContent = s.error;
    if (this.lastReport !== s.report) {
      this.lastReport = s.report;
      this.limit = 50;
      this.renderReport();
    }
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

import { RoadPreviewSession } from '../editor/road-preview.js';
import { roadInspectionDetails } from '../core/road-inspection.js';

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
  renderReport() {
    const report = this.session.report,
      rows = report?.affected ?? [];
    this.$('roadReportList').replaceChildren(
      ...rows.slice(0, this.limit).map((row) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = `${row.kind} ${row.id} · ${row.severity} · ${row.code}`;
        const description = document.createElement('p');
        description.textContent = row.message;
        const related = document.createElement('small');
        related.textContent = row.relatedIds.length ? 'Related: ' + row.relatedIds.join(', ') : '';
        item.replaceChildren(title, description, related);
        return item;
      }),
    );
    this.$('roadReportList').hidden = !rows.length;
    this.$('roadShowMore').hidden = rows.length <= this.limit;
    this.$('roadReportSummary').textContent = report
      ? `${report.complete ? 'Complete analysis.' : 'Analysis incomplete; safety is not proven.'} ${report.requiresReconciliation ? 'Dependent objects require reconciliation.' : ''} ${Math.min(rows.length, this.limit)} of ${rows.length} report entries shown.`
      : 'Change a junction position to inspect its impact. Accepted geometry stays unchanged.';
    const metrics = report?.metrics;
    this.$('roadReportMetrics').textContent = metrics
      ? `${metrics.roads.length} changed road measurements · ${metrics.faces.length} face measurements · ${metrics.topology?.split.length ?? 0} splits · ${metrics.topology?.merged.length ?? 0} merges`
      : '';
  }
}

import {
  DistrictEditor
} from '../editor/districts.js';
import { buildDistrictTopology } from '../core/district-topology.js';
import {
  pointInPolygon
} from '../core/geometry.js';

export class DistrictPanel {
  constructor({
    drafts,
    getElement,
    getCity,
    commit,
    undoHistory,
    historyAvailable,
    changed,
    activateLayers = () => {},
    document = globalThis.document
  }) {
    this.$ = getElement;
    this.drafts = drafts;
    this.activateLayers = activateLayers;
    this.getCity = getCity;
    this.commit = commit;
    this.undoHistory = undoHistory;
    this.historyAvailable = historyAvailable ?? (() => this.editor.history.length > 0);
    this.changed = changed;
    this.document = document;
    this.editor = new DistrictEditor();
    this.formDistrictId = null;
    this.formBlockId = null;
    this.formCache = new Map();
    this.onRefresh = () => {};
    this.onMapSelect = () => {};
  }
  stashDraft() {
    if (this.formDistrictId) this.formCache.set(this.formDistrictId, {
      name: String(this.$('districtNameInput').value),
      color: String(this.$('districtColorInput').value)
    });
  }
  snapshotUI() {
    this.stashDraft();
    return {
      formCache: [...this.formCache].slice(0, 80).map(([id, values]) => ({
        id, ...values
      }))
    };
  }
  restoreUI(saved) {
    this.formCache = new Map((saved?.formCache ?? []).map(entry => [
      entry.id, { name: entry.name, color: entry.color }
    ]));
  }
  message(text, error = false) {
    for (const id of ['districtMessage', 'districtGenerationMessage']) {
      this.$(id).textContent = text;
      this.$(id).classList.toggle('error', error);
    }
  }
  options(id, items, value) {
    const select = this.$(id);
    select.replaceChildren(...items.map(item => {
      const option = this.document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      return option;
    }));
    select.value = value ?? '';
  }
  refresh(resetControls = false) {
    const city = this.getCity(),
      active = city.districtState.status === 'assigned',
      district = active ? city.districts.find(d => d.id === this.editor.selectedDistrictId) : null;
    this.options('districtSelect', [{
      value: '',
      label: active ? 'Choose a neighborhood' : 'No districts yet'
    }, ...(active ? city.districts.map(d => ({
      value: d.id,
      label: d.name
    })) : [])], district?.id);
    const selectionChanged = this.formDistrictId !== (district?.id ?? null);
    if (selectionChanged && !resetControls) this.stashDraft();
    if (resetControls) this.formCache.clear();
    if (resetControls || selectionChanged) {
      const saved = !resetControls && district ? this.formCache.get(district.id) : null;
      this.$('districtNameInput').value = saved?.name ?? district?.name ?? '';
      this.$('districtColorInput').value = saved?.color ?? district?.color ?? '#cba480';
    }
    this.formDistrictId = district?.id ?? null;
    this.$('applyDistrictButton').disabled = !district;
    this.$('districtNameInput').disabled = !district;
    this.$('districtColorInput').disabled = !district;
    this.$('undoDistrictButton').disabled = !this.historyAvailable();
    this.$('districtCount').textContent = active ? city.districts.length : 0;
    if (resetControls) {
      this.$('districtNumberInput').value = active ? String(city.districtState.requestedCount ?? 'auto') : 'auto';
      this.$('districtSeedInput').value = active ? (city.districtState.seed ?? city.id) : city.id;
    }
    const topology = buildDistrictTopology(city),
      block = topology.blocks.get(this.editor.selectedBlockId);
    this.$('selectedDistrictBlock').textContent = block ? `Selected block: ${block.id}` : 'Click a block in Pan map mode to move it.';
    const targets = active && block ? [...new Set([...topology.neighbors.get(block.id)].map(id => topology.blocks.get(id).districtId).filter(id => id !== block.districtId))] : [];
    const priorTarget = !resetControls && !selectionChanged && this.formBlockId === (block?.id ?? null)
      ? this.$('districtTargetInput').value : '';
    this.options('districtTargetInput', [{
      value: '',
      label: 'Move to neighboring district'
    }, ...targets.map(id => ({
      value: id,
      label: city.districts.find(d => d.id === id).name
    }))], targets.includes(priorTarget) ? priorTarget : '');
    this.formBlockId = block?.id ?? null;
    this.$('moveDistrictButton').disabled = !targets.length;
    this.onRefresh();
  }
  selectAt(point) {
    const city = this.getCity();
    if (city.districtState.status !== 'assigned') {
      this.message('Generate districts to inspect neighborhoods.');
      return;
    }
    const nodes = new Map(city.nodes.map(n => [n.id, n]));
    const block = city.blocks.find(b => pointInPolygon(point, b.vertices.map(id => nodes.get(id))));
    this.editor.selectedBlockId = block?.id ?? null;
    this.editor.selectedDistrictId = block?.districtId ?? null;
    this.refresh();
    this.changed();
    if (block) this.$('districtPanel').open = true;
    if (block) this.onMapSelect();
  }
  syncDraft(operation, issues = []) {
    const city = this.getCity();
    const district = city.districts.find(item => item.id === this.editor.selectedDistrictId);
    const name = this.$('districtNameInput').value, color = this.$('districtColorInput').value;
    const target = this.$('districtTargetInput').value;
    const counts = [this.$('districtNumberInput').value, this.$('districtSeedInput').value];
    const input = operation === 'generate' ? counts : operation === 'move' ? [this.editor.selectedBlockId, target]
      : [district?.id, name, color];
    const dirty = operation === 'generate'
      ? String(city.districtState.requestedCount ?? 'auto') !== counts[0] || (city.districtState.seed ?? city.id) !== counts[1]
      : operation === 'move' ? Boolean(target) : Boolean(district && (name !== district.name || color !== district.color));
    const draft = this.drafts.sync('district-' + operation, { staged: true,
      intent: JSON.stringify(input), dirty: dirty || issues.length > 0, issues,
      target: district ? { kind: 'district', id: district.id } : undefined,
    });
    this.$('districtPanel').setAttribute('data-draft-' + operation, draft.status);
  }
  apply(operation, action, message) {
    this.syncDraft(operation);
    return this.drafts.apply('district-' + operation, current => current() && this.operation(action, message, operation),
      { validateOnApply: true });
  }
  operation(action, message, operation) {
    try {
      const before = this.getCity();
      const beforeHistory = this.editor.history.slice();
      const city = action();
      if (JSON.stringify(before) === JSON.stringify(city)) this.editor.history = beforeHistory;
      this.commit(city, { operation, beforeHistory });
      // Refill committed values without clearing independent generation inputs.
      if (this.formDistrictId) this.formCache.delete(this.formDistrictId);
      this.formDistrictId = null;
      this.formBlockId = null;
      this.refresh();
      this.message(message);
      for (const id of ['districtNameInput', 'districtColorInput', 'districtTargetInput', 'districtNumberInput']) this.$(id).setAttribute?.('aria-invalid', 'false');
      this.changed();
      return true;
    } catch (error) {
      if (operation) this.syncDraft(operation, [{ code: 'district-' + operation, message: error.message }]);
      this.message(error.message, true);
      const id = /color/i.test(error.message) ? 'districtColorInput'
        : /name/i.test(error.message) ? 'districtNameInput'
        : /district count|district number/i.test(error.message) ? 'districtNumberInput'
        : 'districtTargetInput';
      this.$(id).setAttribute?.('aria-invalid', 'true');
      return false;
    }
  }
  bind() {
    this.$('generateDistrictButton').addEventListener('click', () => {
      const unassigned = this.getCity().districtState.status !== 'assigned';
      const result = this.apply('generate', () => this.editor.generate(this.getCity(), {
        count: this.$('districtNumberInput').value,
        seed: this.$('districtSeedInput').value
      }), 'Neighborhoods rebuilt. Streets, properties and buildings were preserved.');
      if (result && unassigned) this.activateLayers();
      return result;
    });
    this.$('applyDistrictButton').addEventListener('click', () => this.apply('identity', () => this.editor.edit(this.getCity(), this.$('districtNameInput').value, this.$('districtColorInput').value), 'District name and color updated.'));
    this.$('moveDistrictButton').addEventListener('click', () => this.apply('move', () => this.editor.move(this.getCity(), this.$('districtTargetInput').value), 'Block moved. Both districts remain connected.'));
    this.$('undoDistrictButton').addEventListener('click', () => this.undoHistory?.());
    this.$('districtSelect').addEventListener('change', () => {
      this.editor.selectedDistrictId = this.$('districtSelect').value || null;
      this.editor.selectedBlockId = null;
      this.refresh();
      this.changed();
    });
    for (const id of ['districtNumberInput', 'districtSeedInput', 'districtNameInput', 'districtColorInput', 'districtTargetInput']) {
      const operation = id === 'districtNumberInput' || id === 'districtSeedInput' ? 'generate'
        : id === 'districtTargetInput' ? 'move' : 'identity';
      const changed = () => { this.syncDraft(operation); this.changed(); };
      this.$(id).addEventListener('change', changed);
      this.$(id).addEventListener('input', changed);
    }
  }
}

import {
  DistrictEditor
} from '../editor/districts.js';
import {
  buildDistrictTopology,
  districtSummary
} from '../core/district-topology.js';
import {
  pointInPolygon
} from '../core/geometry.js';

export class DistrictPanel {
  constructor({
    getElement,
    getCity,
    commit,
    changed,
    activateLayers = () => {},
    document = globalThis.document
  }) {
    this.$ = getElement;
    this.activateLayers = activateLayers;
    this.getCity = getCity;
    this.commit = commit;
    this.changed = changed;
    this.document = document;
    this.editor = new DistrictEditor();
    this.formDistrictId = null;
    this.formBlockId = null;
    this.onRefresh = () => {};
    this.onMapSelect = () => {};
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
    if (resetControls || selectionChanged) {
      this.$('districtNameInput').value = district?.name ?? '';
      this.$('districtColorInput').value = district?.color ?? '#cba480';
    }
    this.formDistrictId = district?.id ?? null;
    this.$('applyDistrictButton').disabled = !district;
    this.$('districtNameInput').disabled = !district;
    this.$('districtColorInput').disabled = !district;
    this.$('undoDistrictButton').disabled = !this.editor.history.length;
    this.$('districtCount').textContent = active ? city.districts.length : 0;
    if (resetControls) {
      this.$('districtNumberInput').value = active ? String(city.districtState.requestedCount ?? 'auto') : 'auto';
      this.$('districtSeedInput').value = active ? (city.districtState.seed ?? city.id) : city.id;
    }
    const topology = buildDistrictTopology(city),
      block = topology.blocks.get(this.editor.selectedBlockId);
    if (district) {
      const stats = districtSummary(city, district, topology);
      this.$('districtStats').textContent = `${stats.blocks} blocks · ${stats.properties} properties · ${stats.buildings} buildings`;
    } else this.$('districtStats').textContent = active ? 'Select a district or click a block on the map.' : 'Add neighborhoods without changing this city’s geometry.';
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
  operation(action, message) {
    try {
      const city = action();
      this.commit(city);
      // Refill committed values without clearing independent generation inputs.
      this.formDistrictId = null;
      this.formBlockId = null;
      this.refresh();
      this.message(message);
      for (const id of ['districtNameInput', 'districtColorInput', 'districtTargetInput', 'districtNumberInput']) this.$(id).setAttribute?.('aria-invalid', 'false');
      this.changed();
      return true;
    } catch (error) {
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
      const result = this.operation(() => this.editor.generate(this.getCity(), {
        count: this.$('districtNumberInput').value,
        seed: this.$('districtSeedInput').value
      }), 'Neighborhoods rebuilt. Streets, properties and buildings were preserved.');
      if (result && unassigned) this.activateLayers();
      return result;
    });
    this.$('applyDistrictButton').addEventListener('click', () => this.operation(() => this.editor.edit(this.getCity(), this.$('districtNameInput').value, this.$('districtColorInput').value), 'District name and color updated.'));
    this.$('moveDistrictButton').addEventListener('click', () => this.operation(() => this.editor.move(this.getCity(), this.$('districtTargetInput').value), 'Block moved. Both districts remain connected.'));
    this.$('undoDistrictButton').addEventListener('click', () => this.operation(() => this.editor.undo(this.getCity()), 'District edit undone.'));
    this.$('districtSelect').addEventListener('change', () => {
      this.editor.selectedDistrictId = this.$('districtSelect').value || null;
      this.editor.selectedBlockId = null;
      this.refresh();
      this.changed();
    });
    for (const id of ['districtNumberInput', 'districtSeedInput', 'districtNameInput', 'districtColorInput', 'districtTargetInput']) {
      this.$(id).addEventListener('change', () => this.changed());
      this.$(id).addEventListener('input', () => this.changed());
    }
  }
}

// Phase 4A: district list and contextual inspector. The existing district
// panel and editor continue to own all mutations, validation, and history.
export class DistrictWorkspace {
  constructor({ getElement, getCity, panel, getShell, document = globalThis.document }) {
    this.$ = getElement;
    this.getCity = getCity;
    this.panel = panel;
    this.getShell = getShell;
    this.document = document;
    this.rows = new Map();
  }
  select(id) {
    const city = this.getCity();
    if (!city || !city.districts.some(d => d.id === id)) return false;
    this.panel.editor.selectedDistrictId = id;
    this.panel.editor.selectedBlockId = null;
    this.panel.refresh();
    this.panel.changed(); // app synchronizes map, shell and saved state.
    this.reveal();
    return true;
  }
  reveal() {
    const selected = this.panel.editor.selectedDistrictId;
    this.rows.get(selected)?.button.scrollIntoView?.({ block: 'nearest' });
  }
  renderList() {
    const city = this.getCity();
    const districts = city?.districtState.status === 'assigned' ? city.districts : [];
    const selected = this.panel.editor.selectedDistrictId;
    const activeIds = new Set(districts.map(d => d.id));
    for (const id of this.rows.keys()) if (!activeIds.has(id)) this.rows.delete(id);
    const items = districts.map(d => {
      let entry = this.rows.get(d.id);
      if (!entry) {
        const row = this.document.createElement('li');
        const button = this.document.createElement('button');
        const swatch = this.document.createElement('span');
        const name = this.document.createElement('span');
        const count = this.document.createElement('span');
        row.className = 'district-list-item';
        button.type = 'button';
        button.className = 'district-list-row';
        swatch.className = 'district-list-swatch';
        swatch.setAttribute('aria-hidden', 'true');
        name.className = 'district-list-name';
        count.className = 'district-list-count';
        button.replaceChildren(swatch, name, count);
        row.replaceChildren(button);
        button.addEventListener('click', () => this.select(d.id));
        entry = { row, button, swatch, name, count };
        this.rows.set(d.id, entry);
      }
      entry.name.textContent = d.name;
      entry.count.textContent = String(d.blockIds.length);
      // District colors are strictly validated as six-digit hex by the model.
      entry.swatch.setAttribute('style', 'background-color:' + d.color);
      entry.button.setAttribute('aria-pressed', String(d.id === selected));
      entry.button.setAttribute('aria-label', d.name + ', ' + d.blockIds.length + ' blocks');
      return entry.row;
    });
    this.$('districtList').replaceChildren(...items);
    this.$('districtEmpty').hidden = districts.length > 0;
  }
  render() {
    this.renderList();
    const shell = this.getShell();
    const selected = shell?.state.selection;
    const district = selected?.kind === 'district'
      ? this.getCity()?.districts.find(d => d.id === selected.id)
      : null;
    const visible = Boolean(district && district.id === this.panel.editor.selectedDistrictId);
    this.$('districtInspectorControls').hidden = !visible;
    if (visible) this.$('workspaceShowControls').hidden = true;
  }
}

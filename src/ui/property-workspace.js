import { hitProperty, propertySelectionVisible, buildingsOnProperty } from '../core/property-selection.js';
import { workspaceSelectionEqual } from '../core/workspace-state.js';
import { propertyInformation, inspectionValue } from '../core/selection-information.js';

export class PropertyWorkspace {
  constructor({ shell, getCity, getLayers, buildings, exitEditing = () => {}, startBuilding = () => false, startPropertyEdit = () => false, startPropertySplit = () => false, startPropertyMerge = () => false, deleteProperty = () => false, clearBuildings = () => false, focusSelection = () => false, onSelect = () => {}, draw = () => {} }) {
    Object.assign(this, { shell, getCity, getLayers, buildings, exitEditing, startBuilding, startPropertyEdit, startPropertySplit, startPropertyMerge, deleteProperty, clearBuildings, focusSelection, onSelect, draw });
    this.hover = null;
    shell.registerInspector('property', { resolve: id => this.descriptor(id) });
  }
  record(ref) {
    return ref?.kind === 'property' && propertySelectionVisible(this.getLayers())
      ? this.getCity()?.properties.find(property => property.id === ref.id) ?? null : null;
  }
  propertyForBuilding(building) {
    const property = this.record({ kind: 'property', id: building?.propertyId });
    return property?.buildingIds.includes(building?.id) ? property : null;
  }
  descriptor(id) {
    const property = this.record({ kind: 'property', id });
    if (!property) return null;
    const structures = buildingsOnProperty(this.getCity(), property);
    const information = propertyInformation(this.getCity(), property);
    const facts = [...information.sections];
    const buildingSection = information.sections.find(section => section.title === 'Buildings on this property');
    const buildingsVisible = this.getLayers().buildings !== false;
    const buildingActions = structures.map(building => ({
      label: `${building.customName || inspectionValue(building.type)} · ${inspectionValue(building.shape)} · ${building.id}`,
      shortLabel: building.customName || inspectionValue(building.type),
      note: building.customName ? inspectionValue(building.type) : building.id,
      selection: { kind: 'building', id: building.id },
      disabled: !buildingsVisible,
      run: () => this.selectBuilding(property.id, building.id)
    }));
    const add = { label: 'Add building to this property', shortLabel: 'Add building', disabled: !buildingsVisible,
      run: () => this.startBuilding(property.id) };
    const clear = { label: 'Clear all buildings…', danger: true, disabled: !structures.length || !buildingsVisible,
      run: () => this.clearBuildings(property.id) };
    const geometry = { label: 'Edit property geometry', shortLabel: 'Edit boundaries & plots', primary: true,
      run: () => this.startPropertyEdit(property.id) };
    const split = { label: 'Split property', run: () => this.startPropertySplit(property.id) };
    const merge = { label: 'Merge properties', run: () => this.startPropertyMerge(property.id) };
    const remove = { label: 'Delete property…', danger: true, run: () => this.deleteProperty(property.id) };
    const locate = { label: 'Zoom to this property', shortLabel: 'Locate',
      run: () => this.focusSelection({ kind: 'property', id: property.id }) };
    buildingSection.actions = [...buildingActions, add, clear];
    information.sections.push(
      { title: 'Property geometry (3I)', actions: [geometry] },
      { title: 'Property splitting (E2)', actions: [split] },
      { title: 'Property merging (E3)', actions: [merge] },
      { title: 'Property actions (Dev 4a)', actions: [remove] },
      { title: 'Map navigation', actions: [locate] },
    );
    const description = buildingsVisible
      ? 'Choose a building below to inspect its footprint.' : 'Turn on Buildings in Layers to inspect individual footprints.';
    return {
      type: 'Property', title: information.title,
      description: 'The site containing these plots and buildings. ' + description,
      sections: information.sections,
      quickInspector: {
        subtitle: property.id, actions: [geometry, split, merge, add], more: [clear, remove], locate,
        related: { title: 'Buildings', actions: buildingActions, hint: !buildingsVisible ? description
          : structures.length ? '' : 'This property has no buildings.' },
        detailsTitle: 'Property details & plot IDs', facts,
      }
    };
  }
  hit(point, zoom) {
    return hitProperty(point, this.getCity()?.properties, zoom, this.getLayers());
  }
  select(ref) {
    if (!this.record(ref)) return false;
    if (this.exitEditing() === false) return false;
    this.onSelect();
    this.setHover(null);
    this.buildings.setHover(null);
    this.shell.select(ref);
    return true;
  }
  selectBuilding(propertyId, buildingId) {
    const property = this.record({ kind: 'property', id: propertyId });
    const building = this.buildings.record({ kind: 'building', id: buildingId });
    if (!property || !building || this.propertyForBuilding(building)?.id !== property.id) return false;
    return this.buildings.select({ kind: 'building', id: building.id });
  }
  setHover(ref) {
    const next = this.record(ref) ? ref : null;
    if (workspaceSelectionEqual(next, this.hover)) return;
    this.hover = next;
    this.draw();
  }
  refresh({ replaced = false } = {}) {
    if (replaced || !this.record(this.hover)) this.setHover(null);
    const ref = this.shell.state.selection;
    if (!['property', 'building'].includes(ref?.kind)) return;
    if (replaced || (ref.kind === 'property' && !this.record(ref))) {
      this.shell.select(null, { reveal: false });
    } else if (ref.kind === 'building' && (!this.buildings.record(ref)
      || !this.propertyForBuilding(this.getCity()?.buildings.find(b => b.id === ref.id)))) {
      const building = this.getCity()?.buildings.find(b => b.id === ref.id);
      const property = this.propertyForBuilding(building);
      this.shell.select(property ? { kind: 'property', id: property.id } : null, { reveal: false });
    } else this.shell.refresh();
  }
}

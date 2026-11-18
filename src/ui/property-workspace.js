import { hitProperty, propertySelectionVisible, buildingsOnProperty } from '../core/property-selection.js';
import { workspaceSelectionEqual } from '../core/workspace-state.js';
import { propertyInformation, inspectionValue } from '../core/selection-information.js';

export class PropertyWorkspace {
  constructor({ shell, getCity, getLayers, buildings, exitEditing = () => {}, startBuilding = () => false, onSelect = () => {}, draw = () => {} }) {
    Object.assign(this, { shell, getCity, getLayers, buildings, exitEditing, startBuilding, onSelect, draw });
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
    const buildingSection = information.sections.find(section => section.title === 'Buildings on this property');
    buildingSection.actions = structures.map(building => ({
      label: `${building.customName || inspectionValue(building.type)} · ${inspectionValue(building.shape)} · ${building.id}`,
      selection: { kind: 'building', id: building.id },
      disabled: this.getLayers().buildings === false,
      run: () => this.selectBuilding(property.id, building.id)
    }));
    buildingSection.actions.push({label:'Add building to this property',disabled:this.getLayers().buildings===false,run:()=>this.startBuilding(property.id)});
    return {
      type: 'Property', title: information.title,
      description: 'The site containing these plots and buildings. ' + (this.getLayers().buildings === false
        ? 'Turn on Buildings in Layers to inspect individual footprints.' : 'Choose a building below to inspect its footprint.'),
      sections: information.sections
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

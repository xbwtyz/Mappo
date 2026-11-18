import { hitBuilding } from '../core/building-selection.js';
import { workspaceSelectionEqual } from '../core/workspace-state.js';
import { buildingInformation } from '../core/selection-information.js';

// Building inspection owns only transient view state. Accepted city records,
// geometry tools and their histories remain owned by their existing modules.
export class BuildingWorkspace {
  constructor({ shell, getCity, getLayers, getProperties = () => null, onSelect = () => {}, draw = () => {} }) {
    this.shell = shell;
    this.getCity = getCity;
    this.getLayers = getLayers;
    this.getProperties = getProperties;
    this.onSelect = onSelect;
    this.draw = draw;
    this.hover = null;
    shell.registerInspector('building', {
      resolve: id => {
        const building = this.record({ kind: 'building', id });
        const properties = this.getProperties();
        const property = properties?.propertyForBuilding(building);
        if (!building) return null;
        const information = buildingInformation(this.getCity(), building);
        if (property) information.sections.find(section => section.title === 'Parent property').actions = [{
          label: 'Back to property', selection: { kind: 'property', id: property.id },
          run: () => properties.select({ kind: 'property', id: property.id })
        }];
        return {
          type: 'Building',
          title: information.title,
          description: 'Details from the current city. Footprint area excludes open courtyard space.',
          sections: information.sections
        };
      }
    });
  }
  record(ref) {
    return ref?.kind === 'building' && this.getLayers().buildings !== false
      ? this.getCity()?.buildings.find(building => building.id === ref.id) ?? null : null;
  }
  hit(point, zoom) {
    return hitBuilding(point, this.getCity()?.buildings, zoom, this.getLayers());
  }
  select(ref) {
    if (!this.record(ref)) return false;
    this.onSelect();
    this.setHover(null);
    this.shell.select(ref);
    return true;
  }
  setHover(ref) {
    const next = this.record(ref) ? ref : null;
    if (workspaceSelectionEqual(next, this.hover)) return;
    this.hover = next;
    this.draw();
  }
  refresh({ replaced = false } = {}) {
    if (replaced || !this.record(this.hover)) this.setHover(null);
    const selection = this.shell.state.selection;
    if (selection?.kind === 'building' && (replaced || !this.record(selection)))
      this.shell.select(null, { reveal: false });
  }
}

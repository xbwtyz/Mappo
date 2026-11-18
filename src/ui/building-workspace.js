import { hitBuilding } from '../core/building-selection.js';
import { workspaceSelectionEqual } from '../core/workspace-state.js';

// Building inspection owns only transient view state. Accepted city records,
// geometry tools and their histories remain owned by their existing modules.
export class BuildingWorkspace {
  constructor({ shell, getCity, getLayers, onSelect = () => {}, draw = () => {} }) {
    this.shell = shell;
    this.getCity = getCity;
    this.getLayers = getLayers;
    this.onSelect = onSelect;
    this.draw = draw;
    this.hover = null;
    shell.registerInspector('building', {
      resolve: id => {
        const building = this.record({ kind: 'building', id });
        return building ? {
          type: 'Building',
          title: building.id,
          description: 'Selected footprint in the current city.',
          sections: []
        } : null;
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

import { canEditBuildingComponents } from '../editor/building-component-application.js';
import { findCourtyardAccess } from '../core/courtyard-access.js';
import { hitBuilding } from '../core/building-selection.js';
import { workspaceSelectionEqual } from '../core/workspace-state.js';
import { buildingInformation } from '../core/selection-information.js';

// Building inspection owns only transient view state. Accepted city records,
// geometry tools and their histories remain owned by their existing modules.
export class BuildingWorkspace {
  constructor({ shell, getCity, getLayers, getProperties = () => null, getEditSession = () => null, enterEditing = () => false, openComponents = () => false, showCourtyardShortcut = () => false, exitEditing = () => false, startReplacement = () => false, deleteBuilding = () => false, focusSelection = () => false, confirmPreviewDiscard = () => true, onSelect = () => {}, draw = () => {} }) {
    this.shell = shell;
    this.getCity = getCity;
    this.getLayers = getLayers;
    this.getProperties = getProperties;
    this.getEditSession = getEditSession;
    this.enterEditing = enterEditing;
    this.exitEditing = exitEditing;
    this.startReplacement = startReplacement;
    this.deleteBuilding = deleteBuilding;
    this.focusSelection = focusSelection;
    this.confirmPreviewDiscard = confirmPreviewDiscard;
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
        const editing = this.getEditSession()?.isEditing(id) ?? false;
        const facts = [...information.sections];
        const parent = property ? {
          label: 'Back to property', shortLabel: '← ' + (property.customName || property.id),
          selection: { kind: 'property', id: property.id },
          run: () => properties.select({ kind: 'property', id: property.id }),
        } : null;
        if (parent) information.sections.find(section => section.title === 'Parent property').actions = [parent];
        const footprint = {
          label: editing ? 'Exit building editing' : 'Edit building footprint',
          shortLabel: editing ? 'Exit building editing' : 'Edit footprint',
          primary: true, run: () => editing ? this.exitEditing() : this.enterEditing(id),
        };
        const courtyard = building.footprint && !editing && showCourtyardShortcut()
          ? { label: 'Edit courtyard', run: () => this.enterEditing(id, 'courtyard') } : null;
        const replace = { label: 'Replace building (preview)', shortLabel: 'Preview replacement',
          run: () => this.startReplacement(property?.id, id) };
        const remove = { label: 'Delete building…', danger: true, run: () => this.deleteBuilding(property?.id, id) };
        const locate = { label: 'Zoom to this building', shortLabel: 'Locate',
          run: () => this.focusSelection({ kind: 'building', id: building.id }) };
        const components = canEditBuildingComponents(building) &&
          !findCourtyardAccess(this.getCity(), id)
          ? {label: 'Edit building components', shortLabel:'Edit components', primary: !building.footprint,
            run: () => openComponents(building)} : null;
        const actions = [building.footprint ? footprint : null, courtyard, components].filter(Boolean);
        const management = building.footprint ? [replace, remove] : [remove];
        information.sections.push(
          { title: 'Building footprint editing', actions: [...actions, ...management] },
          { title: 'Map navigation', actions: [locate] },
        );
        return {
          type: 'Building', title: information.title,
          description: 'Details from the current city. Footprint area excludes open courtyard space.',
          sections: information.sections,
          quickInspector: {
            subtitle: building.id, actions, more: management, parent, locate,
            detailsTitle: 'Footprint, plots & access', facts,
          }
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
    const edit = this.getEditSession();
    if (edit?.isActive && edit.buildingId !== ref.id && !this.confirmPreviewDiscard()) return false;
    if (edit?.isActive && !edit.focus(this.getCity(), this.getLayers(), ref.id)) edit.stop();
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
    if (replaced) this.getEditSession()?.stop();
    else this.getEditSession()?.reconcile(this.getCity(), this.getLayers(), this.shell.state.selection);
    if (replaced || !this.record(this.hover)) this.setHover(null);
    const selection = this.shell.state.selection;
    if (selection?.kind === 'building' && (replaced || !this.record(selection)))
      this.shell.select(null, { reveal: false });
  }
}

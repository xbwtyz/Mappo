import { boundsOf } from '../core/geometry.js';
import { normalizeBuildingTransform, transformBuildingPoint } from '../core/building-transform.js';
import { validateBuildingStructureS10 } from '../core/building-components-s10.js';
import { buildingPrimaryRouteViewS10, reserveBuildingPartIdS10 } from '../core/building-geometry-adapter-s10.js';
import { occupiedAreaS10 } from '../core/building-occupancy-s10.js';
import { findCourtyardAccess } from '../core/courtyard-access.js';
import { deriveOccupiedPlots, resolveBuildingAccess } from './building-application.js';
import { validateStoredProject } from '../data/project-validation.js';
import { copyJson, createProjectDocument, decodeProjectDocument, encodeProjectDocument } from '../data/project-format.js';

export function canEditBuildingComponents(building) {
  const geometry = building?.geometry;
  return [1, 3].includes(geometry?.version) && building.components?.length > 0 &&
    geometry.regions.some(r => r.parentId === null &&
      building.components.some(c => c.parentId === null && c.id === r.componentId)) &&
    geometry.regions.every(r => r.parentId === null || (r.kind === 'void' &&
      geometry.regions.some(parent => parent.id === r.parentId && parent.parentId === null)));
}

function componentSubtree(components, rootId) {
  const selected = new Set([rootId]);
  for (const component of components)
    if (selected.has(component.parentId)) selected.add(component.id);
  return selected;
}

function componentRectangle({ x, y, width, depth, angle }) {
  if (![x, y, width, depth, angle].every(Number.isFinite) ||
      width < 2 || depth < 2 || width > 250 || depth > 250 || Math.abs(angle) > 360)
    throw Error('Enter a position, angle, and width and depth from 2 to 250 units.');
  const cos = Math.cos(angle * Math.PI / 180), sin = Math.sin(angle * Math.PI / 180);
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    .map(([u, v]) => ({x: x + u * cos - v * sin, y: y + u * sin + v * cos}));
}

export function previewBuildingComponents(building, request) {
  if (!canEditBuildingComponents(building)) throw Error('This building has a courtyard portal or unsupported region topology.');
  const {geometry, components} = validateBuildingStructureS10(building.geometry, building.components);
  const root = components.find(c => c.parentId === null);
  const selected = components.find(c => c.id === request.componentId);
  if (request.componentId && !selected) throw Error('Select an existing component.');
  if (['add', 'organize'].includes(request.action) &&
      (typeof request.name !== 'string' || request.name.trim().length > 80))
    throw Error('Component names can use at most 80 characters.');
  let activeId = selected?.id ?? null;
  let orientation = building.orientation;
  switch (request.action) {
    case 'add': {
      const ring = componentRectangle(request);
      const id = reserveBuildingPartIdS10(new Set(components.map(c => c.id)), 'BC-MAN');
      const regionId = reserveBuildingPartIdS10(new Set(geometry.regions.map(r => r.id)), 'REG-MAN');
      components.push({id, parentId: selected?.id ?? root.id, name: request.name.trim()});
      geometry.regions.push({id: regionId, kind: 'solid', parentId: null, componentId: id, ring});
      activeId = id;
      break;
    }
    case 'organize': {
      if (!selected) throw Error('Select a component to rename or reparent.');
      const parent = components.find(c => c.id === request.parentId);
      if (selected !== root && !parent) throw Error('Select a valid parent component.');
      if (selected !== root) selected.parentId = parent.id;
      selected.name = request.name.trim();
      break;
    }
    case 'remove': {
      if (!selected || selected === root) throw Error('The primary building component must stay.');
      if (components.some(c => c.parentId === selected.id)) throw Error('Reparent this component’s children before removing it.');
      const removedRoofs = new Set(geometry.regions.filter(r => r.componentId === selected.id).map(r => r.id));
      geometry.regions = geometry.regions.filter(r => !removedRoofs.has(r.id) && !removedRoofs.has(r.parentId));
      components.splice(components.indexOf(selected), 1);
      activeId = selected.parentId;
      break;
    }
    case 'transform': {
      const transform = normalizeBuildingTransform({...request.transform});
      if (!selected || selected.id === root.id) orientation += transform.angle;
      const subtree = selected && componentSubtree(components, selected.id);
      const roofs = geometry.regions.filter(r => r.kind === 'solid' && (!subtree || subtree.has(r.componentId)));
      if (!roofs.length) throw Error('The selected component has no footprint to transform.');
      const bounds = boundsOf(roofs.flatMap(r => r.ring));
      const frame = {x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2};
      const roofIds = new Set(roofs.map(r => r.id));
      for (const r of geometry.regions)
        if (roofIds.has(r.id) || roofIds.has(r.parentId))
          r.ring = r.ring.map(point => transformBuildingPoint(point, frame, transform));
      break;
    }
    default: throw Error('Choose a component action.');
  }
  // Geometry v3 uses the existing canonical region/component layout and
  // prevents older editors from opening authored multipart footprints.
  const multipart = components.length > 1 || geometry.regions.filter(r => r.parentId === null).length > 1;
  if (multipart) geometry.version = 3;
  else if (geometry.version === 3) geometry.version = 1;
  return {geometry, components, activeId, orientation};
}

export function prepareBuildingComponents(project, workspace, buildingId, request) {
  const original = project.city.buildings.find(b => b.id === buildingId);
  let preview = null;
  try {
    if (!canEditBuildingComponents(original) || findCourtyardAccess(project.city, buildingId))
      throw Error('Use the courtyard tools for buildings with portal access.');
    preview = previewBuildingComponents(original, request);
    const structure = validateBuildingStructureS10(preview.geometry, preview.components);
    if (JSON.stringify([original.geometry, original.components, original.orientation]) ===
        JSON.stringify([structure.geometry, structure.components, preview.orientation]))
      return {ok: false, status: 'idle', issues: [], preview};
    const cityProject = copyJson(project);
    const {city} = cityProject;
    const building = city.buildings.find(b => b.id === buildingId);
    const property = city.properties.find(p => p.id === building.propertyId);
    Object.assign(building, structure, {area: occupiedAreaS10(structure.geometry), orientation: preview.orientation});
    building.plotIds = deriveOccupiedPlots(city, property, building);
    if (!building.plotIds.length) throw Error('The building must occupy at least one plot within its property.');
    // Keep the entrance on the main component. All other roofs remain
    // obstructions, including detached parts of this same building.
    const access = resolveBuildingAccess(city, original, buildingPrimaryRouteViewS10(building));
    if (!access.route) throw Error(access.issue.message);
    const {entrance, accessPath, frontageRoadId} = access.route;
    Object.assign(building, {entrance, accessPath, frontageRoadId});
    validateStoredProject(cityProject);
    const decoded = decodeProjectDocument(encodeProjectDocument(createProjectDocument(cityProject, workspace)));
    if (JSON.stringify(decoded.project.city) !== JSON.stringify(city))
      throw Error('The component edit changed during verification of the portable save.');
    return {ok: true, status: 'valid', issues: [], preview: {...preview, accessPath}, candidate: decoded.project};
  } catch (error) {
    return {ok: false, status: 'invalid', issues: [{message: error.message}], preview, candidate: null};
  }
}

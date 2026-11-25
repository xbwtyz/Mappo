import { iterateActiveIdentityInventory } from '../core/identity-verification.js';
import { validateCourtyardAccess } from '../core/courtyard-access.js';
import {
  TERRAIN_LIMIT
} from '../core/terrain-geometry.js';
import { validateIdentity } from '../core/identity.js';
import {
  validateWorkspacePresentation
} from '../core/workspace-presentation.js';
import {
  validateTerrainCity
} from '../core/terrain-model.js';
import {
  validateTerrainEditor
} from '../editor/terrain.js';
import {
  LAKE_LIMIT
} from '../core/lake-geometry.js';
import {
  validateWaterCity
} from '../core/water-model.js';
import {
  validateWaterEditor
} from '../editor/water.js';
import {
  validateFortifications
} from '../core/fortification-model.js';
import {
  validateFortificationEditorState
} from '../editor/fortifications.js';
import {
  validateDistricts
} from '../core/district-model.js';
import {
  validateDistrictEditorState
} from '../editor/districts.js';
import {
  PROJECT_SCHEMA_VERSION
} from '../core/version.js';
import {
  polygonSignedArea,
  pointInPolygon,
  boundsOf, properPolygonEdgeIntersection, polygonRingsProperlyCross
} from '../core/geometry.js';
import {
  insideOrOn,
  distanceToSegment,
  segmentCuts,
  appendSegmentCuts,
  clearance
} from '../core/boundary.js';
import {
  clipToConvexPolygon,
  segmentDistance,
  STREET_WIDTHS,
  STREET_EDGE_WIDTH,
  PROPERTY_SETBACK
} from '../core/placement.js';
import {
  validateLayout
} from '../core/validate-layout.js';
import { terminalCorridors, polygonIntrudesTerminalCorridor } from '../core/road-terminal-corridors.js';
import { validateBuildingStructureS10 } from '../core/building-components-s10.js';
import { occupiedAreaS10, occupiedPlotAreaS10, occupiedRegionsOverlapS10 } from '../core/building-occupancy-s10.js';

export const MAX_PROJECT_BYTES = 20 * 1024 * 1024;
export const MAX_VALIDATION_WORK = 6000000;
export const DENSITIES = Object.freeze(['small', 'medium', 'large']);
export const PATTERNS = Object.freeze(['radial', 'organic', 'linear', 'planned']);
const LIMITS = {
  terrainFeatures: TERRAIN_LIMIT,
  terrainPasses: 12,
  terrainFaces: 256,
  waterFeatures: LAKE_LIMIT + 2,
  bridges: 8,
  waterFaces: 256,
  nodes: 20000,
  roads: 40000,
  blocks: 20000,
  plots: 40000,
  properties: 20000,
  buildings: 40000,
  districts: 10000,
  walls: 20000,
  gates: 20000,
  towers: 20000,
  openSpaces: 20000
};

export function requireRecord(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value;
}
export function requireText(value, path, max = 200) {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new Error(`${path} must be text of 1–${max} characters.`);
}
export function requirePoint(p, path) {
  requireRecord(p, path);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) throw new Error(`${path} contains invalid coordinates.`);
}
export function requireList(value, path, max) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${path} must be a list with at most ${max} entries.`);
  return value;
}
export function createValidationBudget() {
  let remaining = MAX_VALIDATION_WORK;
  return n => {
    remaining -= n;
    if (remaining < 0) throw new Error('This project is too complex for this build to validate safely.');
  };
}
export function* iterateJsonTreeValidation(value) {
  const values = [value], depths = [0];
  let count = 0;
  while (values.length) {
    const v = values.pop(), depth = depths.pop();
    if (++count > 1200000 || depth > 64) throw new Error('Project data is too deeply nested or too large.');
    if (count % 256 === 0) yield { stage: 'project-json-data' };
    if (v === null || typeof v === 'string' || typeof v === 'boolean') continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('Project data contains a non-finite number.');
      continue;
    }
    if (typeof v !== 'object' || (!Array.isArray(v) && Object.prototype.toString.call(v) !== '[object Object]')) throw new Error('Project data must contain JSON values only.');
    for (const key of Object.keys(v)) {
      if (key === '__proto__') throw new Error('Project data contains an unsafe object key.');
      values.push(v[key]);
      depths.push(depth + 1);
    }
  }
}
export function validateJsonTree(value) {
  const iterator = iterateJsonTreeValidation(value);
  while (!iterator.next().done) {
    // Existing persistence callers run authoritative validation synchronously.
  }
}
export function validatePolygon(points, path, spend) {
  requireList(points, path, 1024);
  if (points.length < 3) throw new Error(`${path} needs at least three points.`);
  points.forEach((p, i) => requirePoint(p, `${path}[${i}]`));
  if (polygonSignedArea(points) <= 1e-6) throw new Error(`${path} has invalid winding or zero area.`);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-7) throw new Error(`${path} has duplicate consecutive points.`);
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      spend(1);
      if (segmentCuts(a, b, points[j], points[(j + 1) % points.length]).length) throw new Error(`${path} crosses or touches itself.`);
    }
  }
}

function strictInside(p, polygon) {
  return pointInPolygon(p, polygon) && clearance(p, polygon) > 1e-6;
}


function polygonsOverlapInterior(a, b, spend) {
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      spend(1);
      if (properPolygonEdgeIntersection(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  for (const [own, other] of [
      [a, b],
      [b, a]
    ])
    for (let i = 0; i < own.length; i++) {
      const p = own[i],
        q = own[(i + 1) % own.length],
        mid = {
          x: (p.x + q.x) / 2,
          y: (p.y + q.y) / 2
        };
      if (strictInside(p, other) || strictInside(mid, other)) return true;
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      const inside = {
        x: mid.x - (q.y - p.y) / length * 1e-4,
        y: mid.y + (q.x - p.x) / length * 1e-4
      };
      if (strictInside(inside, own) && strictInside(inside, other)) return true;
    }
  return false;
}

function polygonContained(inner, outer, path, spend) {
  if (!inner.every(p => insideOrOn(p, outer))) throw new Error(`${path} extends outside its parent polygon.`);
  if (polygonRingsProperlyCross(inner, outer, spend)) throw new Error(`${path} crosses its parent polygon.`);
}

function indexedRecords(list, path) {
  const result = new Map();
  for (const record of list) {
    requireRecord(record, path);
    requireText(record.id, `${path}.id`, 128);
    if (result.has(record.id)) throw new Error(`Duplicate ID in ${path}: ${record.id}`);
    result.set(record.id, record);
  }
  return result;
}

function reference(map, id, path) {
  if (typeof id !== 'string' || !map.has(id)) throw new Error(`${path} references a missing ID: ${String(id)}`);
  return map.get(id);
}

function references(value, map, path, allowEmpty = false) {
  requireList(value, path, 40000);
  if (!allowEmpty && !value.length) throw new Error(`${path} cannot be empty.`);
  if (new Set(value).size !== value.length) throw new Error(`${path} contains duplicate IDs.`);
  return value.map(id => reference(map, id, path));
}

function* iterateStoredRoadGraph(city, boundary, nodes, spend) {
  const boxes = boundsOf(boundary),
    cell = Math.max(1, Math.max(boxes.maxX - boxes.minX, boxes.maxY - boxes.minY) / 48);
  const bins = new Map(),
    pairs = new Set(),
    edges = new Set();
  for (const road of city.roads) {
    yield { stage: 'stored-road-edge', id: road.id };
    const a = reference(nodes, road.a, 'Road endpoint'),
      b = reference(nodes, road.b, 'Road endpoint');
    if (road.a === road.b || Math.hypot(a.x - b.x, a.y - b.y) < 1e-7) throw new Error('Road has zero length.');
    if (!Object.hasOwn(STREET_WIDTHS, road.kind)) throw new Error('Road has an unsupported classification.');
    const pair = [a.id, b.id].sort().join(':');
    if (edges.has(pair)) throw new Error('Duplicate road edge.');
    edges.add(pair);
    const cuts = [0, 1];
    for (let i = 0; i < boundary.length; i++) {
      spend(1);
      appendSegmentCuts(cuts, a, b, boundary[i], boundary[(i + 1) % boundary.length]);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const t = (cuts[i - 1] + cuts[i]) / 2;
      if (!insideOrOn({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t
        }, boundary)) throw new Error('A road leaves the city boundary.');
    }
    const x0 = Math.floor(Math.min(a.x, b.x) / cell),
      x1 = Math.floor(Math.max(a.x, b.x) / cell),
      y0 = Math.floor(Math.min(a.y, b.y) / cell),
      y1 = Math.floor(Math.max(a.y, b.y) / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        spend(1);
        const key = `${x}:${y}`,
          bucket = bins.get(key) || [];
        for (const other of bucket) {
          const pk = [road.id, other.id].sort().join(':');
          if (pairs.has(pk)) continue;
          pairs.add(pk);
          spend(1);
          if (road.a === other.a || road.a === other.b || road.b === other.a || road.b === other.b) {
            const common = road.a === other.a || road.a === other.b ? road.a : road.b;
            const one = nodes.get(road.a === common ? road.b : road.a),
              two = nodes.get(other.a === common ? other.b : other.a),
              shared = nodes.get(common);
            if (distanceToSegment(one, shared, two) < 1e-6 || distanceToSegment(two, shared, one) < 1e-6) throw new Error('Roads overlap along the same segment.');
            continue;
          }
          if (segmentCuts(a, b, nodes.get(other.a), nodes.get(other.b)).length || segmentCuts(nodes.get(other.a), nodes.get(other.b), a, b).length) throw new Error('Roads cross without a shared junction.');
        }
        bucket.push(road);
        bins.set(key, bucket);
      }
  }
  return edges;
}

export function* iterateStoredProjectValidation(project) {
  const spend = createValidationBudget();
  requireRecord(project, 'Project');
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new Error('Unsupported project schema. Open this file in a newer Mappo build.');
  requireText(project.generatorVersion, 'Generator version', 100);
  requireText(project.seed, 'Seed', 64);
  requireRecord(project.options, 'Generation settings');
  if (!DENSITIES.includes(project.options.size) || !PATTERNS.includes(project.options.morphology)) throw new Error('This build does not support the saved generation settings.');
  const city = requireRecord(project.city, 'City');
  requireText(city.id, 'City ID', 128);
  requireText(city.name, 'City name', 200);
  requireRecord(city.survey, 'Survey');
  const boundary = city.survey.boundary;
  validatePolygon(boundary, 'City boundary', spend);
  validatePolygon(project.options.boundary, 'Generation boundary', spend);
  if (project.options.boundary.length !== boundary.length || project.options.boundary.some((p, i) => Math.hypot(p.x - boundary[i].x, p.y - boundary[i].y) > 1e-6)) throw new Error('Generation and city boundaries disagree.');
  requirePoint(project.options.center, 'Town center');
  if (!insideOrOn(project.options.center, boundary)) throw new Error('Town center is outside the city boundary.');
  const maps = {};
  for (const [name, max] of Object.entries(LIMITS)) maps[name] = indexedRecords(requireList(name.startsWith('terrain') ? (city[name] ?? []) : city[name], name, max), name);
  yield* iterateActiveIdentityInventory(project.identityAllocation, city, spend);
  for (const record of [...city.properties, ...city.buildings]) validateIdentity(record);
  if (!city.nodes.length || !city.roads.length || !city.blocks.length) throw new Error('The city is missing its street plan.');
  for (const n of city.nodes) {
    requirePoint(n, 'Road junction');
    if (!insideOrOn(n, boundary)) throw new Error('Road junction is outside the city boundary.');
  }
  yield { stage: 'project-road-validation' };
  const edgeKeys = yield* iterateStoredRoadGraph(city, boundary, maps.nodes, spend);
  const roadByEdge = new Map(city.roads.map(r => [
    [r.a, r.b].sort().join(':'), r
  ]));
  const orientedEdges = new Set();
  const facePolygons = new Map();
  const plaza = requireRecord(city.plaza, 'Main square');
  if (plaza.center !== undefined) requirePoint(plaza.center, 'Main square center');
  requireText(plaza.id, 'Main square ID', 128);
  if (maps.blocks.has(plaza.id)) throw new Error('The main square and a block share an ID.');
  requireText(plaza.name, 'Main square name', 200);
  for (const face of [...city.blocks, plaza, ...city.waterFaces, ...(city.terrainFaces ?? [])]) {
    yield { stage: 'project-face-validation', id: face.id };
    const points = references(face.vertices, maps.nodes, 'Face vertices').map(p => ({
      x: p.x,
      y: p.y
    }));
    validatePolygon(points, `Face ${face.id}`, spend);
    polygonContained(points, boundary, 'City block or square', spend);
    for (let i = 0; i < face.vertices.length; i++) {
      const a = face.vertices[i],
        b = face.vertices[(i + 1) % face.vertices.length],
        directed = `${a}:${b}`;
      if (!edgeKeys.has([a, b].sort().join(':'))) throw new Error('A block edge has no matching road.');
      if (orientedEdges.has(directed)) throw new Error('City faces overlap or reuse a directed street edge.');
      orientedEdges.add(directed);
    }
    const area = polygonSignedArea(points);
    if (!Number.isFinite(face.area) || Math.abs(face.area - area) > .02) throw new Error('A block or square has an incorrect area.');
    facePolygons.set(face.id, points);
  }
  yield { stage: 'project-layout' };
  validateLayout(city, boundary);
  const terminal = terminalCorridors(city);
  const terminalIds = new Set(terminal.map(row => row.id));
  for (const corridor of terminal) {
    const road = corridor.road;
    if (road.boundary || road.plaza || road.bank || road.waterBoundary ||
        road.foothill || road.terrainBoundary || road.bridgeId || road.passId)
      throw new Error('A terminal corridor may not include protected road infrastructure.');
    if (!corridor.a || !corridor.b)
      throw new Error('A terminal corridor has an invalid road endpoint.');
  }
  if (plaza.center && (!pointInPolygon(plaza.center, facePolygons.get(plaza.id)) || Math.hypot(plaza.center.x - project.options.center.x, plaza.center.y - project.options.center.y) > 1e-6)) throw new Error('The square’s saved center is inconsistent.');
  if (!pointInPolygon(project.options.center, facePolygons.get(plaza.id))) throw new Error('The saved town center is not inside the main square.');
  const grouped = new Map(),
    usedPlots = new Set(),
    usedBuildings = new Set(),
    usedCompoundIds = new Set(),
    usedCompoundMembers = new Set();
  for (const property of city.properties) {
    yield { stage: 'project-parcel-validation', id: property.id };
    reference(maps.blocks, property.blockId, 'Property block');
    reference(maps.roads, property.frontageRoadId, 'Property frontage');
    if (terminalIds.has(property.frontageRoadId))
      throw new Error('A terminal corridor cannot grant new property frontage.');
    const terminalCollision = polygonIntrudesTerminalCorridor(property.boundary, terminal);
    if (terminalCollision)
      throw new Error(`Property ${property.id} encroaches on dead-end road ${terminalCollision}.`);
    spend(terminal.length * property.boundary.length);
    validatePolygon(property.boundary, 'Property boundary', spend);
    const block = facePolygons.get(property.blockId);
    polygonContained(property.boundary, block, 'Property', spend);
    for (let i = 0; i < block.length; i++) {
      const ids = maps.blocks.get(property.blockId).vertices,
        road = roadByEdge.get([ids[i], ids[(i + 1) % ids.length]].sort().join(':'));
      const margin = (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK;
      for (let j = 0; j < property.boundary.length; j++) {
        spend(1);
        if (segmentDistance(property.boundary[j], property.boundary[(j + 1) % property.boundary.length], block[i], block[(i + 1) % block.length]) < margin - 1e-5) throw new Error('A property encroaches on a street.');
      }
    }
    const neighbors = grouped.get(property.blockId) || [];
    const bounds = boundsOf(property.boundary);
    for (const other of neighbors) {
      const box = other.bounds;
      const separated = bounds.maxX < box.minX - 1e-6 || box.maxX < bounds.minX - 1e-6 ||
        bounds.maxY < box.minY - 1e-6 || box.maxY < bounds.minY - 1e-6;
      if (separated) {
        // Charge the same edge-pair checks even when the boxes prove separation.
        spend(property.boundary.length * other.boundary.length);
      } else if (polygonsOverlapInterior(property.boundary, other.boundary, spend)) {
        throw new Error('Property boundaries overlap.');
      }
    }
    neighbors.push({ boundary: property.boundary, bounds });
    grouped.set(property.blockId, neighbors);
    // C01: optional schema-9 grouping metadata; building geometry remains the
    // authoritative independent per-building record. Invalid stale group
    // references are never auto-dissolved during another editor's Apply.
    if (property.buildingCompounds !== undefined) {
      const compounds = requireList(property.buildingCompounds, 'Building compounds', 128);
      for (const compound of compounds) {
        requireRecord(compound, 'Building compound');
        requireText(compound.id, 'Compound ID', 128);
        if (!/^CMP-MAN-[A-Za-z0-9_-]+$/.test(compound.id) || usedCompoundIds.has(compound.id))
          throw new Error('Building compound ID must be unique and stable.');
        usedCompoundIds.add(compound.id);
        requireText(compound.name, 'Compound name', 80);
        const members = requireList(compound.memberBuildingIds, 'Compound members', 32);
        if (members.length < 2) throw new Error('A building compound needs at least two members.');
        const unique = new Set();
        for (const memberId of members) {
          requireText(memberId, 'Compound member ID', 128);
          if (unique.has(memberId) || usedCompoundMembers.has(memberId))
            throw new Error('A building may belong to only one compound.');
          unique.add(memberId);
          usedCompoundMembers.add(memberId);
          const member = reference(maps.buildings, memberId, 'Compound building');
          if (member.propertyId !== property.id || member.blockId !== property.blockId ||
              !property.buildingIds.includes(memberId))
            throw new Error('A compound member must belong to its owning property.');
        }
      }
    }
    const ownPlots = references(property.plotIds, maps.plots, 'Property plots');
    let plotArea = 0;
    for (const plot of ownPlots) {
      if (usedPlots.has(plot.id) || plot.propertyId !== property.id || plot.blockId !== property.blockId) throw new Error('Plot ownership is inconsistent.');
      usedPlots.add(plot.id);
      validatePolygon(plot.boundary, 'Plot boundary', spend);
      for (let i = 0; i < plot.boundary.length; i++) {
        const a = plot.boundary[i],
          b = plot.boundary[(i + 1) % plot.boundary.length],
          c = plot.boundary[(i + 2) % plot.boundary.length];
        if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-7) throw new Error('Base plots must be convex in this project schema.');
      }
      polygonContained(plot.boundary, property.boundary, 'Plot', spend);
      plotArea += polygonSignedArea(plot.boundary);
    }
    for (let i = 0; i < ownPlots.length; i++)
      for (let j = i + 1; j < ownPlots.length; j++)
        if (polygonsOverlapInterior(ownPlots[i].boundary, ownPlots[j].boundary, spend)) throw new Error('Plots overlap within their property.');
    const actual = polygonSignedArea(property.boundary);
    if (!Number.isFinite(property.area) || Math.abs(actual - property.area) > .02 || Math.abs(actual - plotArea) > .02) throw new Error('Property or plot areas are inconsistent.');
    for (const building of references(property.buildingIds, maps.buildings, 'Property buildings', true)) {
      if (usedBuildings.has(building.id) || building.propertyId !== property.id || building.blockId !== property.blockId) throw new Error('Building ownership is inconsistent.');
      usedBuildings.add(building.id);
      if (Object.prototype.propertyIsEnumerable.call(building,'footprint') ||
          Object.prototype.propertyIsEnumerable.call(building,'holes'))
        throw new Error('Schema 10 building contains competing writable footprint/holes geometry.');
      // Canonical topology is the only authoritative stored building shape.
      const {geometry}=validateBuildingStructureS10(building.geometry,building.components);
      const solids=geometry.regions.filter(r=>r.kind==='solid');
      for (const root of geometry.regions.filter(r=>r.parentId===null)) {
        validatePolygon(root.ring,'Building exterior region',spend);
        polygonContained(root.ring,property.boundary,'Building',spend);
      }
      for (const region of geometry.regions) spend(region.ring.length);
      requireText(building.type, 'Building type');
      requireText(building.shape, 'Building shape');
      if (!Number.isFinite(building.orientation) || !Number.isInteger(building.roofTone) || building.roofTone < 0 || building.roofTone > 255) throw new Error('Building rendering data is invalid.');
      reference(maps.roads, building.frontageRoadId, 'Building frontage');
      if (terminalIds.has(building.frontageRoadId))
        throw new Error('A terminal corridor cannot grant new building frontage.');
      const buildingPlots=references(building.plotIds,maps.plots,'Building plots');
      if (buildingPlots.some(p=>p.propertyId!==property.id))
        throw new Error('A building refers to another property’s plot.');
      const occupiedPlots=ownPlots.filter(plot=>
        occupiedPlotAreaS10(geometry,plot.boundary)>1e-5).map(p=>p.id);
      if (occupiedPlots.length!==building.plotIds.length ||
          occupiedPlots.some(id=>!building.plotIds.includes(id)))
        throw new Error('Building plot references do not match actual canonical occupancy.');
      const area=occupiedAreaS10(geometry);
      if (!Number.isFinite(building.area) || Math.abs(area-building.area)>.02)
        throw new Error('Building area is invalid.');

    }
    const own = property.buildingIds.map(id => maps.buildings.get(id));
    for (let i = 0; i < own.length; i++)
      for (let j = i + 1; j < own.length; j++)
        if (occupiedRegionsOverlapS10(own[i].geometry, own[j].geometry)) throw new Error('Occupied building regions overlap.');
  }
  if (usedPlots.size !== city.plots.length || usedBuildings.size !== city.buildings.length) throw new Error('The project contains orphan plots or buildings.');
  if (city.buildings.some(b => b.geometry.version === 2)) validateCourtyardAccess(city, spend);
  for (const record of [...city.properties, ...city.buildings])
    if (record.districtId != null) reference(maps.districts, record.districtId, 'District membership');
  for (const open of city.openSpaces) {
    reference(maps.blocks, open.blockId, 'Open-space block');
    if (!Number.isFinite(open.area) || open.area < 0) throw new Error('Open-space area is invalid.');
  }
  for (const [stage, validate] of [
    ['project-districts', validateDistricts], ['project-water', validateWaterCity],
    ['project-terrain', validateTerrainCity], ['project-fortifications', validateFortifications],
  ]) {
    yield { stage };
    validate(city);
  }
  return project;
}

export function validateStoredProject(project) {
  const iterator = iterateStoredProjectValidation(project);
  for (let step = iterator.next(); ; step = iterator.next()) {
    if (step.done) return step.value;
  }
}

export function validateWorkspace(workspace, project) {
  requireRecord(workspace, 'Workspace');
  if (workspace.schemaVersion !== 1) throw new Error('Unsupported workspace version. Use a newer Mappo build.');
  if (workspace.terrainEditor !== undefined) validateTerrainEditor(workspace.terrainEditor);
  if (workspace.waterEditor !== undefined) validateWaterEditor(workspace.waterEditor);
  const draft = requireRecord(workspace.editor, 'Outline draft');
  requireList(draft.boundary, 'Draft boundary', 1200).forEach(p => requirePoint(p, 'Draft point'));
  if (draft.center !== null) requirePoint(draft.center, 'Draft center');
  if (typeof draft.closed !== 'boolean' || typeof draft.dirty !== 'boolean') throw new Error('Invalid draft state.');
  requireList(draft.history, 'Outline undo history', 40).forEach(entry => {
    requireRecord(entry, 'Undo entry');
    requireList(entry.boundary, 'Undo boundary', 1200).forEach(p => requirePoint(p, 'Undo point'));
    if (entry.center !== null) requirePoint(entry.center, 'Undo center');
    if (typeof entry.closed !== 'boolean' || typeof entry.dirty !== 'boolean') throw new Error('Invalid undo state.');
  });
  const controls = requireRecord(workspace.controls, 'Workspace controls');
  if (typeof controls.seed !== 'string' || controls.seed.length > 64) throw new Error('Invalid draft seed.');
  if (!DENSITIES.includes(controls.size) || !PATTERNS.includes(controls.morphology)) throw new Error('Unsupported draft generation settings.');
  if (!['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'].includes(controls.preset)) throw new Error('Unsupported starting outline.');
  const view = requireRecord(workspace.view, 'Map view');
  if (view.landscapeSelection !== undefined && view.landscapeSelection !== null) {
    const selection = requireRecord(view.landscapeSelection, 'Landscape selection');
    if (!['water', 'terrain'].includes(selection.kind) || typeof selection.id !== 'string' || !selection.id || selection.id.length > 128) throw new Error('Invalid landscape selection.');
  }
  requireRecord(view.camera, 'Camera');
  requirePoint(view.camera, 'Camera');
  if (!Number.isFinite(view.camera.zoom) || view.camera.zoom < .18 || view.camera.zoom > 12) throw new Error('Invalid map zoom.');
  requireRecord(view.layers, 'Map layers');
  for (const name of ['buildings', 'properties', 'plots'])
    if (typeof view.layers[name] !== 'boolean') throw new Error('Invalid layer visibility.');
  for (const name of ['districtColors', 'districtBorders', 'districtLabels'])
    if (view.layers[name] !== undefined && typeof view.layers[name] !== 'boolean') throw new Error('Invalid district layer visibility.');
  if (project) validateDistrictEditorState(workspace.districtEditor, project.city);
  if (view.layers.fortifications !== undefined && typeof view.layers.fortifications !== 'boolean') throw new Error('Invalid fortification layer visibility.');
  if (project) validateFortificationEditorState(workspace.fortificationEditor, project.city);
  if (workspace.panels !== undefined && (!workspace.panels || typeof workspace.panels.districts !== 'boolean' || typeof workspace.panels.fortifications !== 'boolean' || (workspace.panels.water !== undefined && typeof workspace.panels.water !== 'boolean') || (workspace.panels.terrain !== undefined && typeof workspace.panels.terrain !== 'boolean'))) throw new Error('Invalid saved panel state.');
  validateWorkspacePresentation(workspace.ui);
  return workspace;
}

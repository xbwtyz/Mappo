import { solidWallSegments, measureWall, WALL_EDGE_WIDTH } from './fortification-geometry.js';
import { gatePosts } from './gate-geometry.js';
import { buildDistrictTopology, districtIsConnected } from './district-topology.js';
import { boundsOf } from './geometry.js';
import { shapeContained } from './building-validation.js';
import { distanceToSegment } from './boundary.js';
import { segmentDistance, STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK } from './placement.js';
import { riCompare, riIndex } from './road-impact-model.js';

const riEdgeKey = (a, b) => JSON.stringify([a, b].sort(riCompare));
const riSorted = (list) => [...(list ?? [])].sort((a, b) => riCompare(a.id, b.id));
const riPoints = (points) =>
  Array.isArray(points) &&
  points.length >= 3 &&
  points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
function riContained(inner, outer, spend) {
  if (!riPoints(inner) || !riPoints(outer)) return false;
  spend(inner.length * (outer.length * 3 + 2));
  return shapeContained(inner, outer);
}
function riDistance(polygon, a, b, spend) {
  spend(polygon.length * 3);
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    nearest = Math.min(nearest, segmentDistance(polygon[i], polygon[(i + 1) % polygon.length], a, b));
  }
  return nearest;
}
function riSegmentNearBounds(box, a, b, margin) {
  return (
    Math.max(a.x, b.x) + margin >= box.minX &&
    Math.min(a.x, b.x) - margin <= box.maxX &&
    Math.max(a.y, b.y) + margin >= box.minY &&
    Math.min(a.y, b.y) - margin <= box.maxY
  );
}

export function* iterateRoadDependencies(city, snapshot, context, emit, spend, measurementBase = city) {
  // Land records come from the geometry being checked. Historical distances
  // use the corresponding original record and original road endpoints.
  const oldNodes = riIndex(measurementBase.nodes),
    nodes = riIndex(snapshot.nodes),
    roads = riIndex(snapshot.roads),
    oldRoads = riIndex(measurementBase.roads),
    blocks = riIndex(snapshot.blocks);
  const properties = riIndex(city.properties),
    plots = riIndex(city.plots),
    buildings = riIndex(city.buildings),
    districts = riIndex(city.districts);
  const oldLand = measurementBase === city ? null : {
    property: riIndex(measurementBase.properties), plot: riIndex(measurementBase.plots),
    building: riIndex(measurementBase.buildings),
  };
  const originalPolygon = (kind, id, polygon) => {
    if (!oldLand) return polygon;
    const record = oldLand[kind].get(id);
    return record?.boundary ?? record?.footprint ?? record?.geometry?.regions
      ?.find(region => region.kind === 'solid' && region.parentId === null)?.ring;
  };

  const edges = new Map(snapshot.roads.map((r) => [riEdgeKey(r.a, r.b), r]));
  const changedNodes = new Set(context.junctionIds);
  const changed = new Set(context.roadIds),
    changedBlocks = new Set(context.changedBlockIds),
    blockRoads = new Map(),
    occupiedAreas = new Map();
  const contained = (inner, outer) => riContained(inner, outer, spend);
  const roadMetrics = (id) => {
    const old = oldRoads.get(id),
      now = roads.get(id),
      a = oldNodes.get(old?.a),
      b = oldNodes.get(old?.b),
      p = nodes.get(now?.a),
      q = nodes.get(now?.b);
    return {
      oldLength: a && b ? Math.hypot(b.x - a.x, b.y - a.y) : null,
      newLength: p && q ? Math.hypot(q.x - p.x, q.y - p.y) : null,
      oldClass: old?.kind ?? null,
      newClass: now?.kind ?? null,
    };
  };
  for (const block of snapshot.blocks)
    blockRoads.set(
      block.id,
      new Set(
        block.vertices.map(
          (a, i) => edges.get(riEdgeKey(a, block.vertices[(i + 1) % block.vertices.length]))?.id,
        ),
      ),
    );
  function frontage(record, kind, polygon) {
    const road = roads.get(record.frontageRoadId),
      related = [record.frontageRoadId];
    if (!road) {
      emit(
        kind,
        record.id,
        'frontage-missing',
        'The accepted frontage road is missing from the candidate network.',
        related,
      );
      return;
    }
    if (!blockRoads.get(record.blockId)?.has(road.id))
      emit(
        kind,
        record.id,
        'frontage-block',
        'The frontage road no longer bounds the accepted parent block.',
        related.concat(record.blockId),
      );
    if (road.waterBoundary || road.terrainBoundary)
      emit(
        kind,
        record.id,
        'frontage-unusable',
        'A virtual water/terrain boundary cannot provide street access.',
        related,
      );
    if (changed.has(road.id))
      emit(
        kind,
        record.id,
        'frontage-geometry',
        'The accepted frontage references a changed road; its alignment and access must be reviewed.',
        related,
        roadMetrics(road.id),
      );
    if (!riPoints(polygon)) return;
    const a = nodes.get(road.a),
      b = nodes.get(road.b),
      old = oldRoads.get(road.id),
      oa = oldNodes.get(old?.a),
      ob = oldNodes.get(old?.b);
    if (!a || !b) return;
    if (changed.has(road.id)) {
      const priorPolygon = originalPolygon(kind, record.id, polygon);
      const newDistance = riDistance(polygon, a, b, spend);
      const oldDistance = oa && ob && riPoints(priorPolygon) ? riDistance(priorPolygon, oa, ob, spend) : null;
      // Supplemental measured frontage data, retained separately from ownership.
      emit(
        kind,
        record.id,
        'frontage-distance',
        'Frontage distance was measured against the accepted and proposed street.',
        related,
        { oldDistance, newDistance },
        'info',
      );
    }
  }
  function blockContainment(record, kind, polygon) {
    const block = blocks.get(record.blockId);
    if (!block) {
      emit(
        kind,
        record.id,
        'block-topology',
        'The accepted block has no proven single candidate counterpart.',
        [record.blockId],
      );
      return;
    }
    if (changedBlocks.has(block.id) || !context.acceptedValid) {
      const boundary = block.vertices.map((id) => nodes.get(id));
      if (!contained(polygon, boundary))
        emit(
          kind,
          record.id,
          'block-containment',
          'Accepted geometry would extend outside its candidate block.',
          [block.id],
        );
    }
    if (record.districtId != null && !districts.has(record.districtId))
      emit(kind, record.id, 'district-reference', 'The accepted district reference does not resolve.', [
        record.districtId,
      ]);
    if (record.districtId != null && record.districtId !== block.districtId)
      emit(
        kind,
        record.id,
        'district-ownership',
        'The accepted district differs from the parent block membership.',
        [record.districtId, block.id],
      );
  }
  for (const property of riSorted(city.properties)) {
    yield { stage: 'parcel-dependencies', id: property.id };
    spend();
    const polygon = property.boundary;
    blockContainment(property, 'property', polygon);
    frontage(property, 'property', polygon);
    occupiedAreas.set(
      property.blockId,
      (occupiedAreas.get(property.blockId) ?? 0) + (Number.isFinite(property.area) ? property.area : 0),
    );
    for (const id of property.plotIds ?? []) {
      spend();
      const plot = plots.get(id);
      if (!plot || plot.propertyId !== property.id || plot.blockId !== property.blockId)
        emit(
          'property',
          property.id,
          'plot-ownership',
          'An accepted plot is missing or has inconsistent ownership.',
          [id],
        );
    }
    for (const id of property.buildingIds ?? []) {
      spend();
      const building = buildings.get(id);
      if (!building || building.propertyId !== property.id || building.blockId !== property.blockId)
        emit(
          'property',
          property.id,
          'building-ownership',
          'An accepted building is missing or has inconsistent ownership.',
          [id],
        );
    }
    const block = blocks.get(property.blockId);
    const boundaryRoadIds = blockRoads.get(property.blockId) ?? new Set();
    const relevant = new Set([...boundaryRoadIds, ...context.roadIds]);
    if (riPoints(polygon)) {
      const box = boundsOf(polygon);
      for (const id of [...relevant].sort(riCompare)) {
        spend();
        const road = roads.get(id),
          a = nodes.get(road?.a),
          b = nodes.get(road?.b);
        if (!road || !a || !b) continue;
        if (context.acceptedValid && !changed.has(id) && !changedBlocks.has(property.blockId)) continue;
        const margin = (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK;
        if (!riSegmentNearBounds(box, a, b, margin)) continue;
        const distance = riDistance(polygon, a, b, spend);
        if (distance < margin - 1e-5) {
          const old = oldRoads.get(id),
            oa = oldNodes.get(old?.a),
            ob = oldNodes.get(old?.b);
          const priorPolygon = originalPolygon('property', property.id, polygon);
          emit(
            'property',
            property.id,
            'road-setback',
            'The proposed street conflicts with the accepted property setback.',
            [id, block?.id ?? property.blockId],
            {
              oldDistance: oa && ob && riPoints(priorPolygon) ? riDistance(priorPolygon, oa, ob, spend) : null,
              newDistance: distance,
              requiredDistance: margin,
              oldRequiredDistance: old
                ? (STREET_WIDTHS[old.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK
                : null,
            },
          );
        }
      }
    }
    const origin = property.frame?.origin;
    if (origin?.id && changedNodes.has(origin.id)) {
      const node = nodes.get(origin.id);
      if (!node || Math.hypot(node.x - origin.x, node.y - origin.y) > 1e-6)
        emit(
          'property',
          property.id,
          'frame-reference',
          'The saved frontage frame is anchored to a moved junction.',
          [origin.id, property.frontageRoadId],
        );
    }
  }
  for (const plot of riSorted(city.plots)) {
    yield { stage: 'plot-dependencies', id: plot.id };
    spend();
    const property = properties.get(plot.propertyId);
    if (!property || !property.plotIds?.includes(plot.id) || plot.blockId !== property.blockId)
      emit(
        'plot',
        plot.id,
        'property-reference',
        'The accepted parent property/plot ownership does not resolve.',
        [plot.propertyId, plot.blockId],
      );
    else if (!context.acceptedValid || changedBlocks.has(plot.blockId))
      if (!contained(plot.boundary, property.boundary))
        emit('plot', plot.id, 'property-containment', 'The plot is not contained by its accepted property.', [
          property.id,
        ]);
    blockContainment(plot, 'plot', plot.boundary);
    frontage(plot, 'plot', plot.boundary);
  }
  for (const building of riSorted(city.buildings)) {
    yield { stage: 'building-dependencies', id: building.id };
    // Inspection accepts frozen or serialized projects. A read-only facade is
    // optional, never required to understand canonical saved geometry.
    const occupiedRoots=building.geometry?.regions?.filter(region =>
      region.kind==='solid' && region.parentId===null).map(region=>region.ring)
      ?? [building.footprint];
    const footprint=occupiedRoots[0];
    spend();
    const property = properties.get(building.propertyId);
    if (!property || !property.buildingIds?.includes(building.id) || building.blockId !== property.blockId)
      emit(
        'building',
        building.id,
        'property-reference',
        'The accepted parent property/building ownership does not resolve.',
        [building.propertyId, building.blockId],
      );
    else if (!context.acceptedValid || changedBlocks.has(building.blockId))
      if (occupiedRoots.some(ring=>!contained(ring, property.boundary)))
        emit(
          'building',
          building.id,
          'property-containment',
          'The building is not contained by its accepted property.',
          [property.id],
        );
    for (const id of building.plotIds ?? []) {
      spend();
      const plot = plots.get(id);
      if (!plot || plot.propertyId !== building.propertyId || plot.blockId !== building.blockId)
        emit(
          'building',
          building.id,
          'plot-reference',
          'An occupied plot is missing or belongs to another property/block.',
          [id, building.propertyId],
        );
    }
    for (const ring of occupiedRoots) {
      if (!context.acceptedValid || changedBlocks.has(building.blockId))
        yield { stage: 'building-block-containment', id: building.id };
      blockContainment(building, 'building', ring);
    }
    if (changed.has(building.frontageRoadId)) yield { stage: 'building-frontage', id: building.id };
    frontage(building, 'building', footprint);
    const path = building.accessPath,
      road = roads.get(building.frontageRoadId),
      a = nodes.get(road?.a),
      b = nodes.get(road?.b);
    if (Array.isArray(path) && path.length >= 2 && a && b) {
      spend();
      const end = path.at(-1),
        start = path[0];
      if (!end || !Number.isFinite(end.x) || !Number.isFinite(end.y) || distanceToSegment(end, a, b) > 1e-5)
        emit(
          'building',
          building.id,
          'access-connection',
          'The unchanged access path no longer ends on its frontage road.',
          [building.frontageRoadId],
        );
      if (
        building.entrance &&
        (!start || Math.hypot(start.x - building.entrance.x, start.y - building.entrance.y) > 1e-5)
      )
        emit(
          'building',
          building.id,
          'access-entrance',
          'The accepted access path is detached from its entrance.',
          [building.propertyId],
        );
    } else
      emit(
        'building',
        building.id,
        'access-unproven',
        'The accepted entrance/frontage access cannot be verified without a supported path.',
        [building.frontageRoadId],
      );
    if (riPoints(footprint)) {
      const box = boundsOf(footprint);
      let scanned = 0;
      for (const id of context.roadIds) {
        if (++scanned % 32 === 0) yield { stage: 'building-road-bounds', id: building.id };
        spend();
        const r = roads.get(id),
          p = nodes.get(r?.a),
          q = nodes.get(r?.b);
        if (!p || !q) continue;
        const required = (STREET_WIDTHS[r.kind] + STREET_EDGE_WIDTH) / 2;
        if (!riSegmentNearBounds(box, p, q, required)) continue;
        yield { stage: 'building-road-clearance', id: building.id };
        const distance = riDistance(footprint, p, q, spend);
        if (distance < required - 1e-5)
          emit(
            'building',
            building.id,
            'road-clearance',
            'The proposed road corridor conflicts with the accepted building.',
            [id],
            { newDistance: distance, requiredDistance: required },
          );
      }
    }
  }
  const openMetrics = [];
  for (const open of riSorted(city.openSpaces)) {
    spend();
    const block = blocks.get(open.blockId);
    if (!block) {
      emit(
        'open-space',
        open.id,
        'block-reference',
        'The open-space summary has no proven parent block counterpart.',
        [open.blockId],
      );
      continue;
    }
    const area = Math.max(0, block.area - (occupiedAreas.get(block.id) ?? 0));
    if (changedBlocks.has(block.id) && Math.abs(area - open.area) > 1e-8) {
      openMetrics.push({ id: open.id, blockId: block.id, oldArea: open.area, newArea: area });
      emit(
        'open-space',
        open.id,
        'derived-area',
        'Only the derived block open-area summary would change; no land geometry is moved.',
        [block.id],
        { oldArea: open.area, newArea: area },
        'info',
      );
    }
  }
  return { openSpaceAreas: openMetrics };
}

export function inspectRoadDependencies(...args) {
  const iterator = iterateRoadDependencies(...args);
  for (let step = iterator.next(); ; step = iterator.next()) {
    if (step.done) return step.value;
  }
}

export function inspectRoadContextReferences(city, snapshot, context, emit, spend) {
  const blocks = riIndex(snapshot.blocks),
    districts = riIndex(city.districts),
    nodes = riIndex(snapshot.nodes),
    walls = riIndex(city.walls);
  const topology = buildDistrictTopology(snapshot);
  for (const district of city.districts)
    if (district.blockIds?.every((id) => blocks.has(id)) && !districtIsConnected(district.blockIds, topology))
      emit(
        'district',
        district.id,
        'district-connectivity',
        'The candidate would disconnect this accepted district.',
        district.blockIds,
      );
  for (const district of riSorted(city.districts))
    for (const id of district.blockIds ?? []) {
      spend();
      const block = blocks.get(id);
      if (!block || block.districtId !== district.id)
        emit(
          'district',
          district.id,
          'block-membership',
          'Accepted district membership has no matching candidate block/owner.',
          [id],
        );
    }
  for (const block of snapshot.blocks)
    if (block.districtId != null) {
      spend();
      const district = districts.get(block.districtId);
      if (!district || !district.blockIds?.includes(block.id))
        emit(
          'block',
          block.id,
          'district-reference',
          'The block has no reciprocal accepted district membership.',
          [block.districtId],
        );
    }
  for (const gate of riSorted(city.gates)) {
    spend();
    if (!walls.has(gate.wallId))
      emit('defense', gate.id, 'wall-reference', 'The accepted gate wall does not resolve.', [gate.wallId]);
    const node = nodes.get(gate.connection?.cityNodeId),
      point = gate.connection?.points?.[0];
    if (!node || !point || Math.hypot(node.x - point.x, node.y - point.y) > 1e-6)
      emit(
        'defense',
        gate.id,
        'gate-connection',
        'The accepted gate approach is no longer attached to its city junction.',
        [gate.wallId, gate.connection?.cityNodeId],
      );
  }
  for (const tower of riSorted(city.towers)) {
    spend();
    if (!walls.has(tower.wallId))
      emit('defense', tower.id, 'wall-reference', 'The accepted tower wall does not resolve.', [
        tower.wallId,
      ]);
  }
  for (const bridge of riSorted(city.bridges)) {
    spend();
    if (!(city.waterFeatures ?? []).some((f) => f.id === bridge.waterId))
      emit('water', bridge.id, 'water-reference', 'The bridge owning water feature does not resolve.', [
        bridge.waterId,
      ]);
  }
  for (const pass of riSorted(city.terrainPasses)) {
    spend();
    if (!(city.terrainFeatures ?? []).some((f) => f.id === pass.terrainId))
      emit('terrain', pass.id, 'terrain-reference', 'The pass owning mountain range does not resolve.', [
        pass.terrainId,
      ]);
  }
  const roadMap = riIndex(snapshot.roads),
    changedRoads = context.roadIds.map((id) => roadMap.get(id)).filter(Boolean);
  const measures = new Map();
  for (const wall of city.walls ?? []) {
    const solids = solidWallSegments(wall, city.gates ?? []);
    measures.set(wall.id, measureWall(wall.path));
    for (const road of changedRoads)
      for (const section of solids) {
        spend();
        const a = nodes.get(road.a),
          b = nodes.get(road.b),
          required =
            (wall.width +
              (wall.edgeWidth ?? WALL_EDGE_WIDTH) +
              STREET_WIDTHS[road.kind] +
              STREET_EDGE_WIDTH) /
              2 +
            0.5;
        const distance = segmentDistance(section.a, section.b, a, b);
        if (distance < required) {
          emit(
            'defense',
            wall.id,
            'wall-clearance',
            'The candidate street corridor conflicts with this wall.',
            [road.id],
            { newDistance: distance, requiredDistance: required },
          );
          break;
        }
      }
  }
  for (const tower of city.towers ?? [])
    for (const road of changedRoads) {
      spend();
      const a = nodes.get(road.a),
        b = nodes.get(road.b),
        required = tower.radius + (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + 0.5,
        distance = distanceToSegment(tower.center, a, b);
      if (distance < required)
        emit(
          'defense',
          tower.id,
          'tower-clearance',
          'The candidate street corridor conflicts with this tower.',
          [road.id, tower.wallId],
          { newDistance: distance, requiredDistance: required },
        );
    }
  for (const gate of city.gates ?? [])
    if (measures.has(gate.wallId))
      for (const post of gatePosts(gate, measures.get(gate.wallId)))
        for (const road of changedRoads) {
          spend();
          const a = nodes.get(road.a),
            b = nodes.get(road.b),
            required = gate.postRadius + (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2,
            distance = distanceToSegment(post, a, b);
          if (distance < required)
            emit(
              'defense',
              gate.id,
              'gate-clearance',
              'The candidate street corridor conflicts with this gatepost.',
              [road.id, gate.wallId],
              { newDistance: distance, requiredDistance: required },
            );
        }
}

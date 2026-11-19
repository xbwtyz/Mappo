import {
  createRng,
  randomRange
} from '../core/prng.js';
import {
  polygonSignedArea
} from '../core/geometry.js';
import {
  STREET_WIDTHS,
  STREET_EDGE_WIDTH,
  PROPERTY_SETBACK,
  rectangleInFrame,
  rectanglesOverlap,
  propertyFits,
  clipToConvexPolygon
} from '../core/placement.js';

function keyedPair(a, b) {
  return [a, b].sort().join(':');
}

function choose(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function worldPoint(frame, u, v) {
  return {
    x: frame.origin.x + frame.tangent.x * u + frame.inward.x * v,
    y: frame.origin.y + frame.tangent.y * u + frame.inward.y * v
  };
}

export function generateBuildings(seed, layout) {
  const nodes = new Map(layout.nodes.map(n => [n.id, n]));
  const roadByPair = new Map(layout.roads.map(r => [keyedPair(r.a, r.b), r]));
  const plots = [],
    properties = [],
    buildings = [],
    openSpaces = [];
  for (const block of layout.blocks) {
    const rng = createRng(`${seed}:buildings:v1:${block.id}`);
    const polygon = block.vertices.map(id => nodes.get(id));
    const edges = block.vertices.map((id, i) => {
      const next = block.vertices[(i + 1) % block.vertices.length];
      return {
        a: nodes.get(id),
        b: nodes.get(next),
        road: roadByPair.get(keyedPair(id, next))
      };
    });
    const accepted = [];
    // A separate seeded occupancy level per block avoids identical density.
    const occupancy = randomRange(rng, .64, .94);
    const fronts = edges.map((edge, index) => {
      const length = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
      const frame = {
        origin: edge.a,
        tangent: {
          x: (edge.b.x - edge.a.x) / length,
          y: (edge.b.y - edge.a.y) / length
        },
        inward: {
          x: -(edge.b.y - edge.a.y) / length,
          y: (edge.b.x - edge.a.x) / length
        }
      };
      const distance = (STREET_WIDTHS[edge.road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK + .05;
      // Each frontage is divided once; merged sites consume contiguous entries.
      const intervals = [];
      let start = distance + 1;
      const end = length - distance - 1;
      while (end - start >= 8) {
        let width = Math.min(randomRange(rng, 11, 19), end - start);
        if (end - start - width < 8) width = end - start;
        intervals.push({
          start,
          width,
          occupied: false
        });
        start += width;
      }
      return {
        edge,
        index,
        frame,
        distance,
        intervals,
        priority: rng()
      };
    }).filter(f => f.intervals.length);
    fronts.sort((a, b) => b.intervals.length - a.intervals.length || a.priority - b.priority);

    function allocate(front, first, count, category) {
      const group = front.intervals.slice(first, first + count);
      if (group.length !== count || group.some(p => p.occupied)) return false;
      const start = group[0].start + .75,
        width = group.reduce((s, p) => s + p.width, 0) - 1.5;
      if (width < 7) return false;
      const preferredDepth = category === 'large' ? randomRange(rng, 24, 43) : randomRange(rng, 12, 25);
      let envelope, depth = preferredDepth;
      for (; depth >= 9; depth -= 3) {
        envelope = rectangleInFrame(front.frame, start, front.distance, width, depth);
        if (propertyFits(envelope, polygon, edges) && !accepted.some(p => rectanglesOverlap(envelope, p.boundary, .9))) break;
      }
      if (depth < 9) return false;
      const propertyId = `PROP-${String(properties.length+1).padStart(5,'0')}`;
      const propertyPlots = [];
      let cursor = start;
      group.forEach((interval, i) => {
        const w = interval.width - (i === 0 ? .75 : 0) - (i === group.length - 1 ? .75 : 0);
        const plot = {
          id: `PLOT-${String(plots.length+1).padStart(5,'0')}`,
          blockId: block.id,
          propertyId,
          frontageRoadId: front.edge.road.id,
          boundary: rectangleInFrame(front.frame, cursor, front.distance, w, depth)
        };
        propertyPlots.push(plot);
        plots.push(plot);
        cursor += w;
        interval.occupied = true;
      });
      const property = {
        id: propertyId,
        blockId: block.id,
        plotIds: propertyPlots.map(p => p.id),
        boundary: envelope,
        frontageRoadId: front.edge.road.id,
        frontage: [envelope[0], envelope[1]],
        area: Math.abs(polygonSignedArea(envelope)),
        buildingIds: [],
        usage: category === 'large' ? 'establishment' : 'residential',
        frame: front.frame,
        local: {
          x: start,
          y: front.distance,
          width,
          depth
        }
      };
      properties.push(property);
      accepted.push(property);
      populateProperty(property, propertyPlots, rng, buildings);
      return true;
    }
    // Larger properties are allocated before the single-plot infill pass.
    let largeCount = 0;
    const largeTarget = block.area > 10000 ? 2 : 1;
    for (const front of fronts) {
      if (largeCount >= largeTarget) break;
      const count = front.intervals.length >= 4 && rng() < .55 ? 3 : 2;
      const first = Math.floor(rng() * Math.max(1, front.intervals.length - count + 1));
      if (rng() < .84 && allocate(front, first, count, 'large')) largeCount++;
    }
    // Most frontages get small, varied buildings; occasional paired plots make
    // wider workshops and inns even in blocks without a landmark-sized site.
    for (const front of fronts)
      for (let i = 0; i < front.intervals.length; i++) {
        if (front.intervals[i].occupied || rng() > occupancy) continue;
        const count = i + 1 < front.intervals.length && !front.intervals[i + 1].occupied && rng() < .17 ? 2 : 1;
        allocate(front, i, count, count > 1 ? 'large' : 'small');
      }
    const occupiedArea = accepted.reduce((sum, p) => sum + p.area, 0);
    openSpaces.push({
      id: `OPEN-${block.id}`,
      blockId: block.id,
      kind: accepted.length ? 'yards-and-gaps' : 'undeveloped',
      area: Math.max(0, block.area - occupiedArea)
    });
  }
  return {
    plots,
    properties,
    buildings,
    openSpaces
  };
}

export function populateProperty(property, propertyPlots, rng, buildings) {
  const {
    frame,
    local
  } = property;
  const x = local.x + randomRange(rng, 1, 1.7),
    y = local.y + randomRange(rng, 1.1, 2);
  const width = local.width - (x - local.x) - randomRange(rng, 1, 2.3);
  const depth = local.depth - (y - local.y) - randomRange(rng, 1.1, 3);
  const merged = property.plotIds.length > 1;
  let shape = 'rectangle';
  const roll = rng();
  if (merged && width > 27 && depth > 24 && roll < .25) shape = 'courtyard';
  else if (merged && width > 27 && depth > 20 && roll < .49) shape = 'compound';
  else if (merged && width > 28 && roll > .82) shape = 'terrace';
  else if (width > 13 && depth > 13 && roll < .76) shape = 'L';
  const type = merged ? choose(rng, ['inn', 'workshop', 'guildhall', 'temple', 'warehouse']) : choose(rng, ['house', 'house', 'shop', 'workshop']);
  property.usage = type;

  function add(footprint, holes = [], form = shape, buildingType = type) {
    const building = {
      id: `BLD-${String(buildings.length+1).padStart(5,'0')}`,
      blockId: property.blockId,
      propertyId: property.id,
      plotIds: propertyPlots.filter(p => Math.abs(polygonSignedArea(clipToConvexPolygon(footprint, p.boundary))) - holes.reduce((sum, h) => sum + Math.abs(polygonSignedArea(clipToConvexPolygon(h, p.boundary))), 0) > 1e-5).map(p => p.id),
      frontageRoadId: property.frontageRoadId,
      type: buildingType,
      shape: form,
      footprint,
      holes,
      area: Math.abs(polygonSignedArea(footprint)) - holes.reduce((s, h) => s + Math.abs(polygonSignedArea(h)), 0),
      entrance: {
        x: (footprint[0].x + footprint[1].x) / 2,
        y: (footprint[0].y + footprint[1].y) / 2
      },
      orientation: Math.atan2(frame.tangent.y, frame.tangent.x),
      roofTone: Math.floor(rng() * 5)
    };
    const doorU = (building.entrance.x - frame.origin.x) * frame.tangent.x + (building.entrance.y - frame.origin.y) * frame.tangent.y;
    building.accessPath = [building.entrance, worldPoint(frame, doorU, 0)];
    property.buildingIds.push(building.id);
    buildings.push(building);
  }
  const rect = (u, v, w, d) => rectangleInFrame(frame, u, v, w, d);
  if (shape === 'courtyard') {
    const wall = Math.min(7, width * .22, depth * .25);
    add(rect(x, y, width, depth), [rect(x + wall, y + wall, width - wall * 2, depth - wall * 2)]);
  } else if (shape === 'compound') {
    const gap = 3.3,
      wing = Math.min(width * .28, 10);
    add(rect(x, y, wing, depth), [], 'compound-wing');
    add(rect(x + width - wing, y, wing, depth), [], 'compound-wing');
    const backWidth = width - wing * 2 - gap * 2;
    if (backWidth > 6) add(rect(x + wing + gap, y + depth * .61, backWidth, depth * .39), [], 'compound-wing');
  } else if (shape === 'terrace') {
    property.usage = 'residential-row';
    const count = property.plotIds.length;
    let cursor = x;
    propertyPlots.forEach((plot, i) => {
      const plotEnd = (plot.boundary[1].x - frame.origin.x) * frame.tangent.x + (plot.boundary[1].y - frame.origin.y) * frame.tangent.y;
      const partWidth = (i === count - 1 ? x + width : plotEnd) - cursor;
      add(rect(cursor, y, partWidth, depth * randomRange(rng, .75, 1)), [], 'terrace-house', choose(rng, ['house', 'house', 'shop']));
      cursor += partWidth;
    });
  } else if (shape === 'L') {
    const notchX = width * randomRange(rng, .43, .67),
      notchY = depth * randomRange(rng, .4, .6);
    const footprint = [
      [x, y],
      [x + width, y],
      [x + width, y + notchY],
      [x + notchX, y + notchY],
      [x + notchX, y + depth],
      [x, y + depth]
    ].map(([u, v]) => worldPoint(frame, u, v));
    add(footprint);
  } else {
    // Narrow plots have smaller houses, with varied depths and back gardens.
    add(rect(x, y, width, depth * randomRange(rng, .68, 1)));
  }
}

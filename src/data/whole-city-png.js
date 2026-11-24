import { Camera } from '../renderer/camera.js';
import { renderWholeCityMap } from '../renderer/canvas.js';
import { WALL_EDGE_WIDTH, measureWall } from '../core/fortification-geometry.js';
import { gatePosts } from '../core/gate-geometry.js';
import { STREET_EDGE_WIDTH, STREET_WIDTHS } from '../core/placement.js';
import { buildingExteriorRingsS10 } from '../core/building-geometry-adapter-s10.js';
import { downloadCanvasPNG } from './png-export-4f.js';

const WHOLE_CITY_PNG_BASE_PIXELS = 2048;
const WHOLE_CITY_PNG_MAX_PIXELS = 4096;
const WHOLE_CITY_PNG_PADDING = 0.04;

function wholeCityBounds(city, framing) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  function include(point, radius = 0) {
    left = Math.min(left, point.x - radius);
    top = Math.min(top, point.y - radius);
    right = Math.max(right, point.x + radius);
    bottom = Math.max(bottom, point.y + radius);
  }

  if (framing === 'developed') {
    const nodes = new Map(city.nodes.map(node => [node.id, node]));
    for (const road of city.roads) {
      if (!road.bridgeId && (road.waterBoundary || road.terrainBoundary)) continue;
      const radius = road.bridgeId ? 6 : (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2;
      include(nodes.get(road.a), radius);
      include(nodes.get(road.b), radius);
    }
    for (const block of [...city.blocks, city.plaza])
      for (const id of block.vertices) include(nodes.get(id));
    for (const property of city.properties)
      for (const point of property.boundary) include(point);
    for (const plot of city.plots)
      for (const point of plot.boundary) include(point);
    for (const building of city.buildings)
      for (const ring of buildingExteriorRingsS10(building))
        for (const point of ring) include(point);
    if (city.fortificationState?.enabled && city.fortificationState.status === 'built') {
      const walls = new Map(city.walls.map(wall => [wall.id, wall]));
      for (const wall of city.walls)
        for (const point of wall.path) include(point, (wall.width + (wall.edgeWidth ?? WALL_EDGE_WIDTH)) / 2);
      for (const gate of city.gates) {
        for (const point of gate.connection.points) include(point, (gate.connection.width + STREET_EDGE_WIDTH) / 2);
        for (const post of gatePosts(gate, measureWall(walls.get(gate.wallId).path))) include(post, gate.postRadius);
      }
      for (const tower of city.towers) include(tower.center, tower.radius);
    }
  }

  const usedSurvey = left === Infinity;
  if (usedSurvey)
    for (const point of city.survey.boundary) include(point);
  if (![left, top, right, bottom].every(Number.isFinite) || left >= right || top >= bottom)
    throw new Error('The accepted city has no usable map bounds.');
  return { left, top, right, bottom, usedSurvey };
}

export function planWholeCityPNG(city, framing, longestSide) {
  if (framing !== 'developed' && framing !== 'survey')
    throw new Error('Choose a whole-city framing option.');
  if (longestSide !== WHOLE_CITY_PNG_BASE_PIXELS && longestSide !== WHOLE_CITY_PNG_MAX_PIXELS)
    throw new Error('Choose a supported whole-city PNG resolution.');

  const { left, top, right, bottom, usedSurvey } = wholeCityBounds(city, framing);
  const padding = Math.max(right - left, bottom - top) * WHOLE_CITY_PNG_PADDING;
  const spanX = right - left + padding * 2;
  const spanY = bottom - top + padding * 2;
  const longestSpan = Math.max(spanX, spanY);
  return {
    width: Math.round(longestSide * spanX / longestSpan),
    height: Math.round(longestSide * spanY / longestSpan),
    centerX: left + (right - left) / 2,
    centerY: top + (bottom - top) / 2,
    spanX,
    spanY,
    pixelScale: longestSide / WHOLE_CITY_PNG_BASE_PIXELS,
    usedSurvey
  };
}

export async function downloadWholeCityPNG(city, layers, framing, longestSide, filename, environment = globalThis) {
  const plan = planWholeCityPNG(city, framing, longestSide);
  const camera = new Camera();
  camera.resize(plan.width / plan.pixelScale, plan.height / plan.pixelScale);
  camera.x = plan.centerX;
  camera.y = plan.centerY;
  // Export framing can exceed the interactive camera's zoom limits.
  camera.zoom = Math.min(camera.width / plan.spanX, camera.height / plan.spanY);
  const exportCanvas = environment.document.createElement('canvas');
  try {
    renderWholeCityMap(exportCanvas, camera, city, layers, plan.pixelScale);
    if (exportCanvas.width !== plan.width || exportCanvas.height !== plan.height)
      throw new Error('The browser could not allocate the requested PNG size. Try 2,048 px.');
    return await downloadCanvasPNG(exportCanvas, filename, environment, 'whole-city map');
  } finally {
    exportCanvas.width = 0;
    exportCanvas.height = 0;
  }
}

import { boundsOf, pointInPolygon, polygonSignedArea } from './geometry.js';

export const BUILDING_TRANSFORM_LIMITS = Object.freeze({ minimumScale: 0.2, maximumScale: 4 });
export const EMPTY_BUILDING_TRANSFORM = Object.freeze({ dx: 0, dy: 0, angle: 0, scaleX: 1, scaleY: 1 });

export function buildingFrame(building) {
  if (!Array.isArray(building?.footprint) || building.footprint.length < 3) throw new Error('A building needs a footprint.');
  const b = boundsOf(building.footprint);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2,
    width: Math.max(1e-6, b.maxX - b.minX), height: Math.max(1e-6, b.maxY - b.minY) };
}

export function normalizeBuildingTransform(values = {}) {
  const value = { ...EMPTY_BUILDING_TRANSFORM, ...values };
  for (const key of ['dx', 'dy', 'angle', 'scaleX', 'scaleY'])
    if (!Number.isFinite(value[key])) throw new Error('Building transform fields must be finite numbers.');
  for (const key of ['scaleX', 'scaleY'])
    if (value[key] < BUILDING_TRANSFORM_LIMITS.minimumScale || value[key] > BUILDING_TRANSFORM_LIMITS.maximumScale)
      throw new Error('Preview scale must remain between 20% and 400%.');
  if (Math.abs(value.dx) > 1e5 || Math.abs(value.dy) > 1e5 || Math.abs(value.angle) > Math.PI * 400)
    throw new Error('Preview position or rotation is outside the supported range.');
  return value;
}

export function buildingTransformDirty(value) {
  return Boolean(value && (Math.abs(value.dx) > 1e-8 || Math.abs(value.dy) > 1e-8
    || Math.abs(value.angle) > 1e-8 || Math.abs(value.scaleX - 1) > 1e-8
    || Math.abs(value.scaleY - 1) > 1e-8));
}

export function transformBuildingPoint(point, frame, input = {}) {
  const transform = normalizeBuildingTransform(input);
  const x = (point.x - frame.x) * transform.scaleX;
  const y = (point.y - frame.y) * transform.scaleY;
  const c = Math.cos(transform.angle), s = Math.sin(transform.angle);
  return { x: frame.x + transform.dx + x * c - y * s, y: frame.y + transform.dy + x * s + y * c };
}

export function previewBuildingGeometry(building, input = {}) {
  const transform = normalizeBuildingTransform(input);
  const frame = buildingFrame(building);
  const map = point => transformBuildingPoint(point, frame, transform);
  const footprint = building.footprint.map(map);
  const holes = (building.holes ?? []).map(hole => hole.map(map));
  const area = Math.abs(polygonSignedArea(footprint))
    - holes.reduce((total, hole) => total + Math.abs(polygonSignedArea(hole)), 0);
  return { ...building, footprint, holes,
    entrance: building.entrance ? map(building.entrance) : null,
    accessPath: (building.accessPath ?? []).map(map),
    orientation: (building.orientation ?? 0) + transform.angle,
    area
  };
}

export function buildingPreviewPivot(building, transform = EMPTY_BUILDING_TRANSFORM) {
  const frame = buildingFrame(building);
  return { x: frame.x + transform.dx, y: frame.y + transform.dy };
}

export function buildingPreviewHandles(building, input = {}, zoom = 1) {
  const transform = normalizeBuildingTransform(input);
  const frame = buildingFrame(building);
  const rot = transform.angle, c = Math.cos(rot), s = Math.sin(rot);
  const halfW = frame.width * transform.scaleX / 2, halfH = frame.height * transform.scaleY / 2;
  const center = buildingPreviewPivot(building, transform);
  const localPoint = (sx, sy, outside = 0) => ({
    x: center.x + sx * halfW * c - (sy * halfH + outside) * s,
    y: center.y + sx * halfW * s + (sy * halfH + outside) * c
  });
  const points = [];
  for (const [sx, sy] of [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]])
    points.push({ ...localPoint(sx, sy), kind: 'resize', sx, sy });
  points.push({ ...localPoint(0, -1, -28 / Math.max(0.18, zoom)), kind: 'rotate', sx: 0, sy: -1 });
  return points;
}

export function buildingPreviewHit(building, transform, point, tool, zoom = 1) {
  const handles = buildingPreviewHandles(building, transform, zoom);
  if (tool === 'rotate' || tool === 'resize') {
    const hits = handles.filter(h => h.kind === tool)
      .map(handle => ({ handle, d: Math.hypot(handle.x - point.x, handle.y - point.y) * zoom }))
      .filter(x => x.d <= 13).sort((a,b) => a.d - b.d);
    return hits[0]?.handle ?? null;
  }
  if (tool !== 'move') return null;
  const preview = previewBuildingGeometry(building, transform);
  if (!pointInPolygon(point, preview.footprint) ||
    preview.holes.some(hole => pointInPolygon(point, hole))) return null;
  return { kind: 'move' };
}

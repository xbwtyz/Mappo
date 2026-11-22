import { roadInspectionDetails } from './road-inspection.js';

// Pure screen-distance targeting: never edits graph records or grants Apply.
export const JUNCTION_SNAP_CAPTURE_PX = 12;
export const JUNCTION_SNAP_RELEASE_PX = 18;
export function findEligibleJunctionTarget(graph, sourceId, point, zoom, previousId = null,
  capturePx = JUNCTION_SNAP_CAPTURE_PX, releasePx = JUNCTION_SNAP_RELEASE_PX) {
  if (!graph?.valid || !graph.nodesById.has(sourceId) || !Number.isFinite(zoom) || zoom <= 0 ||
      !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  const eligible = id => id !== sourceId &&
    roadInspectionDetails(graph, {kind:'junction',id})?.movable;
  const measure = id => {
    if (!eligible(id)) return null;
    const node = graph.nodesById.get(id);
    const distancePx = Math.hypot(point.x-node.x,point.y-node.y)*zoom;
    return Number.isFinite(distancePx) ? {id,x:node.x,y:node.y,distancePx} : null;
  };
  if (previousId) {
    const previous = measure(previousId);
    if (previous && previous.distancePx <= releasePx) return previous;
  }
  let best = null;
  for (const id of graph.nodesById.keys()) {
    const candidate = measure(id);
    if (!candidate || candidate.distancePx > capturePx) continue;
    if (!best || candidate.distancePx < best.distancePx-1e-8 ||
        (Math.abs(candidate.distancePx-best.distancePx)<=1e-8 && candidate.id.localeCompare(best.id)<0))
      best = candidate;
  }
  return best;
}

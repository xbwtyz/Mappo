// Detached variant of src/core/validate-layout.js at a242f4e33b346a65d2f16b41959f2b4039a1712b.
import {
  polygonSignedArea
} from '../../../src/core/geometry.js';

// Fail closed if a numerical edge case would otherwise publish malformed city
// data. Draft outlines and the last good city remain available for correction.
export function validateSquarelessLayout(layout, boundary) {
  const {
    nodes,
    roads,
    blocks
  } = layout;
  const byId = new Map(nodes.map(n => [n.id, n])),
    graph = new Map(nodes.map(n => [n.id, []]));
  for (const road of roads) {
    graph.get(road.a).push(road.b);
    graph.get(road.b).push(road.a);
  }
  const reached = new Set([nodes[0]?.id]),
    queue = [nodes[0]?.id];
  for (let i = 0; i < queue.length; i++)
    for (const id of graph.get(queue[i]) || [])
      if (!reached.has(id)) {
        reached.add(id);
        queue.push(id);
      }
  if (reached.size !== nodes.length) throw new Error('The outline produced disconnected streets. Adjust its narrow sections or try another street pattern.');
  let total = 0;
  for (const face of [...blocks, ...(layout.waterFaces ?? []), ...(layout.terrainFaces ?? [])]) {
    if (new Set(face.vertices).size !== face.vertices.length) throw new Error('A street creates a pinched block. Adjust the outline or choose another street seed.');
    const area = polygonSignedArea(face.vertices.map(id => byId.get(id)));
    if (area <= ((layout.waterFaces?.includes(face) || layout.terrainFaces?.includes(face)) ? .00001 : 1)) throw new Error('A section is too narrow to form usable blocks. Widen it and generate again.');
    total += area;
  }
  if (Math.abs(total - Math.abs(polygonSignedArea(boundary))) > .02) throw new Error('Streets could not cover this outline completely. Adjust its narrow sections or choose another pattern.');
}

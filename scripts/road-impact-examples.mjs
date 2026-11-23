// Development-only report excerpts; never called by the offline application.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { inspectJunctionImpact } from '../src/core/road-impact.js';
import { APP_VERSION } from '../src/core/version.js';

const project = createProject({ seed: 'a3-test', morphology: 'organic' });
const graph = buildRoadGraph(project.city);
const junctionId = [...graph.nodesById.keys()].find((id) =>
  graph.incidentRoads.get(id).every((roadId) => !graph.roadClasses.get(roadId).protected),
);
const point = graph.nodesById.get(junctionId);
const empty = createProject({ seed: 'a3-test', morphology: 'organic' });
empty.city.properties = [];
empty.city.plots = [];
empty.city.buildings = [];
empty.city.openSpaces = empty.city.blocks.map((block) => ({
  id: `OPEN-${block.id}`,
  blockId: block.id,
  kind: 'undeveloped',
  area: block.area,
}));
const fixture = JSON.parse(
  await readFile(new URL('../tests/fixtures/road-generation-parity-0.1.json', import.meta.url), 'utf8'),
).fixtures.at(-2);
const wet = createProject(fixture.options);
const bridgeRoad = wet.city.roads.find((road) => road.bridgeId);
const wetNode = wet.city.nodes.find((node) => node.id === bridgeRoad.a);
const cases = [
  ['unchanged', 'safe', inspectJunctionImpact(project, junctionId, point)],
  [
    'undeveloped-junction-move',
    'safe',
    inspectJunctionImpact(empty, junctionId, { x: point.x + 0.01, y: point.y + 0.01 }),
  ],
  [
    'frontage-review',
    'needs-review',
    inspectJunctionImpact(project, junctionId, { x: point.x + 0.01, y: point.y + 0.01 }),
  ],
  [
    'crossing-network',
    'invalid',
    inspectJunctionImpact(project, junctionId, { x: point.x + 100, y: point.y + 100 }),
  ],
  [
    'protected-bridge',
    'invalid',
    inspectJunctionImpact(wet, wetNode.id, { x: wetNode.x + 0.1, y: wetNode.y + 0.1 }),
  ],
];
const examples = cases.map(([name, expected, report]) => {
  assert.equal(report.status, expected, `${name}: expected classification`);
  const { preservedIds, preservedObjects, metrics, ...rest } = report;
  return {
    name,
    ...rest,
    preservedIdSample: preservedIds.slice(0, 12),
    metrics: { ...metrics, faces: metrics.faces.filter((face) => face.geometryChanged) },
  };
});
const output = {
  appVersion: APP_VERSION,
  note: 'Report excerpts omit unchanged face metrics and full preserved-ID/object lists; affected/issue rows are complete. No accepted city was edited.',
  source: 'node scripts/road-impact-examples.mjs',
  examples,
};
await writeFile(
  new URL('../docs/history/0.2/roads/a3-impact-examples.json', import.meta.url),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(`Wrote ${examples.length} impact report excerpts.`);

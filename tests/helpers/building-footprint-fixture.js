import { addRectangularCourtyardF1, attachBuildingWingF1, moveFootprintVertexF1 } from '../../src/core/building-footprint-f1.js';
import { buildingFrame } from '../../src/core/building-transform.js';
import { prepareBuildingCandidate } from '../../src/editor/building-application.js';
import { hydrateProjectS10 } from '../../src/core/building-project-s10.js';

export function findDirectFootprintFixture(project) {
  hydrateProjectS10(project);
  for (const building of project.city.buildings.slice(0, 100)) {
    if (building.footprint.length !== 4 || building.holes.length) continue;
    const frame = buildingFrame(building);
    const courtyard = { center: { x: frame.x, y: frame.y }, width: 0.15, depth: 0.15 };
    const vertex = building.footprint[2];
    const moved = { x: vertex.x * .98 + frame.x * .02, y: vertex.y * .98 + frame.y * .02 };
    try {
      if (!prepareBuildingCandidate(project, building.id, {}, moveFootprintVertexF1(building, 2, moved)).ok) continue;
      const wing = { start: .25, end: .75, depth: .15 };
      const extended = attachBuildingWingF1(building, 1, wing);
      if (!prepareBuildingCandidate(project, building.id, {}, extended).ok) continue;
      if (!prepareBuildingCandidate(project, building.id, {}, addRectangularCourtyardF1(extended, courtyard)).ok) continue;
      return { building, wing, courtyard, vertex, moved };
    } catch {
      // Skip a building whose shape cannot accept all of the test edits.
    }
  }
  throw new Error('Could not find a building with space for direct footprint editing.');
}

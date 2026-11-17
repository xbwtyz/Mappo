import {
  distanceContourWall,
  WALL_WIDTH,
  WALL_EDGE_WIDTH,
  WALL_CLEARANCE
} from '../core/fortification-geometry.js';
import {
  choosePerimeterGates
} from './gates.js';
import {
  placePerimeterTowers
} from './towers.js';
import {
  validateFortifications,
  setFortificationsEnabled
} from '../core/fortification-model.js';

export function normalizeFortificationSettings(options = {}) {
  const gateCount = Number(options.gateCount ?? 4),
    towerSpacing = Number(options.towerSpacing ?? 100),
    seed = String(options.seed ?? 'fortifications').slice(0, 64) || 'fortifications';
  if (!Number.isInteger(gateCount) || gateCount < 1 || gateCount > 8) throw new Error('Choose 1–8 gates.');
  if (!Number.isFinite(towerSpacing) || towerSpacing < 40 || towerSpacing > 200) throw new Error('Tower spacing must be 40–200 units.');
  return {
    enabled: options.enabled !== false,
    gateCount,
    towerSpacing,
    seed,
    algorithm: options.algorithm ?? 'outer-perimeter-v1'
  };
}

function outerPerimeterFortifications(city, settings) {
  const wall = {
    id: 'WALL-001',
    dataVersion: 1,
    kind: 'perimeter',
    width: WALL_WIDTH,
    edgeWidth: WALL_EDGE_WIDTH,
    path: distanceContourWall(city.survey.boundary),
    extensions: {}
  };
  const gates = choosePerimeterGates(city, wall, {
    seed: settings.seed,
    count: settings.gateCount
  });
  if (!gates.length) throw new Error('A fortified city needs at least one connected gate.');
  const towers = placePerimeterTowers(wall, gates, {
    seed: settings.seed,
    spacing: settings.towerSpacing
  });
  return {
    ...city,
    walls: [wall],
    gates,
    towers,
    fortificationState: {
      version: 1,
      status: 'built',
      enabled: true,
      algorithm: settings.algorithm,
      seed: settings.seed,
      requestedGateCount: settings.gateCount,
      gateCount: gates.length,
      towerSpacing: settings.towerSpacing,
      clearance: WALL_CLEARANCE
    }
  };
}
export const FORTIFICATION_BUILDERS = Object.freeze({
  'outer-perimeter-v1': outerPerimeterFortifications
});
export function generateFortifications(city, options = {}) {
  if (options.enabled === false) return setFortificationsEnabled(city, false);
  const settings = normalizeFortificationSettings(options);
  if (!settings.enabled) return setFortificationsEnabled(city, false);
  const builder = FORTIFICATION_BUILDERS[settings.algorithm];
  if (!builder) throw new Error('Unsupported fortification algorithm.');
  const next = builder(city, settings);
  validateFortifications(next);
  return next;
}

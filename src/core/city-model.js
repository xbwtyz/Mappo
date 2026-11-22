import { stampRoadGenerated } from './road-provenance.js';
import {
  terrainPrepare
} from './terrain-geometry.js';
import {
  validateTerrainDefinition,
  validateTerrainCity
} from './terrain-model.js';
import {
  prepareWater
} from '../generators/water.js';
import {
  validateWaterDefinition,
  validateWaterCity
} from './water-model.js';
import {
  generateFortifications
} from '../generators/fortifications.js';
import {
  generateDistricts
} from '../generators/districts.js';
import {
  APP_VERSION,
  PROJECT_SCHEMA_VERSION
} from './version.js';
import {
  normalizeSeed,
  createRng
} from './prng.js';
import {
  generateSurvey,
  SIZE_PRESETS,
  MORPHOLOGY_PRESETS
} from '../generators/survey.js';
import {
  cleanOutline,
  findCityCenter,
  insideOrOn,
  clearance,
  checkNarrowSections
} from './boundary.js';
import {
  validateLayout
} from './validate-layout.js';
import {
  generateLayout
} from '../generators/layout.js';

import {
  validateDevelopment
} from './validate-development.js';
import {
  generateBuildings
} from '../generators/buildings.js';

const FIRST = ['Alder', 'Ash', 'Briar', 'Brindle', 'Cinder', 'Elder', 'Fell', 'Grey', 'High', 'Iron', 'Moss', 'Raven', 'Silver', 'Stone', 'Thorn', 'Willow'];
const LAST = ['bridge', 'bury', 'crest', 'dale', 'ford', 'haven', 'mere', 'mont', 'stead', 'watch', 'wick', 'wood'];

export function createProject(options = {}) {
  const seed = normalizeSeed(options.seed);
  const size = Object.hasOwn(SIZE_PRESETS, options.size) ? options.size : 'medium';
  const morphology = MORPHOLOGY_PRESETS.includes(options.morphology) ? options.morphology : 'radial';
  const nameRng = createRng(`${seed}:name:v1`);
  const name = FIRST[Math.floor(nameRng() * FIRST.length)] + LAST[Math.floor(nameRng() * LAST.length)];
  const survey = generateSurvey(seed, size, morphology, options.shapeOptions);
  if (options.boundary) {
    survey.boundary = cleanOutline(options.boundary, 0);
    checkNarrowSections(survey.boundary);
  }
  const center = options.center ? {
    x: options.center.x,
    y: options.center.y
  } : findCityCenter(survey.boundary);
  if (!insideOrOn(center, survey.boundary) || clearance(center, survey.boundary) < 18) throw new Error('Place the town center inside the outline, at least 18 units from its edge.');
  survey.anchors = [{
    id: 'SITE-00',
    kind: 'center',
    ...center
  }, ...survey.anchors.slice(1).filter(p => insideOrOn(p, survey.boundary))];
  const water = prepareWater(options.water);
  validateWaterDefinition(water.features, water.bridges, survey.boundary, center);
  const terrain = terrainPrepare(options.terrain);
  validateTerrainDefinition(terrain.features, terrain.passes, survey.boundary, center, water);
  const layout = generateLayout(seed, size, survey, morphology, water, terrain);
  validateLayout(layout, survey.boundary);
  const development = generateBuildings(seed, layout, options.irregularProperties === true ? morphology : null);
  validateDevelopment(layout, development);
  const project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    generatorVersion: APP_VERSION,
    seed,
    options: {
      size,
      morphology,
      boundary: survey.boundary.map(p => ({
        ...p
      })),
      center: {
        ...center
      }
    },
    city: {
      id: `city-${seed.replace(/[^\w-]/g, '-').toLowerCase().slice(0, 24)}`,
      name,
      survey,
      waterState: water.state,
      waterFeatures: water.features,
      bridges: water.bridges,
      waterFaces: layout.waterFaces,
      terrainFeatures: terrain.features,
      terrainPasses: terrain.passes,
      terrainFaces: layout.terrainFaces,
      nodes: layout.nodes,
      roads: layout.roads,
      blocks: layout.blocks,
      plaza: layout.plaza,
      ...development,
      districts: [],
      districtState: {
        version: 1,
        status: 'unassigned'
      },
      walls: [],
      gates: [],
      towers: [],
      fortificationState: {
        version: 1,
        status: 'unbuilt',
        enabled: false
      }
    }
  };
  validateWaterCity(project.city);
  validateTerrainCity(project.city);
  project.city = generateDistricts(project.city, {
    seed,
    count: options.districtCount ?? 'auto'
  });
  if (options.fortifications?.enabled) project.city = generateFortifications(project.city, {
    seed,
    ...options.fortifications
  });
  const plots = new Map(project.city.plots.map(plot => [plot.id, plot]));
  for (const property of project.city.properties)
    stampRoadGenerated(property, property.plotIds.map(id => plots.get(id)));
  for (const building of project.city.buildings) stampRoadGenerated(building);
  return project;
}

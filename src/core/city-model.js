import { normalizeSeed, createRng } from './prng.js';
import { generateSurvey, SIZE_PRESETS } from '../generators/survey.js';
import { generateLayout } from '../generators/layout.js';

const FIRST = ['Alder', 'Ash', 'Briar', 'Brindle', 'Cinder', 'Elder', 'Fell', 'Grey', 'High', 'Iron', 'Moss', 'Raven', 'Silver', 'Stone', 'Thorn', 'Willow'];
const LAST = ['bridge', 'bury', 'crest', 'dale', 'ford', 'haven', 'mere', 'mont', 'stead', 'watch', 'wick', 'wood'];

export function createProject(options = {}) {
  const seed = normalizeSeed(options.seed);
  const size = Object.hasOwn(SIZE_PRESETS, options.size) ? options.size : 'medium';
  const nameRng = createRng(`${seed}:name:v1`);
  const name = FIRST[Math.floor(nameRng() * FIRST.length)] + LAST[Math.floor(nameRng() * LAST.length)];
  const survey = generateSurvey(seed, size);
  const layout = generateLayout(seed, size, survey);
  return {
    schemaVersion: 1,
    generatorVersion: '0.1-dev.2',
    seed,
    options: { size },
    city: {
      id: `city-${seed.replace(/[^\w-]/g, '-').toLowerCase().slice(0, 24)}`,
      name,
      survey,
      nodes: layout.nodes,
      roads: layout.roads,
      blocks: layout.blocks,
      plaza: layout.plaza,
      buildings: [],
      districts: [],
      walls: []
    }
  };
}

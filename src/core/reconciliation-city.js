import { hydrateBuildingS10 } from './building-project-s10.js';

export function* hydrateLareCity(city) {
  for (let i = 0; i < city.buildings.length; i++) {
    if (i % 16 === 0) yield { stage: 'building-projections' };
    hydrateBuildingS10(city.buildings[i], i !== 0);
  }
  return city;
}

export function* cloneLareCity(city, clone) {
  const entries = [];
  for (const [name, value] of Object.entries(city)) {
    if (!Array.isArray(value)) {
      entries.push([name, clone(value)]);
      continue;
    }
    const records = [];
    for (let i = 0; i < value.length; i += 32) {
      yield { stage: 'candidate-record-copy' };
      records.push(...clone(value.slice(i, i + 32)));
    }
    entries.push([name, records]);
  }
  return yield* hydrateLareCity(Object.fromEntries(entries));
}

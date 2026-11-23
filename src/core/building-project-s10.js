// S10-B P1: pure, detached Schema 9 -> Schema 10 building migration.
// No generator, editor, persistent store, or accepted project is mutated.
import { legacyBuildingShapeToS10 } from './building-geometry-adapter-s10.js';

const clone = value => JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function migrateBuildingRecordS10(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw Error('S10 migration requires a building record.');
  // Unsupported extension fields must never be silently replaced with our
  // canonical model. This includes opaque, otherwise compatible metadata.
  if (own(source, 'geometry') || own(source, 'components'))
    throw Error('S10 migration cannot overwrite existing geometry or components metadata.');
  const {geometry, components} = legacyBuildingShapeToS10(source);
  const converted = clone(source);
  delete converted.footprint;
  delete converted.holes;
  return {...converted, geometry, components};
}

export function migrateSchema9ProjectS10(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      source.schemaVersion !== 9 || !source.city ||
      !Array.isArray(source.city.buildings))
    throw Error('S10 migration requires a valid Schema 9 project with buildings.');
  const proposed = clone(source);
  // The detached candidate is never assigned to accepted state on failure.
  proposed.city.buildings = proposed.city.buildings.map(migrateBuildingRecordS10);
  proposed.schemaVersion = 10;
  return proposed;
}

import { migrateSchema10ProjectS11 } from './migrate-schema11.js';
import {
  waterDryState
} from '../core/water-geometry.js';
import {
  APP_VERSION,
  PROJECT_SCHEMA_VERSION
} from '../core/version.js';
import { migrateSchema9ProjectS10 } from '../core/building-project-s10.js';
// Add one explicit, tested migration per data-schema change. Migration never
// calls the generator: saved geometry and record IDs are authoritative.
export const CURRENT_PROJECT_SCHEMA = PROJECT_SCHEMA_VERSION;
export const CURRENT_FORMAT_VERSION = 1;
export const CURRENT_APP_VERSION = APP_VERSION;

export function migrateProjectData(project) {
  if (!project || typeof project !== 'object') throw new Error('The file has no project data.');
  if (!Number.isInteger(project.schemaVersion) || project.schemaVersion < 1) throw new Error('The project schema is missing or invalid.');
  if (project.schemaVersion > CURRENT_PROJECT_SCHEMA) throw new Error('This project uses a newer data schema. Open it in a newer Mappo build.');
  if (project.schemaVersion === 1) {
    if (!project.city || typeof project.city !== 'object') throw new Error('The legacy project has no city.');
    // 3A.2 projects predate property records. Preserve their empty city blocks.
    for (const key of ['plots', 'properties', 'openSpaces', 'buildings', 'districts', 'walls'])
      if (project.city[key] === undefined) project.city[key] = [];
    project.schemaVersion = 2;
  }
  if (project.schemaVersion === 2) {
    // Old cities remain unassigned; district generation is an explicit action.
    // Preserve opaque district metadata that earlier readers retained.
    project.city.districtState = {
      ...(project.city.districtState || {}),
      version: 1,
      status: 'unassigned'
    };
    project.schemaVersion = 3;
  }
  if (project.schemaVersion === 3) {
    if (project.city.gates === undefined) project.city.gates = [];
    if (project.city.towers === undefined) project.city.towers = [];
    project.city.fortificationState = {
      ...(project.city.fortificationState || {}),
      version: 1,
      status: 'unbuilt',
      enabled: false
    };
    project.schemaVersion = 4;
  }
  if (project.schemaVersion === 4) {
    for (const key of ['waterFeatures', 'bridges', 'waterFaces'])
      if (project.city[key] === undefined) project.city[key] = [];
    project.city.waterState = {
      ...(project.city.waterState || {}),
      ...waterDryState()
    };
    project.schemaVersion = 5;
  }
  // Schema 6 admits coasts; existing river and dry models require no edits.
  if (project.schemaVersion === 5) project.schemaVersion = 6;
  // Composition is additive: keep old features, geometry and drafts intact.
  if (project.schemaVersion === 6) project.schemaVersion = 7;
  // Lakes are additive; older accepted geometry and unfinished drafts stay exact.
  if (project.schemaVersion === 7) project.schemaVersion = 8;
  // Terrain is optional: retain older city and workspace records exactly.
  if (project.schemaVersion === 8) project.schemaVersion = 9;
  if (project.schemaVersion === 9) project = migrateSchema9ProjectS10(project);
  if (project.schemaVersion === 10) return migrateSchema10ProjectS11(project);
  return project;
}

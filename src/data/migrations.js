import {
  APP_VERSION,
  PROJECT_SCHEMA_VERSION
} from '../core/version.js';
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
  return project;
}

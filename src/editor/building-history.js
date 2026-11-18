import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

// Session-only, bounded history of accepted building geometry. Never serialized.
// Identity and other unrelated building fields are intentionally left untouched.
export const BUILDING_GEOMETRY_FIELDS = Object.freeze([
  'footprint', 'holes', 'area', 'orientation', 'plotIds',
  'entrance', 'accessPath', 'frontageRoadId'
]);

const geometryOf = record => Object.fromEntries(
  BUILDING_GEOMETRY_FIELDS.map(key => [key, copyJson(record[key] === undefined ? null : record[key])])
);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const findBuilding = (project,id) => project?.city?.buildings?.find(item => item.id === id);
const lastFor = (list,id) => list.findLastIndex(item => item.buildingId === id);

export class BuildingGeometryHistory {
  constructor(limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid building history limit.');
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  clear() { this.past = []; this.future = []; }
  get history() { return this.past; }
  record(before, after, buildingId) {
    const old = findBuilding(before,buildingId), next = findBuilding(after,buildingId);
    if (!old || !next || old.id !== next.id || old.propertyId !== next.propertyId)
      throw new Error('The accepted building identity changed during Apply.');
    const from = geometryOf(old), to = geometryOf(next);
    if (same(from,to)) return false;
    this.future = this.future.filter(item => item.buildingId !== buildingId);
    this.past.push({buildingId, propertyId:old.propertyId, from, to});
    if (this.past.length > this.limit) this.past.shift();
    return true;
  }
  can(direction, project, buildingId) {
    if (!buildingId || !['undo','redo'].includes(direction)) return false;
    const stack = direction === 'undo' ? this.past : this.future;
    const index = lastFor(stack,buildingId);
    if (index < 0) return false;
    const entry = stack[index], current = findBuilding(project,buildingId);
    return Boolean(current && current.propertyId === entry.propertyId
      && same(geometryOf(current),direction === 'undo' ? entry.to : entry.from));
  }
  count(direction,buildingId) {
    return (direction === 'undo' ? this.past : this.future)
      .filter(item => item.buildingId === buildingId).length;
  }
  prepare(project, workspace, buildingId, direction) {
    if (!this.can(direction,project,buildingId)) return {ok:false,reason:'No compatible building edit to '+direction+'.'};
    const stack = direction === 'undo' ? this.past : this.future;
    const entry = stack[lastFor(stack,buildingId)];
    const target = direction === 'undo' ? entry.from : entry.to;
    try {
      const candidate = copyJson(project);
      const live = findBuilding(candidate,buildingId);
      // Preserve current custom identity/metadata; restore the full geometry
      // record and all dependent fields in one validated project transaction.
      for (const key of BUILDING_GEOMETRY_FIELDS) {
        if (target[key] === null && live[key] === undefined) continue;
        live[key] = copyJson(target[key]);
      }
      validateStoredProject(candidate);
      const roundtrip = decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
      if (!same(roundtrip.project.city,candidate.city))
        throw new Error('Project geometry changed during portable save/load verification.');
      return {ok:true,entry,candidate:roundtrip.project};
    } catch(error) {
      return {ok:false,reason:'Building '+direction+' blocked: '+error.message};
    }
  }
  accept(entry,direction) {
    const source = direction === 'undo' ? this.past : this.future;
    const target = direction === 'undo' ? this.future : this.past;
    const index = source.lastIndexOf(entry);
    if (index < 0) throw new Error('Building history changed during '+direction+'.');
    source.splice(index,1);
    target.push(entry);
    if (target.length > this.limit) target.shift();
  }
}

// S10-B P1: pure, detached Schema 9 -> Schema 10 building migration.
// No generator, editor, persistent store, or accepted project is mutated.
import { legacyBuildingShapeToS10, projectSimpleBuildingS10, reserveBuildingPartIdS10 } from './building-geometry-adapter-s10.js';
import { validateBuildingStructureS10 } from './building-components-s10.js';
import { validateFootprintF1 } from './building-footprint-f1.js';
import { classifyRoadProvenance, stampRoadGenerated } from './road-provenance.js';

const s10ProjectClone = value => JSON.parse(JSON.stringify(value));
const s10ProjectOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function migrateBuildingRecordS10(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw Error('S10 migration requires a building record.');
  // Unsupported extension fields must never be silently replaced with our
  // canonical model. This includes opaque, otherwise compatible metadata.
  if (s10ProjectOwn(source, 'geometry') || s10ProjectOwn(source, 'components'))
    throw Error('S10 migration cannot overwrite existing geometry or components metadata.');
  const {geometry, components} = legacyBuildingShapeToS10(source);
  const converted = s10ProjectClone(source);
  delete converted.footprint;
  delete converted.holes;
  const migrated={...converted, geometry, components};
  // Road generation provenance fingerprints include canonical building fields.
  // A true generated legacy building must stay generated after conversion;
  // altered/custom and unknown provenance are never promoted to generated.
  if (classifyRoadProvenance(source)==='generated') stampRoadGenerated(migrated);
  return migrated;
}

export function migrateSchema9ProjectS10(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      source.schemaVersion !== 9 || !source.city ||
      !Array.isArray(source.city.buildings))
    throw Error('S10 migration requires a valid Schema 9 project with buildings.');
  const proposed = s10ProjectClone(source);
  // The detached candidate is never assigned to accepted state on failure.
  proposed.city.buildings = proposed.city.buildings.map(migrateBuildingRecordS10);
  proposed.schemaVersion = 10;
  return proposed;
}

// S10-B P2/P3: transient, read-only projections for legacy UI consumers.
// These accessor properties are non-enumerable and NEVER enter saved JSON.
// Unsupported complex topology cannot be flattened through this interface.
const s10ProjectLockRing = ring => Object.freeze(ring.map(p => Object.freeze({...p})));
export function hydrateBuildingS10(record, refresh = false) {
  if (!record?.geometry || !record?.components) return record;
  if (Object.prototype.propertyIsEnumerable.call(record,'footprint') ||
      Object.prototype.propertyIsEnumerable.call(record,'holes'))
    throw Error('Schema 10 building has competing writable legacy geometry.');
  if (Object.getOwnPropertyDescriptor(record,'footprint')?.get && !refresh) return record;
  const simple=projectSimpleBuildingS10(record.geometry,record.components);
  const footprint=simple.ok ? s10ProjectLockRing(simple.footprint) : null;
  const holes=simple.ok ? Object.freeze(simple.holes.map(s10ProjectLockRing)) : null;
  Object.defineProperties(record,{
    footprint:{configurable:true,enumerable:false,get:()=>footprint},
    holes:{configurable:true,enumerable:false,get:()=>holes}
  });
  return record;
}
export function hydrateCityS10(city) {
  if (Array.isArray(city?.buildings))
    city.buildings.forEach(hydrateBuildingS10);
  return city;
}
export function hydrateProjectS10(project) {
  if (project?.schemaVersion===10) hydrateCityS10(project.city);
  return project;
}
// Legacy editing is permitted only for one solid root, flat courtyard
// children, and one component. Structural IDs and compatible metadata
// persist across simple transforms; new courtyards receive scoped IDs.
export function writeSimpleBuildingS10(source,shape) {
  if (!source?.geometry || !source?.components)
    throw Error('Schema 10 edit requires a canonical source building.');
  const previous=projectSimpleBuildingS10(source.geometry,source.components);
  if (!previous.ok) throw Error(previous.reason);
  const next=validateFootprintF1(shape);
  const prior=validateBuildingStructureS10(source.geometry,source.components);
  const root=prior.geometry.regions.find(r=>r.parentId===null);
  const oldHoles=prior.geometry.regions.filter(r=>r.kind==='void');
  const reserved=new Set(prior.geometry.regions.map(r=>r.id));
  const children=next.holes.map((ring,i)=>{
    const old=oldHoles[i];
    const id=old?.id ?? reserveBuildingPartIdS10(reserved,'REG-MAN');
    reserved.add(id);
    return {...(old ? s10ProjectClone(old) : {id,parentId:root.id,kind:'void'}),ring};
  });
  const geometry={...s10ProjectClone(source.geometry),regions:[
    {...s10ProjectClone(root),ring:next.footprint},...children
  ]};
  const verified=validateBuildingStructureS10(geometry,source.components);
  const updated={...s10ProjectClone(source),...s10ProjectClone(shape),
    geometry:verified.geometry,components:verified.components,area:next.area};
  delete updated.footprint;
  delete updated.holes;
  return hydrateBuildingS10(updated);
}
// Explicitly convert a new transient legacy-shape building before it is
// inserted in the accepted Schema 10 city.
export function adoptNewBuildingS10(draft) {
  return hydrateBuildingS10(migrateBuildingRecordS10(draft));
}
